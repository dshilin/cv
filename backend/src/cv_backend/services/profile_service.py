from uuid import UUID

from sqlalchemy.orm import Session

from cv_backend.domain.profiles import ProfileCreate, ProfilePatch, ProfileSelections, ProfileView
from cv_backend.storage.repositories.profiles import ProfileRepository


class ProfileService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = ProfileRepository(session)

    def create(self, owner_id: UUID, data: ProfileCreate) -> ProfileView:
        profile = self.repository.create(owner_id, data.name)
        self.session.commit()
        return self._view(profile)

    def get(self, owner_id: UUID, profile_id: UUID) -> ProfileView | None:
        profile = self.repository.get(owner_id, profile_id)
        return self._view(profile) if profile else None

    def list(self, owner_id: UUID) -> list[ProfileView]:
        return [self._view(profile) for profile in self.repository.list(owner_id)]

    def update(self, owner_id: UUID, profile_id: UUID, patch: ProfilePatch) -> ProfileView | None:
        profile = self.repository.get(owner_id, profile_id)
        if profile is None:
            return None
        for key, value in patch.model_dump(exclude_unset=True).items():
            if key == "text_overrides" and value is not None:
                existing = dict(profile.text_overrides)
                existing.update({str(item_id): text for item_id, text in value.items()})
                profile.text_overrides = existing
            else:
                setattr(profile, key, value)
        self.session.commit()
        return self._view(profile)

    def set_selections(
        self, owner_id: UUID, profile_id: UUID, selections: ProfileSelections
    ) -> ProfileView | None:
        profile = self.repository.get(owner_id, profile_id)
        if profile is None:
            return None
        groups = {
            "candidate": selections.candidate_item_ids,
            "skill": selections.skill_ids,
            "tool": selections.tool_ids,
        }
        ids = [item_id for group in groups.values() for item_id in group]
        if len(ids) != len(set(ids)):
            raise ValueError("An item can only appear once in a profile")
        items = self.repository.owned_items(owner_id, ids)
        by_id = {item.id: item for item in items}
        if len(by_id) != len(ids):
            raise ValueError("Selection contains an unavailable item")
        for category, item_ids in groups.items():
            for item_id in item_ids:
                expected_type = {"skill": "skill", "tool": "tool"}.get(category)
                if expected_type and by_id[item_id].item_type != expected_type:
                    raise ValueError(f"{category} selection has wrong item type")
                if by_id[item_id].status != "confirmed":
                    raise ValueError("Only confirmed candidate items can be selected")
        self.repository.replace_selections(profile, groups)
        self.session.commit()
        return self._view(profile)

    def delete(self, owner_id: UUID, profile_id: UUID) -> bool:
        if not self.repository.soft_delete(owner_id, profile_id):
            return False
        self.session.commit()
        return True

    def _view(self, profile) -> ProfileView:
        grouped: dict[str, list[UUID]] = {"candidate": [], "skill": [], "tool": []}
        visible_ids = self.repository.visible_item_ids(
            profile.owner_id, [selection.item_id for selection in profile.selections]
        )
        for selection in profile.selections:
            if selection.item_id not in visible_ids:
                continue
            grouped[selection.category].append(selection.item_id)
        return ProfileView(
            id=profile.id,
            name=profile.name,
            target_roles=profile.target_roles,
            search_preferences=profile.search_preferences,
            headline=profile.headline,
            summary=profile.summary,
            section_order=profile.section_order,
            text_overrides={UUID(key): value for key, value in profile.text_overrides.items()},
            candidate_item_ids=grouped["candidate"],
            skill_ids=grouped["skill"],
            tool_ids=grouped["tool"],
        )
