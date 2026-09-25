from __future__ import annotations

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
            .where(SpecializationProfileModel.owner_id == owner_id, SpecializationProfileModel.id == profile_id)
            .options(selectinload(SpecializationProfileModel.selections))
        )

    def list(self, owner_id: UUID) -> list[SpecializationProfileModel]:
        return list(self.session.scalars(
            select(SpecializationProfileModel)
            .where(SpecializationProfileModel.owner_id == owner_id)
            .options(selectinload(SpecializationProfileModel.selections))
            .order_by(SpecializationProfileModel.created_at, SpecializationProfileModel.id)
        ).all())

    def delete(self, profile: SpecializationProfileModel) -> None:
        self.session.delete(profile)

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
            )
        ).all())
