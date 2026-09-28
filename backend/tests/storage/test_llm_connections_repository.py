from uuid import UUID

import pytest
from sqlalchemy.exc import IntegrityError

from cv_backend.storage.models.llm_connection import LLMConnectionModel
from cv_backend.storage.repositories.llm_connections import LLMConnectionRepository


OWNER_ID = UUID("00000000-0000-4000-8000-000000000001")
OTHER_OWNER_ID = UUID("00000000-0000-4000-8000-000000000002")


def test_llm_connection_repository_scopes_reads_and_lists_by_owner(session_factory) -> None:
    with session_factory() as session:
        repository = LLMConnectionRepository(session)
        created = repository.create(
            owner_id=OWNER_ID,
            provider="openai",
            settings={"base_url": "https://api.openai.com/v1"},
            encrypted_credentials=b"ciphertext-only",
            default_model="gpt-test",
        )
        session.commit()
        connection_id = created.id

        assert repository.get_for_owner(OWNER_ID, connection_id) is not None
        assert repository.get_for_owner(OTHER_OWNER_ID, connection_id) is None
        assert [item.id for item in repository.list_for_owner(OWNER_ID)] == [connection_id]
        assert repository.list_for_owner(OTHER_OWNER_ID) == []
        assert created.status == "pending"
        assert created.credentials_ciphertext == b"ciphertext-only"
        assert "secret" not in repr(created.credentials_ciphertext)


def test_llm_connection_repository_rejects_unknown_provider(session_factory) -> None:
    with session_factory() as session:
        session.add(
            LLMConnectionModel(
                owner_id=OWNER_ID,
                provider="unknown",
                settings={},
                credentials_ciphertext=b"ciphertext",
                default_model="model",
                status="pending",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
