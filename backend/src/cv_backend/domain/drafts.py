from dataclasses import dataclass
from typing import Literal

DraftBlockKind = Literal[
    "basics",
    "preferences",
    "experience",
    "projects",
    "skills",
    "tools",
    "education",
    "certifications",
    "languages",
    "additional",
    "unparsed",
]


@dataclass(frozen=True, slots=True)
class DraftBlockInput:
    kind: DraftBlockKind
    heading: str | None
    text: str
    ordinal: int
