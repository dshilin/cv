from uuid import uuid4

from sqlalchemy import func, select

from cv_backend.domain.candidate import SkillItemInput
from cv_backend.domain.drafts import DraftBlockInput
from cv_backend.services.draft_service import DraftService
from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.repositories.drafts import DraftRepository


def test_draft_and_ordered_blocks_reload_for_owner_only(session_factory) -> None:
    owner_id = uuid4()
    blocks = [
        DraftBlockInput("skills", "Навыки", "Python", 0),
        DraftBlockInput("tools", "Инструменты", "Docker", 1),
    ]
    with session_factory() as session:
        created = DraftRepository(session).create(owner_id, blocks)
        draft_id = created.id
        session.commit()

    with session_factory() as session:
        restored = DraftRepository(session).get(owner_id, draft_id)
        assert restored is not None
        assert [(block.kind, block.text, block.ordinal) for block in restored.blocks] == [
            ("skills", "Python", 0),
            ("tools", "Docker", 1),
        ]
        assert DraftRepository(session).get(uuid4(), draft_id) is None


def test_applying_block_repeatedly_returns_same_items_without_duplicates(session_factory) -> None:
    owner_id = uuid4()
    with session_factory() as session:
        draft = DraftRepository(session).create(
            owner_id, [DraftBlockInput("skills", "Навыки", "Python, SQL", 0)]
        )
        draft_id = draft.id
        block_id = draft.blocks[0].id
        session.commit()

    with session_factory() as session:
        service = DraftService(session)
        first = service.apply_block(
            owner_id,
            draft_id,
            block_id,
            [SkillItemInput(name="Python", level="used")],
            "apply-block-1",
        )
        second = service.apply_block(
            owner_id,
            draft_id,
            block_id,
            [SkillItemInput(name="SQL", level="used")],
            "apply-block-1",
        )

        assert [item.id for item in second] == [item.id for item in first]
        assert session.scalar(select(func.count()).select_from(CandidateItemModel)) == 1
