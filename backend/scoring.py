import re
import json


def _norm(s: str) -> str:
    s = str(s).lower().strip()
    s = re.sub(r"[\s\.,;:!?\"'`\-()\[\]]+", " ", s)
    return s.strip()


def check_answer(q: dict, user_answer) -> bool:
    qt = q["type"]
    correct = q["correct"]
    if isinstance(correct, str):
        try:
            correct_parsed = json.loads(correct)
        except Exception:
            correct_parsed = correct
    else:
        correct_parsed = correct

    if qt == "multiple_choice":
        return _norm(user_answer) == _norm(correct_parsed)

    if qt == "open":
        ua = _norm(user_answer)
        ca = _norm(correct_parsed)
        if ua == ca:
            return True
        if ua and (ua in ca or ca in ua):
            short = min(len(ua), len(ca))
            long = max(len(ua), len(ca))
            if short / long > 0.6:
                return True
        return False

    if qt == "matching":
        if not isinstance(user_answer, dict) or not isinstance(correct_parsed, dict):
            return False
        if len(user_answer) != len(correct_parsed):
            return False
        return all(_norm(user_answer.get(k, "")) == _norm(v) for k, v in correct_parsed.items())

    return False
