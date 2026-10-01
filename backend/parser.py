import re
from pathlib import Path
from docx import Document
from pypdf import PdfReader


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8", errors="ignore")
    raise ValueError(f"Unsupported file type: {suffix}")


LECTURE_PAT = re.compile(
    r"^\s*(?:ДӘРІС|Дәріс|ЛЕКЦИЯ|Лекция|LECTURE|Lecture)\s*[№#\.]?\s*(\d+)[\.\s:]*(.*)",
    re.IGNORECASE,
)
FALLBACK_PAT = re.compile(r"^\s*(?:Тема|Topic|Глава|Chapter)\s*[№#]?\s*(\d+)[\.\s:]*(.*)", re.IGNORECASE)


def _split_by(pat: re.Pattern, lines: list[str]) -> list[dict]:
    topics: list[dict] = []
    current = None
    for line in lines:
        m = pat.match(line)
        if m:
            if current:
                topics.append(current)
            num = m.group(1)
            title_part = (m.group(2) or "").strip()
            name = f"№{num}. {title_part}".strip(". ")
            if not title_part:
                name = f"№{num}"
            current = {"name": name[:200], "content": line + "\n"}
        else:
            if current is None:
                current = {"name": "Кіріспе", "content": ""}
            current["content"] += line + "\n"
    if current:
        topics.append(current)
    return [t for t in topics if len(t["content"].strip()) > 150]


def split_topics(text: str) -> list[dict]:
    lines = text.split("\n")
    topics = _split_by(LECTURE_PAT, lines)
    if len(topics) >= 2:
        return topics

    topics = _split_by(FALLBACK_PAT, lines)
    if len(topics) >= 2:
        return topics

    chunk_size = max(2000, len(text) // 10)
    return [
        {"name": f"Часть {i+1}", "content": text[i*chunk_size:(i+1)*chunk_size]}
        for i in range((len(text) + chunk_size - 1) // chunk_size)
    ]
