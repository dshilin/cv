from datetime import datetime, timezone
from typing import Mapping
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from cv_backend.storage.models.llm_connection import LLMConnectionModel


class LLMConnectionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(
        self,
        *,
        owner_id: UUID,
        provider: str,
        settings: Mapping[str, object],
        encrypted_credentials: bytes,
        default_model: str,
    ) -> LLMConnectionModel:
        connection = LLMConnectionModel(
            owner_id=owner_id,
            provider=provider,
            settings=dict(settings),
            credentials_ciphertext=encrypted_credentials,
            default_model=default_model,
            status="pending",
        )
        self.session.add(connection)
        self.session.flush()
        return connection

    def get_for_owner(self, owner_id: UUID, connection_id: UUID) -> LLMConnectionModel | None:
        return self.session.scalar(
            select(LLMConnectionModel).where(
                LLMConnectionModel.owner_id == owner_id,
                LLMConnectionModel.id == connection_id,
            )
        )

    def list_for_owner(self, owner_id: UUID) -> list[LLMConnectionModel]:
        return list(
            self.session.scalars(
                select(LLMConnectionModel)
                .where(LLMConnectionModel.owner_id == owner_id)
                .order_by(LLMConnectionModel.created_at, LLMConnectionModel.id)
            ).all()
        )

    def record_test_result(
        self, connection: LLMConnectionModel, *, succeeded: bool
    ) -> None:
        connection.status = "verified" if succeeded else "failed"
        connection.last_tested_at = datetime.now(timezone.utc)
        self.session.flush()
