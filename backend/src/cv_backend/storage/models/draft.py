from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cv_backend.storage.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ResumeDraftModel(Base):
    __tablename__ = "resume_drafts"
    __table_args__ = (
        CheckConstraint(
            "state IN ('needs_user_review', 'partially_applied', 'applied', 'reviewed')",
            name="ck_resume_drafts_state",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    state: Mapped[str] = mapped_column(String(24), default="needs_user_review")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    blocks: Mapped[list["DraftBlockModel"]] = relationship(
        back_populates="draft",
        order_by="DraftBlockModel.ordinal",
        cascade="all, delete-orphan",
    )


class DraftBlockModel(Base):
    __tablename__ = "draft_blocks"
    __table_args__ = (
        UniqueConstraint("draft_id", "ordinal", name="uq_draft_block_ordinal"),
        CheckConstraint(
            "kind IN ('basics', 'preferences', 'experience', 'projects', 'skills', "
            "'tools', 'education', 'certifications', 'languages', 'additional', 'unparsed')",
            name="ck_draft_blocks_kind",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    draft_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("resume_drafts.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(24))
    heading: Mapped[str | None] = mapped_column(String(160))
    text: Mapped[str] = mapped_column(String)
    ordinal: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    draft: Mapped[ResumeDraftModel] = relationship(back_populates="blocks")


class DraftApplicationModel(Base):
    __tablename__ = "draft_applications"
    __table_args__ = (
        UniqueConstraint("owner_id", "idempotency_key", name="uq_draft_application_key"),
        UniqueConstraint("block_id", name="uq_draft_application_block"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    draft_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("resume_drafts.id", ondelete="CASCADE"), index=True
    )
    block_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("draft_blocks.id", ondelete="CASCADE"), index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(128))
    item_ids: Mapped[list[str]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
