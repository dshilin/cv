import json
import re
from datetime import datetime, timezone
from typing import Mapping
from uuid import UUID

from pydantic import SecretStr
from sqlalchemy.orm import Session

from cv_backend.llm.contracts import LLMMessage, LLMRequest
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection, LLMGateway
from cv_backend.llm.security import CredentialCipher
from cv_backend.storage.models.llm_connection import LLMConnectionModel
from cv_backend.storage.repositories.llm_connections import LLMConnectionRepository


_CREDENTIAL_FIELDS = {
    "openai": {"api_key"},
    "openai_compatible": {"api_key"},
    "yandexgpt": {"api_key"},
    "gigachat": {"authorization_key"},
}
_SETTING_FIELDS = {
    "openai": set(),
    "openai_compatible": {"base_url"},
    "yandexgpt": {"folder_id"},
    "gigachat": {"scope"},
}


class LLMConnectionService:
    def __init__(
        self,
        session: Session,
        cipher: CredentialCipher,
        adapters: Mapping[str, object],
    ) -> None:
        self._session = session
        self._repository = LLMConnectionRepository(session)
        self._cipher = cipher
        self._adapters = adapters

    def create(
        self,
        owner_id: UUID,
        *,
        provider: str,
        settings: Mapping[str, str],
        credentials: Mapping[str, SecretStr],
        default_model: str,
    ) -> LLMConnectionModel:
        if provider not in _CREDENTIAL_FIELDS:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        if set(credentials) != _CREDENTIAL_FIELDS[provider]:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        if set(settings) != _SETTING_FIELDS[provider]:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        if provider == "openai_compatible":
            from cv_backend.llm.providers.endpoint_security import validate_https_base_url

            try:
                validate_https_base_url(settings["base_url"])
            except ValueError:
                raise LLMError(LLMErrorCategory.INVALID_REQUEST) from None
        if provider == "yandexgpt" and not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", settings["folder_id"]
        ):
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        if provider == "gigachat" and settings["scope"] not in {"PERS", "B2B", "CORP"}:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        plain_credentials = {
            key: value.get_secret_value() for key, value in credentials.items()
        }
        if any(not value.strip() for value in plain_credentials.values()):
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        encrypted = self._cipher.encrypt(
            json.dumps(plain_credentials, separators=(",", ":")).encode("utf-8")
        )
        record = self._repository.create(
            owner_id=owner_id,
            provider=provider,
            settings=settings,
            encrypted_credentials=encrypted,
            default_model=default_model,
        )
        self._session.commit()
        return record

    def list_for_owner(self, owner_id: UUID) -> list[LLMConnectionModel]:
        return self._repository.list_for_owner(owner_id)

    async def test_connection(
        self, owner_id: UUID, connection_id: UUID
    ) -> tuple[LLMConnectionModel, str | None]:
        record = self._repository.get_for_owner(owner_id, connection_id)
        if record is None:
            raise LLMError(LLMErrorCategory.CONNECTION_NOT_FOUND)
        if record.status == "disabled":
            raise LLMError(LLMErrorCategory.CONNECTION_NOT_READY)
        adapter = self._adapters.get(record.provider)
        if adapter is None:
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR)
        try:
            credentials = json.loads(self._cipher.decrypt(record.credentials_ciphertext))
            if not isinstance(credentials, dict) or not all(
                isinstance(key, str) and isinstance(value, str)
                for key, value in credentials.items()
            ):
                raise ValueError("Credential payload is invalid")
            decrypted = DecryptedLLMConnection(
                id=record.id,
                owner_id=record.owner_id,
                provider=record.provider,
                settings=record.settings,
                credentials=credentials,
            )
            await adapter.complete(
                decrypted,
                LLMRequest(
                    messages=[LLMMessage(role="user", content="Reply with OK.")],
                    model=record.default_model,
                    max_tokens=8,
                ),
            )
        except LLMError as error:
            category = error.category.value
            self._repository.record_test_result(record, succeeded=False)
            self._session.commit()
            return record, category
        except Exception:
            self._repository.record_test_result(record, succeeded=False)
            self._session.commit()
            return record, LLMErrorCategory.PROVIDER_ERROR.value
        self._repository.record_test_result(record, succeeded=True)
        self._session.commit()
        return record, None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
