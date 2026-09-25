from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from cv_backend.domain.candidate import SkillItemInput
from cv_backend.storage.models.candidate import CandidateItemModel, CandidateItemVersionModel
from cv_backend.storage.repositories.candidate import CandidateRepository


def test_candidate_item_is_owner_scoped_and_user_edits_create_versions(session_factory) -> None:
    owner_id = uuid4()
    with session_factory() as session:
        repository = CandidateRepository(session)
        created = repository.add_items(
            owner_id,
            [SkillItemInput(name="Python", level="used", last_used_year=2025)],
        )[0]
        session.commit()
        item_id = created.id

    with session_factory() as session:
        repository = CandidateRepository(session)
        item = repository.get_item(owner_id, item_id)
        assert item is not None
        assert item.status == "confirmed"
        assert item.version == 1
        assert item.payload["name"] == "Python"
        assert repository.get_item(uuid4(), item_id) is None

        updated = repository.update_item(owner_id, item_id, {"name": "Python 3"})
        assert updated.payload["name"] == "Python 3"
        assert updated.payload["level"] == "used"
        assert updated.version == 2
        assert session.scalar(
            select(func.count()).select_from(CandidateItemVersionModel)
        ) == 2


def test_typed_candidate_item_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        SkillItemInput(name="Python", made_up_claim="expert")
