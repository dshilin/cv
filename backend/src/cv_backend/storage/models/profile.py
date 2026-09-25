from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cv_backend.storage.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SpecializationProfileModel(Base):
    __tablename__ = "specialization_profiles"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(120))
    target_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    search_preferences: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    headline: Mapped[str | None] = mapped_column(String(240), nullable=True)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    section_order: Mapped[list[str]] = mapped_column(JSON, default=list)
    text_overrides: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    selections: Mapped[list["ProfileItemSelectionModel"]] = relationship(
        cascade="all, delete-orphan", order_by="ProfileItemSelectionModel.category, ProfileItemSelectionModel.ordinal"
    )


class ProfileItemSelectionModel(Base):
    __tablename__ = "profile_item_selections"
    __table_args__ = (
        UniqueConstraint("profile_id", "category", "ordinal", name="uq_profile_selection_order"),
        UniqueConstraint("profile_id", "category", "item_id", name="uq_profile_selection_item"),
        CheckConstraint("category IN ('candidate', 'skill', 'tool')", name="ck_profile_selection_category"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("specialization_profiles.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("candidate_items.id", ondelete="RESTRICT"), index=True
    )
    category: Mapped[str] = mapped_column(String(16))
    ordinal: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(default=True)
