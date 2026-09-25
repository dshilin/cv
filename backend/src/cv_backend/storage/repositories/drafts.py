from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from cv_backend.domain.drafts import DraftBlockInput
from cv_backend.storage.models.draft import DraftApplicationModel, DraftBlockModel, ResumeDraftModel


class DraftRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, owner_id: UUID, blocks: list[DraftBlockInput]) -> ResumeDraftModel:
        draft = ResumeDraftModel(owner_id=owner_id)
        draft.blocks = [
            DraftBlockModel(kind=block.kind, heading=block.heading, text=block.text, ordinal=block.ordinal)
            for block in blocks
        ]
        self.session.add(draft)
        self.session.flush()
        return draft

    def get(self, owner_id: UUID, draft_id: UUID) -> ResumeDraftModel | None:
        return self.session.scalar(
            select(ResumeDraftModel)
            .where(ResumeDraftModel.owner_id == owner_id, ResumeDraftModel.id == draft_id)
            .options(selectinload(ResumeDraftModel.blocks))
        )

    def get_block(self, owner_id: UUID, draft_id: UUID, block_id: UUID) -> DraftBlockModel | None:
        return self.session.scalar(
            select(DraftBlockModel)
            .join(ResumeDraftModel, ResumeDraftModel.id == DraftBlockModel.draft_id)
            .where(
                ResumeDraftModel.owner_id == owner_id,
                ResumeDraftModel.id == draft_id,
                DraftBlockModel.id == block_id,
            )
        )

    def application_by_key(self, owner_id: UUID, key: str) -> DraftApplicationModel | None:
        return self.session.scalar(
            select(DraftApplicationModel).where(
                DraftApplicationModel.owner_id == owner_id,
                DraftApplicationModel.idempotency_key == key,
            )
        )

    def application_by_block(self, owner_id: UUID, block_id: UUID) -> DraftApplicationModel | None:
        return self.session.scalar(
            select(DraftApplicationModel).where(
                DraftApplicationModel.owner_id == owner_id,
                DraftApplicationModel.block_id == block_id,
            )
        )

