from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cv_backend.storage.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CandidateBaseModel(Base):
    __tablename__ = "candidate_bases"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    items: Mapped[list["CandidateItemModel"]] = relationship(back_populates="base")


class CandidateItemModel(Base):
    __tablename__ = "candidate_items"
    __table_args__ = (
        CheckConstraint(
            "item_type IN ('experience', 'project', 'skill', 'tool', 'education', "
            "'certification', 'language', 'contact', 'preference')",
            name="ck_candidate_items_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'rejected', 'deprecated')",
            name="ck_candidate_items_status",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    base_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("candidate_bases.id", ondelete="RESTRICT"), index=True
    )
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    item_type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, object]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="confirmed")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    base: Mapped[CandidateBaseModel] = relationship(back_populates="items")
    versions: Mapped[list["CandidateItemVersionModel"]] = relationship(
        back_populates="item", order_by="CandidateItemVersionModel.version_number"
    )


class CandidateItemVersionModel(Base):
    __tablename__ = "candidate_item_versions"
    __table_args__ = (
        UniqueConstraint("item_id", "version_number", name="uq_candidate_item_version"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("candidate_items.id", ondelete="RESTRICT"), index=True
    )
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    item_type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, object]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    item: Mapped[CandidateItemModel] = relationship(back_populates="versions")
