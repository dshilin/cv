from uuid import uuid4

import pytest
from pydantic import ValidationError

from cv_backend.domain.profiles import ProfileCreate, ProfilePatch, ProfileSelections
from cv_backend.services.profile_service import ProfileService
from cv_backend.storage.repositories.candidate import CandidateRepository
from cv_backend.domain.candidate import ExperienceItemInput, SkillItemInput, ToolItemInput


def test_profiles_are_independent_and_keep_skill_and_tool_selections_separate(session_factory):
    owner_id = uuid4()
    with session_factory() as session:
        candidate = CandidateRepository(session)
        skill = candidate.add_items(owner_id, [SkillItemInput(name="Testing")])[0]
        tool = candidate.add_items(owner_id, [ToolItemInput(name="Playwright")])[0]
        service = ProfileService(session)
        ai = service.create(owner_id, ProfileCreate(name="AI Engineer"))
        qa = service.create(owner_id, ProfileCreate(name="QA Engineer"))
        service.update(owner_id, ai.id, ProfilePatch(headline="AI"))
        updated = service.set_selections(
            owner_id,
            qa.id,
            ProfileSelections(skill_ids=[skill.id], tool_ids=[tool.id]),
        )
        assert updated.skill_ids == [skill.id]
        assert updated.tool_ids == [tool.id]
        assert service.get(owner_id, ai.id).headline == "AI"
        assert service.get(owner_id, qa.id).headline is None
        assert service.get(uuid4(), qa.id) is None


def test_selection_rejects_ids_from_another_owner(session_factory):
    with session_factory() as session:
        owner = uuid4()
        other = uuid4()
        skill = CandidateRepository(session).add_items(other, [SkillItemInput(name="Secret")])[0]
        profile = ProfileService(session).create(owner, ProfileCreate(name="QA"))
        with pytest.raises(ValueError):
            ProfileService(session).set_selections(
                owner, profile.id, ProfileSelections(skill_ids=[skill.id])
            )


def test_profile_inputs_reject_unknown_fields():
    with pytest.raises(ValidationError):
        ProfileCreate(name="AI", silently_change=True)


def test_profile_name_cannot_be_explicitly_cleared():
    with pytest.raises(ValidationError):
        ProfilePatch(name=None)


def test_profile_text_override_survives_fact_edit_and_profile_deletion_keeps_base(session_factory):
    owner = uuid4()
    with session_factory() as session:
        candidate_repository = CandidateRepository(session)
        fact = candidate_repository.add_items(
            owner, [ExperienceItemInput(employer="Acme", position="Engineer")]
        )[0]
        service = ProfileService(session)
        profile = service.create(owner, ProfileCreate(name="Engineering"))
        service.set_selections(owner, profile.id, ProfileSelections(candidate_item_ids=[fact.id]))
        service.update(owner, profile.id, ProfilePatch(text_overrides={fact.id: "Platform engineer"}))
        candidate_repository.update_item(owner, fact.id, {"employer": "Acme Corp"})
        assert service.get(owner, profile.id).text_overrides[fact.id] == "Platform engineer"
        assert service.delete(owner, profile.id) is True
        assert candidate_repository.get_item(owner, fact.id) is not None
