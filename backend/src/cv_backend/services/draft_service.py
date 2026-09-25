from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from cv_backend.domain.candidate import CandidateItemInput
from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.models.draft import DraftApplicationModel, ResumeDraftModel
from cv_backend.storage.repositories.candidate import CandidateRepository
from cv_backend.storage.repositories.drafts import DraftRepository


class DraftNotFoundError(Exception):
    pass


class IdempotencyConflictError(Exception):
    pass


class DraftService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def apply_block(
        self,
        owner_id: UUID,
        draft_id: UUID,
        block_id: UUID,
        items: list[CandidateItemInput],
        idempotency_key: str,
    ) -> list[CandidateItemModel]:
        drafts = DraftRepository(self.session)
        previous = drafts.application_by_key(owner_id, idempotency_key)
        if previous:
            if previous.draft_id != draft_id or previous.block_id != block_id:
                raise IdempotencyConflictError("Idempotency key was used for another block")
            return self._load_items(owner_id, previous.item_ids)

        block = drafts.get_block(owner_id, draft_id, block_id)
        if block is None:
            raise DraftNotFoundError("Draft block not found")
        previous = drafts.application_by_block(owner_id, block_id)
        if previous:
            return self._load_items(owner_id, previous.item_ids)
        if not items:
            raise ValueError("At least one explicitly entered item is required")

        try:
            created = CandidateRepository(self.session).add_items(owner_id, items)
            application = DraftApplicationModel(
                owner_id=owner_id,
                draft_id=draft_id,
                block_id=block_id,
                idempotency_key=idempotency_key,
                item_ids=[str(item.id) for item in created],
            )
            self.session.add(application)
            self.session.flush()
            draft = self.session.scalar(
                select(ResumeDraftModel).where(
                    ResumeDraftModel.owner_id == owner_id, ResumeDraftModel.id == draft_id
                )
            )
            if draft is not None:
                applied_count = self.session.scalar(
                    select(func.count())
                    .select_from(DraftApplicationModel)
                    .where(DraftApplicationModel.draft_id == draft_id)
                ) or 0
                block_count = len(draft.blocks)
                if draft.state != "reviewed":
                    draft.state = "applied" if applied_count >= block_count else "partially_applied"
            self.session.commit()
            return created
        except Exception:
            self.session.rollback()
            raise

    def _load_items(self, owner_id: UUID, item_ids: list[str]) -> list[CandidateItemModel]:
        ids = [UUID(item_id) for item_id in item_ids]
        rows = self.session.scalars(
            select(CandidateItemModel).where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.id.in_(ids),
            )
        ).all()
        indexed = {str(row.id): row for row in rows}
        return [indexed[item_id] for item_id in item_ids if item_id in indexed]
