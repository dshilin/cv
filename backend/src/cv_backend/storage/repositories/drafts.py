from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from cv_backend.domain.drafts import DraftBlockInput
from cv_backend.storage.models.draft import DraftApplicationModel, DraftBlockModel, ResumeDraftModel


class DraftRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, owner_id: UUID, blocks: list[DraftBlockInput]) -> ResumeDraftModel:
        draft = ResumeDraftModel(owner_id=owner_id, title=self._available_title(owner_id))
        draft.blocks = [
            DraftBlockModel(kind=block.kind, heading=block.heading, text=block.text, ordinal=block.ordinal)
            for block in blocks
        ]
        self.session.add(draft)
        self.session.flush()
        return draft

    def _available_title(self, owner_id: UUID) -> str:
        base = f"Черновик резюме {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M')}"
        titles = set(self.session.scalars(
            select(ResumeDraftModel.title).where(ResumeDraftModel.owner_id == owner_id)
        ).all())
        candidate = base
        suffix = 2
        while candidate in titles:
            candidate = f"{base} ({suffix})"
            suffix += 1
        return candidate

    def get(self, owner_id: UUID, draft_id: UUID) -> ResumeDraftModel | None:
        return self.session.scalar(
            select(ResumeDraftModel)
            .where(
                ResumeDraftModel.owner_id == owner_id,
                ResumeDraftModel.id == draft_id,
                ResumeDraftModel.is_deleted.is_(False),
            )
            .options(selectinload(ResumeDraftModel.blocks))
        )

    def list(self, owner_id: UUID, state: str | None = None) -> list[ResumeDraftModel]:
        query = select(ResumeDraftModel).where(
            ResumeDraftModel.owner_id == owner_id,
            ResumeDraftModel.is_deleted.is_(False),
        )
        if state is not None:
            query = query.where(ResumeDraftModel.review_status == state)
        return list(
            self.session.scalars(
                query.options(selectinload(ResumeDraftModel.blocks)).order_by(
                    ResumeDraftModel.updated_at.desc(), ResumeDraftModel.created_at.desc()
                )
            ).all()
        )

    def soft_delete(self, owner_id: UUID, draft_id: UUID) -> bool:
        draft = self.session.scalar(
            select(ResumeDraftModel).where(
                ResumeDraftModel.owner_id == owner_id,
                ResumeDraftModel.id == draft_id,
            )
        )
        if draft is None:
            return False
        if not draft.is_deleted:
            draft.is_deleted = True
            draft.deleted_at = datetime.now(timezone.utc)
        self.session.flush()
        return True

    def review(self, owner_id: UUID, draft_id: UUID) -> ResumeDraftModel | None:
        draft = self.get(owner_id, draft_id)
        if draft is None:
            return None
        draft.state = "reviewed"
        draft.review_status = "reviewed"
        draft.updated_at = datetime.now(timezone.utc)
        self.session.flush()
        return draft

    def create_empty(self, owner_id: UUID) -> ResumeDraftModel:
        return self.create(owner_id, [])

    def add_experience_block(self, owner_id: UUID, draft_id: UUID, text: str) -> ResumeDraftModel | None:
        draft = self.get(owner_id, draft_id)
        if draft is None:
            return None
        next_ordinal = max((block.ordinal for block in draft.blocks), default=-1) + 1
        draft.blocks.append(DraftBlockModel(kind="experience", heading=None, text=text, ordinal=next_ordinal))
        self._mark_edited(draft)
        self.session.flush()
        return draft

    def update_title(self, owner_id: UUID, draft_id: UUID, title: str) -> ResumeDraftModel | None:
        draft = self.get(owner_id, draft_id)
        if draft is None:
            return None
        draft.title = title.strip()
        self._mark_edited(draft)
        self.session.flush()
        return draft

    @staticmethod
    def _mark_edited(draft: ResumeDraftModel) -> None:
        draft.updated_at = datetime.now(timezone.utc)
        draft.review_status = "needs_user_review"
        draft.state = "needs_user_review"

    def get_block(self, owner_id: UUID, draft_id: UUID, block_id: UUID) -> DraftBlockModel | None:
        return self.session.scalar(
            select(DraftBlockModel)
            .join(ResumeDraftModel, ResumeDraftModel.id == DraftBlockModel.draft_id)
            .where(
                ResumeDraftModel.owner_id == owner_id,
                ResumeDraftModel.id == draft_id,
                ResumeDraftModel.is_deleted.is_(False),
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

    def applied_block_count(self, draft_id: UUID) -> int:
        return len(self.session.scalars(
            select(DraftApplicationModel.block_id).where(DraftApplicationModel.draft_id == draft_id)
        ).all())
