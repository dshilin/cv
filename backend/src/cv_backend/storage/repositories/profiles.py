from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.models.profile import ProfileItemSelectionModel, SpecializationProfileModel


class ProfileRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, owner_id: UUID, name: str) -> SpecializationProfileModel:
        profile = SpecializationProfileModel(owner_id=owner_id, name=name)
        self.session.add(profile)
        self.session.flush()
        return profile

    def get(self, owner_id: UUID, profile_id: UUID) -> SpecializationProfileModel | None:
        return self.session.scalar(
            select(SpecializationProfileModel)
            .where(
                SpecializationProfileModel.owner_id == owner_id,
                SpecializationProfileModel.id == profile_id,
                SpecializationProfileModel.is_deleted.is_(False),
            )
            .options(selectinload(SpecializationProfileModel.selections))
        )

    def list(self, owner_id: UUID) -> list[SpecializationProfileModel]:
        return list(self.session.scalars(
            select(SpecializationProfileModel)
            .where(
                SpecializationProfileModel.owner_id == owner_id,
                SpecializationProfileModel.is_deleted.is_(False),
            )
            .options(selectinload(SpecializationProfileModel.selections))
            .order_by(SpecializationProfileModel.created_at, SpecializationProfileModel.id)
        ).all())

    def soft_delete(self, owner_id: UUID, profile_id: UUID) -> bool:
        profile = self.session.scalar(
            select(SpecializationProfileModel).where(
                SpecializationProfileModel.owner_id == owner_id,
                SpecializationProfileModel.id == profile_id,
            )
        )
        if profile is None:
            return False
        if not profile.is_deleted:
            profile.is_deleted = True
            profile.deleted_at = datetime.now(timezone.utc)
        self.session.flush()
        return True

    def replace_selections(
        self, profile: SpecializationProfileModel, grouped_ids: dict[str, list[UUID]]
    ) -> None:
        profile.selections.clear()
        for category, ids in grouped_ids.items():
            for ordinal, item_id in enumerate(ids):
                profile.selections.append(
                    ProfileItemSelectionModel(item_id=item_id, category=category, ordinal=ordinal)
                )
        self.session.flush()

    def owned_items(self, owner_id: UUID, ids: list[UUID]) -> list[CandidateItemModel]:
        if not ids:
            return []
        return list(self.session.scalars(
            select(CandidateItemModel).where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.id.in_(ids),
                CandidateItemModel.is_deleted.is_(False),
            )
        ).all())

    def visible_item_ids(self, owner_id: UUID, ids: list[UUID]) -> set[UUID]:
        if not ids:
            return set()
        return set(
            self.session.scalars(
                select(CandidateItemModel.id).where(
                    CandidateItemModel.owner_id == owner_id,
                    CandidateItemModel.id.in_(ids),
                    CandidateItemModel.is_deleted.is_(False),
                )
            ).all()
        )
