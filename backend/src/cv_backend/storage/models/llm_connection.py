from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Index, JSON, LargeBinary, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from cv_backend.storage.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LLMConnectionModel(Base):
    __tablename__ = "llm_connections"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('openai', 'openai_compatible', 'yandexgpt', 'gigachat')",
            name="ck_llm_connections_provider",
        ),
        CheckConstraint(
            "status IN ('pending', 'verified', 'failed', 'disabled')",
            name="ck_llm_connections_status",
        ),
        Index("ix_llm_connections_owner_created", "owner_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    settings: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    credentials_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    default_model: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
