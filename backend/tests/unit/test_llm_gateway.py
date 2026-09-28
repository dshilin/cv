from dataclasses import dataclass
import asyncio
from uuid import UUID, uuid4

import pytest

from cv_backend.llm.contracts import LLMMessage, LLMRequest, LLMResponse
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection, LLMGateway


OWNER_ID = UUID("00000000-0000-4000-8000-000000000001")
OTHER_OWNER_ID = UUID("00000000-0000-4000-8000-000000000002")


@dataclass
class Connection:
    id: UUID
    owner_id: UUID
    provider: str = "openai"
    status: str = "verified"
    settings: dict[str, object] | None = None
    credentials_ciphertext: bytes = b"ciphertext"


class FakeRepository:
    def __init__(self, connection: Connection | None) -> None:
        self.connection = connection
        self.lookup: tuple[UUID, UUID] | None = None

    def get_for_owner(self, owner_id: UUID, connection_id: UUID):
        self.lookup = (owner_id, connection_id)
        if (
            self.connection is None
            or self.connection.owner_id != owner_id
            or self.connection.id != connection_id
        ):
            return None
        return self.connection


class FakeAdapter:
    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, connection, request: LLMRequest) -> LLMResponse:
        self.calls += 1
        assert connection.credentials == {"api_key": "secret"}
        return LLMResponse(text="done", provider=connection.provider, model=request.model)


class FakeCipher:
    def decrypt(self, ciphertext: bytes) -> bytes:
        assert ciphertext == b"ciphertext"
        return b'{"api_key":"secret"}'


def request() -> LLMRequest:
    return LLMRequest(messages=[LLMMessage(role="user", content="Hi")], model="test")


def test_decrypted_connection_repr_does_not_expose_credentials() -> None:
    connection = DecryptedLLMConnection(
        id=uuid4(),
        owner_id=OWNER_ID,
        provider="openai",
        settings={},
        credentials={"api_key": "repr-secret-marker"},
    )

    assert "repr-secret-marker" not in repr(connection)


def test_gateway_scopes_lookup_to_owner_and_dispatches_verified_connection() -> None:
    connection_id = uuid4()
    repository = FakeRepository(Connection(id=connection_id, owner_id=OWNER_ID))
    adapter = FakeAdapter()
    gateway = LLMGateway(repository=repository, cipher=FakeCipher(), adapters={"openai": adapter})

    response = asyncio.run(gateway.complete(OWNER_ID, connection_id, request()))

    assert repository.lookup == (OWNER_ID, connection_id)
    assert response.text == "done"
    assert adapter.calls == 1


def test_gateway_hides_connection_from_other_owner() -> None:
    connection_id = uuid4()
    repository = FakeRepository(Connection(id=connection_id, owner_id=OWNER_ID))
    adapter = FakeAdapter()
    gateway = LLMGateway(repository=repository, cipher=FakeCipher(), adapters={"openai": adapter})

    with pytest.raises(LLMError) as error:
        asyncio.run(gateway.complete(OTHER_OWNER_ID, connection_id, request()))

    assert error.value.category == LLMErrorCategory.CONNECTION_NOT_FOUND
    assert adapter.calls == 0


@pytest.mark.parametrize("status", ["pending", "disabled", "failed"])
def test_gateway_rejects_connection_that_is_not_verified(status: str) -> None:
    connection_id = uuid4()
    repository = FakeRepository(Connection(id=connection_id, owner_id=OWNER_ID, status=status))
    adapter = FakeAdapter()
    gateway = LLMGateway(repository=repository, cipher=FakeCipher(), adapters={"openai": adapter})

    with pytest.raises(LLMError) as error:
        asyncio.run(gateway.complete(OWNER_ID, connection_id, request()))

    assert error.value.category == LLMErrorCategory.CONNECTION_NOT_READY
    assert adapter.calls == 0
