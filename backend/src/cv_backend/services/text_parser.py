import re

from cv_backend.domain.drafts import DraftBlockInput, DraftBlockKind

_HEADINGS: dict[str, DraftBlockKind] = {
    "основная информация": "basics",
    "личная информация": "basics",
    "личные данные": "basics",
    "контакты": "basics",
    "контактная информация": "basics",
    "personal details": "basics",
    "contact information": "basics",
    "preferences": "preferences",
    "предпочтения": "preferences",
    "пожелания": "preferences",
    "условия работы": "preferences",
    "work preferences": "preferences",
    "опыт": "experience",
    "опыт работы": "experience",
    "experience": "experience",
    "work experience": "experience",
    "employment history": "experience",
    "проекты": "projects",
    "projects": "projects",
    "навыки": "skills",
    "ключевые навыки": "skills",
    "профессиональные навыки": "skills",
    "skills": "skills",
    "инструменты": "tools",
    "технологии и инструменты": "tools",
    "инструменты и технологии": "tools",
    "tools": "tools",
    "обучение": "education",
    "образование": "education",
    "education": "education",
    "сертификаты": "certifications",
    "сертификации": "certifications",
    "сертификаты и курсы": "certifications",
    "certifications": "certifications",
    "certificates": "certifications",
    "языки": "languages",
    "иностранные языки": "languages",
    "languages": "languages",
    "дополнительно": "additional",
    "дополнительная информация": "additional",
    "обо мне": "additional",
    "additional information": "additional",
    "additional": "additional",
}
_BULLET_PREFIX = re.compile(r"^(?:[-*•▪]|\d+[.)])\s+")
_SENTENCE_END = re.compile(r"[.!?。！？…]$")


def _normalize_heading(value: str) -> str:
    return " ".join(value.strip().rstrip(":").split()).casefold()


def _is_title_like(value: str) -> bool:
    words = re.findall(r"[^\W_]+", value, flags=re.UNICODE)
    if not words or not words[0][0].isupper() or not words[0][1:].islower():
        return False
    return all(
        word.islower() or (word[0].isupper() and word[1:].islower())
        for word in words[1:]
    )


def _looks_like_unknown_heading(line: str, next_line: str | None) -> bool:
    """Recognize conservative title-like boundaries without semantic guesses."""
    candidate = line.strip()
    if not candidate or len(candidate) > 80 or next_line is None or not next_line.strip():
        return False
    if _normalize_heading(candidate) in _HEADINGS:
        return False
    if _BULLET_PREFIX.match(candidate) or _SENTENCE_END.search(candidate):
        return False
    if re.search(r"[,;]", candidate):
        return False
    if candidate.startswith("#") or candidate.endswith(":"):
        return True
    if len(re.findall(r"[^\W_]+", candidate, flags=re.UNICODE)) < 2:
        return False
    return _is_title_like(candidate) and _normalize_heading(next_line) not in _HEADINGS


def _trim_blank_edges(lines: list[str]) -> list[str]:
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def parse_resume_text(text: str) -> list[DraftBlockInput]:
    """Split explicit resume headings into editable blocks without inferring facts."""
    normalized_text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized_text.split("\n")
    blocks: list[DraftBlockInput] = []
    current_kind: DraftBlockKind | None = None
    current_heading: str | None = None
    current_lines: list[str] = []
    next_nonempty: list[str | None] = [None] * len(lines)
    following_line: str | None = None
    for index in range(len(lines) - 1, -1, -1):
        next_nonempty[index] = following_line
        if lines[index].strip():
            following_line = lines[index]

    def flush() -> None:
        nonlocal current_kind, current_heading, current_lines
        body = _trim_blank_edges(current_lines)
        block_text = "\n".join(body).strip()
        if current_kind is not None and block_text:
            blocks.append(
                DraftBlockInput(
                    kind=current_kind,
                    heading=current_heading,
                    text=block_text,
                    ordinal=len(blocks),
                )
            )
        current_kind = None
        current_heading = None
        current_lines = []

    for index, line in enumerate(lines):
        kind = _HEADINGS.get(_normalize_heading(line))
        next_line = next_nonempty[index]
        if kind is not None:
            flush()
            current_kind = kind
            current_heading = line.strip()
            continue

        if _looks_like_unknown_heading(line, next_line):
            flush()
            current_kind = "unparsed"
            current_lines = [line.strip()]
            continue

        if current_kind is None:
            current_kind = "unparsed"
        current_lines.append(line)

    flush()
    return blocks
