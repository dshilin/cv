import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from cv_backend.llm.contracts import LLMRequest, LLMResponse
from cv_backend.llm.errors import LLMError, LLMErrorCategory


class ConnectionRecord(Protocol):
    id: UUID
    owner_id: UUID
    provider: str
    status: str
    settings: Mapping[str, object]
    credentials_ciphertext: bytes


class ConnectionRepository(Protocol):
    def get_for_owner(self, owner_id: UUID, connection_id: UUID) -> ConnectionRecord | None: ...


class CredentialCipher(Protocol):
    def decrypt(self, ciphertext: bytes) -> bytes: ...


@dataclass(frozen=True)
class DecryptedLLMConnection:
    id: UUID
    owner_id: UUID
    provider: str
    settings: Mapping[str, object]
    credentials: Mapping[str, str] = field(repr=False)


class ProviderAdapter(Protocol):
    async def complete(
        self, connection: DecryptedLLMConnection, request: LLMRequest
    ) -> LLMResponse: ...


class LLMGateway:
    def __init__(
        self,
        repository: ConnectionRepository,
        cipher: CredentialCipher,
        adapters: Mapping[str, ProviderAdapter],
    ) -> None:
        self._repository = repository
        self._cipher = cipher
        self._adapters = adapters

    async def complete(
        self, owner_id: UUID, connection_id: UUID, request: LLMRequest
    ) -> LLMResponse:
        record = self._repository.get_for_owner(owner_id, connection_id)
        if record is None:
            raise LLMError(LLMErrorCategory.CONNECTION_NOT_FOUND)
        if record.status != "verified":
            raise LLMError(LLMErrorCategory.CONNECTION_NOT_READY)
        adapter = self._adapters.get(record.provider)
        if adapter is None:
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR)
        try:
            credentials = json.loads(self._cipher.decrypt(record.credentials_ciphertext))
        except Exception:
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR) from None
        if not isinstance(credentials, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in credentials.items()
        ):
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR)
        connection = DecryptedLLMConnection(
            id=record.id,
            owner_id=record.owner_id,
            provider=record.provider,
            settings=record.settings,
            credentials=credentials,
        )
        return await adapter.complete(connection, request)
