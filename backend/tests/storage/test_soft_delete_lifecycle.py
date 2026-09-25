from uuid import uuid4

from sqlalchemy import func, select

from cv_backend.domain.candidate import SkillItemInput
from cv_backend.domain.drafts import DraftBlockInput
from cv_backend.services.profile_service import ProfileService
from cv_backend.domain.profiles import ProfileCreate, ProfileSelections
from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.models.draft import DraftBlockModel
from cv_backend.storage.models.profile import ProfileItemSelectionModel, SpecializationProfileModel
from cv_backend.storage.repositories.candidate import CandidateRepository
from cv_backend.storage.repositories.drafts import DraftRepository
from cv_backend.storage.repositories.profiles import ProfileRepository


def test_soft_deleted_draft_is_hidden_but_its_block_is_retained(session_factory):
    owner_id = uuid4()
    with session_factory() as session:
        drafts = DraftRepository(session)
        draft = drafts.create(owner_id, [DraftBlockInput("experience", "Опыт", "QA", 0)])
        draft_id = draft.id
        block_id = draft.blocks[0].id
        session.commit()

        assert drafts.get(owner_id, draft_id) is not None
        assert drafts.soft_delete(owner_id, draft_id) is True
        session.commit()

        assert drafts.get(owner_id, draft_id) is None
        assert drafts.list(owner_id) == []
        assert session.get(DraftBlockModel, block_id) is not None
        deleted = session.get(type(draft), draft_id)
        assert deleted.is_deleted is True
        assert deleted.deleted_at is not None


def test_soft_deleted_candidate_item_is_hidden_but_version_and_selection_remain(session_factory):
    owner_id = uuid4()
    with session_factory() as session:
        item = CandidateRepository(session).add_items(
            owner_id, [SkillItemInput(name="Python", level="used")]
        )[0]
        item_id = item.id
        profile = ProfileRepository(session).create(owner_id, "QA")
        ProfileRepository(session).replace_selections(profile, {"skill": [item_id]})
        version_id = item.versions[0].id
        selection_id = profile.selections[0].id
        session.commit()

        candidates = CandidateRepository(session)
        assert candidates.get_item(owner_id, item_id) is not None
        assert candidates.soft_delete_item(owner_id, item_id) is True
        session.commit()
        assert candidates.soft_delete_item(owner_id, item_id) is True

        assert candidates.get_item(owner_id, item_id) is None
        assert candidates.list_items(owner_id) == []
        assert session.get(CandidateItemModel, item_id).is_deleted is True
        assert session.get(CandidateItemModel, item_id).deleted_at is not None
        assert session.get(ProfileItemSelectionModel, selection_id) is not None
        assert candidates.session.get(type(item.versions[0]), version_id) is not None
        assert ProfileService(session).get(owner_id, profile.id).skill_ids == []


def test_soft_deleted_profile_is_hidden_and_does_not_delete_selections(session_factory):
    owner_id = uuid4()
    with session_factory() as session:
        repository = ProfileRepository(session)
        profile = repository.create(owner_id, "AI")
        profile_id = profile.id
        session.commit()

        assert repository.soft_delete(owner_id, profile_id) is True
        session.commit()
        assert repository.soft_delete(owner_id, profile_id) is True

        assert repository.get(owner_id, profile_id) is None
        assert repository.list(owner_id) == []
        stored = session.get(SpecializationProfileModel, profile_id)
        assert stored is not None
        assert stored.is_deleted is True
        assert stored.deleted_at is not None
        assert session.scalar(
            select(func.count()).select_from(ProfileItemSelectionModel).where(
                ProfileItemSelectionModel.profile_id == profile_id
            )
        ) == 0
