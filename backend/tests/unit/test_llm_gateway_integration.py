import asyncio
import json
from uuid import UUID

import pytest

from cv_backend.llm.contracts import LLMMessage, LLMRequest, LLMResponse
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection, LLMGateway
from cv_backend.llm.security import CredentialCipher
from cv_backend.storage.repositories.llm_connections import LLMConnectionRepository


OWNER_ID = UUID("00000000-0000-4000-8000-000000000001")
OTHER_OWNER_ID = UUID("00000000-0000-4000-8000-000000000002")


class RecordingAdapter:
    async def complete(
        self, connection: DecryptedLLMConnection, request: LLMRequest
    ) -> LLMResponse:
        assert connection.credentials == {"api_key": "encrypted-key"}
        assert connection.owner_id == OWNER_ID
        return LLMResponse(text="ok", provider=connection.provider, model=request.model)


def test_gateway_loads_owner_connection_decrypts_and_dispatches(session_factory) -> None:
    cipher = CredentialCipher(bytes(range(32)))
    with session_factory() as session:
        record = LLMConnectionRepository(session).create(
            owner_id=OWNER_ID,
            provider="openai",
            settings={},
            encrypted_credentials=cipher.encrypt(
                json.dumps({"api_key": "encrypted-key"}).encode()
            ),
            default_model="test-model",
        )
        record.status = "verified"
        session.commit()
        gateway = LLMGateway(
            repository=LLMConnectionRepository(session),
            cipher=cipher,
            adapters={"openai": RecordingAdapter()},
        )
        request = LLMRequest(
            messages=[LLMMessage(role="user", content="Hello")], model="test-model"
        )

        response = asyncio.run(gateway.complete(OWNER_ID, record.id, request))

    assert response.text == "ok"


def test_gateway_hides_existing_connection_from_other_owner(session_factory) -> None:
    cipher = CredentialCipher(bytes(range(32)))
    with session_factory() as session:
        record = LLMConnectionRepository(session).create(
            owner_id=OWNER_ID,
            provider="openai",
            settings={},
            encrypted_credentials=cipher.encrypt(b'{"api_key":"encrypted-key"}'),
            default_model="test-model",
        )
        record.status = "verified"
        session.commit()
        gateway = LLMGateway(
            repository=LLMConnectionRepository(session),
            cipher=cipher,
            adapters={"openai": RecordingAdapter()},
        )

        with pytest.raises(LLMError) as error:
            asyncio.run(
                gateway.complete(
                    OTHER_OWNER_ID,
                    record.id,
                    LLMRequest(
                        messages=[LLMMessage(role="user", content="Hello")],
                        model="test-model",
                    ),
                )
            )

    assert error.value.category == LLMErrorCategory.CONNECTION_NOT_FOUND
