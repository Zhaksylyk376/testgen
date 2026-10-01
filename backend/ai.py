import json
import os
import re
from google import genai
from google.genai import types

MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

LANG_INSTRUCTIONS = {
    "kz": "Барлық сұрақтар мен жауаптарды ТЕК ҚАЗАҚ тілінде жаз.",
    "ru": "Все вопросы и ответы пиши ТОЛЬКО на русском языке.",
    "en": "Write all questions and answers ONLY in English.",
}

SYSTEM_PROMPT = (
    "Ты — опытный педагог, составляешь образовательные тесты по учебному материалу. "
    "Всегда возвращаешь строго валидный JSON-массив без markdown, без комментариев, без текста до или после."
)


def _client() -> genai.Client:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY не задан. Получи ключ на https://aistudio.google.com/apikey")
    return genai.Client(api_key=key)


def _build_prompt(topic_name: str, content: str, lang: str, count: int) -> str:
    lang_note = LANG_INSTRUCTIONS.get(lang, LANG_INSTRUCTIONS["kz"])
    mc = count // 3 + (1 if count % 3 >= 1 else 0)
    op = count // 3 + (1 if count % 3 >= 2 else 0)
    mt = count - mc - op

    return f"""ТЕМА: {topic_name}

МАТЕРИАЛ:
{content[:12000]}

ЗАДАНИЕ: составь РОВНО {count} вопросов по этому материалу, строго следующих типов:
- {mc} вопросов типа "multiple_choice" (4 варианта, один правильный)
- {op} вопросов типа "open" (короткий письменный ответ, 1-5 слов)
- {mt} вопросов типа "matching" (сопоставить 4 пары термин↔определение)

{lang_note}

Вопросы должны быть разнообразными: не повторяй формулировки, покрывай разные аспекты темы, разной сложности.

Верни ТОЛЬКО валидный JSON-массив в таком формате:
[
  {{
    "type": "multiple_choice",
    "question": "текст вопроса",
    "options": ["A вариант", "B вариант", "C вариант", "D вариант"],
    "correct": "A вариант"
  }},
  {{
    "type": "open",
    "question": "текст вопроса",
    "options": null,
    "correct": "правильный ответ"
  }},
  {{
    "type": "matching",
    "question": "Сопоставьте термины и определения",
    "options": {{"left": ["Термин1","Термин2","Термин3","Термин4"], "right": ["Опр1","Опр2","Опр3","Опр4"]}},
    "correct": {{"Термин1":"Опр1","Термин2":"Опр2","Термин3":"Опр3","Термин4":"Опр4"}}
  }}
]
"""


def _extract_json(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("JSON array not found in model output")
    return json.loads(text[start:end+1])


def generate_questions(topic_name: str, content: str, lang: str = "kz", count: int = 15) -> list[dict]:
    client = _client()
    prompt = _build_prompt(topic_name, content, lang, count)

    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.4,
            max_output_tokens=8000,
        ),
    )

    raw = response.text or ""
    questions = _extract_json(raw)

    cleaned = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        qt = q.get("type")
        if qt not in {"multiple_choice", "open", "matching"}:
            continue
        if not q.get("question") or q.get("correct") in (None, ""):
            continue
        cleaned.append({
            "type": qt,
            "question": str(q["question"]).strip(),
            "options": q.get("options"),
            "correct": q["correct"],
        })
    return cleaned
