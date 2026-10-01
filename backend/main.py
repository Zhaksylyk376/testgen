import json
import os
import shutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, parser, ai, scoring

ROOT = Path(__file__).parent.parent
UPLOADS = ROOT / "uploads"
FRONTEND = ROOT / "frontend"
UPLOADS.mkdir(exist_ok=True)

if (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

db.init_db()

app = FastAPI(title="TestGen")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), language: str = Form("kz"), title: Optional[str] = Form(None)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".docx", ".pdf", ".txt", ".md"):
        raise HTTPException(400, "Поддерживаются только .docx, .pdf, .txt, .md")

    dest = UPLOADS / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        text = parser.extract_text(dest)
    except Exception as e:
        raise HTTPException(400, f"Не удалось извлечь текст: {e}")

    if len(text.strip()) < 200:
        raise HTTPException(400, "Слишком мало текста в файле")

    topics = parser.split_topics(text)
    display_title = title or Path(file.filename).stem

    with db.get_conn() as c:
        cur = c.execute(
            "INSERT INTO tests (title, filename, source_text, language) VALUES (?, ?, ?, ?)",
            (display_title, file.filename, text, language),
        )
        test_id = cur.lastrowid
        for i, t in enumerate(topics):
            c.execute(
                "INSERT INTO topics (test_id, name, idx) VALUES (?, ?, ?)",
                (test_id, t["name"], i),
            )

    return {"test_id": test_id, "title": display_title, "topics_count": len(topics), "language": language}


@app.get("/api/tests")
def list_tests():
    with db.get_conn() as c:
        rows = c.execute(
            """SELECT t.id, t.title, t.language, t.created_at,
                      (SELECT COUNT(*) FROM topics WHERE test_id = t.id) AS topics_count,
                      (SELECT COUNT(*) FROM attempts WHERE test_id = t.id) AS attempts_count
               FROM tests t ORDER BY t.created_at DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/tests/{test_id}")
def get_test(test_id: int):
    with db.get_conn() as c:
        test = c.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
        if not test:
            raise HTTPException(404, "Тест не найден")
        topics = c.execute(
            """SELECT tp.id, tp.name, tp.idx,
                      (SELECT COUNT(*) FROM questions WHERE topic_id = tp.id) AS questions_count
               FROM topics tp WHERE tp.test_id = ? ORDER BY tp.idx""",
            (test_id,),
        ).fetchall()
    return {"test": dict(test), "topics": [dict(t) for t in topics]}


class GenerateReq(BaseModel):
    count: int = 15


@app.post("/api/topics/{topic_id}/generate")
def generate_for_topic(topic_id: int, body: GenerateReq):
    with db.get_conn() as c:
        topic = c.execute("SELECT * FROM topics WHERE id = ?", (topic_id,)).fetchone()
        if not topic:
            raise HTTPException(404, "Тема не найдена")
        test = c.execute("SELECT * FROM tests WHERE id = ?", (topic["test_id"],)).fetchone()
        existing = c.execute("SELECT COUNT(*) AS n FROM questions WHERE topic_id = ?", (topic_id,)).fetchone()
        if existing["n"] > 0:
            c.execute("DELETE FROM questions WHERE topic_id = ?", (topic_id,))

    all_topics = parser.split_topics(test["source_text"])
    content = ""
    for t in all_topics:
        if t["name"] == topic["name"]:
            content = t["content"]
            break
    if not content:
        content = test["source_text"][:8000]

    try:
        questions = ai.generate_questions(topic["name"], content, lang=test["language"], count=body.count)
    except Exception as e:
        raise HTTPException(500, f"Ошибка генерации AI: {e}")

    if not questions:
        raise HTTPException(500, "AI не сгенерировал ни одного вопроса")

    with db.get_conn() as c:
        for q in questions:
            c.execute(
                "INSERT INTO questions (topic_id, type, question, options, correct) VALUES (?, ?, ?, ?, ?)",
                (
                    topic_id,
                    q["type"],
                    q["question"],
                    json.dumps(q["options"], ensure_ascii=False) if q["options"] is not None else None,
                    json.dumps(q["correct"], ensure_ascii=False) if not isinstance(q["correct"], str) else q["correct"],
                ),
            )

    return {"generated": len(questions)}


@app.get("/api/topics/{topic_id}/questions")
def get_questions(topic_id: int, with_answers: bool = False):
    with db.get_conn() as c:
        rows = c.execute("SELECT * FROM questions WHERE topic_id = ? ORDER BY id", (topic_id,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d["options"]:
            try:
                d["options"] = json.loads(d["options"])
            except Exception:
                pass
        if d["type"] == "matching":
            try:
                d["correct"] = json.loads(d["correct"])
            except Exception:
                pass
        if not with_answers:
            d.pop("correct", None)
        out.append(d)
    return out


class SubmitReq(BaseModel):
    user_name: str
    answers: dict  # {question_id: answer}


@app.post("/api/topics/{topic_id}/submit")
def submit(topic_id: int, body: SubmitReq):
    name = body.user_name.strip()[:60]
    if not name:
        raise HTTPException(400, "Введите имя")

    with db.get_conn() as c:
        topic = c.execute("SELECT * FROM topics WHERE id = ?", (topic_id,)).fetchone()
        if not topic:
            raise HTTPException(404, "Тема не найдена")
        questions = c.execute("SELECT * FROM questions WHERE topic_id = ?", (topic_id,)).fetchall()

    score = 0
    details = []
    for q in questions:
        qd = dict(q)
        if qd["options"]:
            try:
                qd["options"] = json.loads(qd["options"])
            except Exception:
                pass
        if qd["type"] == "matching":
            try:
                qd["correct"] = json.loads(qd["correct"])
            except Exception:
                pass
        user_ans = body.answers.get(str(qd["id"])) or body.answers.get(qd["id"])
        ok = scoring.check_answer(qd, user_ans)
        if ok:
            score += 1
        details.append({
            "id": qd["id"],
            "type": qd["type"],
            "question": qd["question"],
            "user": user_ans,
            "correct": qd["correct"],
            "ok": ok,
        })

    total = len(questions)
    with db.get_conn() as c:
        cur = c.execute(
            "INSERT INTO attempts (test_id, topic_id, user_name, score, total, details) VALUES (?, ?, ?, ?, ?, ?)",
            (topic["test_id"], topic_id, name, score, total, json.dumps(details, ensure_ascii=False)),
        )
        attempt_id = cur.lastrowid

    return {"attempt_id": attempt_id, "score": score, "total": total, "details": details}


@app.get("/api/tests/{test_id}/results")
def results(test_id: int):
    with db.get_conn() as c:
        attempts = c.execute(
            """SELECT a.*, tp.name AS topic_name
               FROM attempts a LEFT JOIN topics tp ON a.topic_id = tp.id
               WHERE a.test_id = ? ORDER BY a.taken_at DESC""",
            (test_id,),
        ).fetchall()
    return [{k: v for k, v in dict(r).items() if k != "details"} for r in attempts]


@app.get("/api/attempts/{attempt_id}")
def get_attempt(attempt_id: int):
    with db.get_conn() as c:
        row = c.execute("SELECT * FROM attempts WHERE id = ?", (attempt_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Попытка не найдена")
    d = dict(row)
    try:
        d["details"] = json.loads(d["details"])
    except Exception:
        d["details"] = []
    return d


@app.delete("/api/tests/{test_id}")
def delete_test(test_id: int):
    with db.get_conn() as c:
        c.execute("DELETE FROM tests WHERE id = ?", (test_id,))
    return {"ok": True}


app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
