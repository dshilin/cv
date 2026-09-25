from dataclasses import FrozenInstanceError

import pytest

from cv_backend.services.text_parser import parse_resume_text


def test_parser_keeps_unrecognized_text_and_separates_skills_from_tools() -> None:
    blocks = parse_resume_text(
        "Навыки\nУправление командой\nИнструменты\nJira, Docker\n"
        "Нестандартный раздел\nОсобый текст"
    )

    assert [(block.kind, block.text) for block in blocks] == [
        ("skills", "Управление командой"),
        ("tools", "Jira, Docker"),
        ("unparsed", "Нестандартный раздел\nОсобый текст"),
    ]
    assert [block.ordinal for block in blocks] == [0, 1, 2]


def test_parser_rejects_empty_input() -> None:
    assert parse_resume_text(" \n\t") == []


@pytest.mark.parametrize(
    ("heading", "kind"),
    [
        ("Личные данные", "basics"),
        ("Preferences", "preferences"),
        ("Опыт работы", "experience"),
        ("Projects", "projects"),
        ("Навыки", "skills"),
        ("Tools", "tools"),
        ("Образование", "education"),
        ("Certifications", "certifications"),
        ("Языки", "languages"),
        ("Additional information", "additional"),
    ],
)
def test_parser_recognizes_supported_russian_and_english_headings(
    heading: str, kind: str
) -> None:
    blocks = parse_resume_text(f"{heading}\nSection content")

    assert [(block.kind, block.text) for block in blocks] == [(kind, "Section content")]


def test_parser_normalizes_heading_case_whitespace_colon_and_line_endings() -> None:
    blocks = parse_resume_text("  НАВЫКИ:  \r\nPython  \r\nTypeScript\r\n")

    assert len(blocks) == 1
    assert blocks[0].kind == "skills"
    assert blocks[0].heading == "НАВЫКИ:"
    assert blocks[0].text == "Python  \nTypeScript"


def test_parser_keeps_repeated_sections_separate_in_source_order() -> None:
    blocks = parse_resume_text(
        "Опыт работы\nПервая запись\nОпыт работы:\nВторая запись"
    )

    assert [(block.kind, block.heading, block.text, block.ordinal) for block in blocks] == [
        ("experience", "Опыт работы", "Первая запись", 0),
        ("experience", "Опыт работы:", "Вторая запись", 1),
    ]


def test_parser_emits_immutable_blocks() -> None:
    block = parse_resume_text("Навыки\nPython")[0]

    with pytest.raises(FrozenInstanceError):
        block.text = "Other"
