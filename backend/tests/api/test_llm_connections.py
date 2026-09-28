from uuid import UUID

import pytest

from cv_backend.api.dependencies import get_current_user_id
from cv_backend.llm.contracts import LLMResponse
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.storage.models.llm_connection import LLMConnectionModel


OWNER_ID = UUID("00000000-0000-4000-8000-000000000001")
OTHER_OWNER_ID = UUID("00000000-0000-4000-8000-000000000002")


class FakeAdapter:
    def __init__(self, *, failure: LLMError | None = None) -> None:
        self.failure = failure
        self.calls = 0

    async def complete(self, connection, request) -> LLMResponse:
        self.calls += 1
        if self.failure:
            raise self.failure
        assert connection.credentials["api_key"] == "top-secret-key"
        return LLMResponse(text="This text must not be returned", provider=connection.provider, model=request.model)


def test_create_and_list_connection_never_return_credentials(client, monkeypatch) -> None:
    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())

    created = client.post(
        "/api/v1/llm-connections",
        json={
            "provider": "openai",
            "settings": {},
            "credentials": {"api_key": "top-secret-key"},
            "default_model": "gpt-test",
        },
    )
    assert created.status_code == 201
    connection_data = created.json()
    assert connection_data["status"] == "pending"
    assert "top-secret-key" not in created.text
    assert "credentials" not in connection_data
    assert "credentials_ciphertext" not in connection_data

    listed = client.get("/api/v1/llm-connections")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "top-secret-key" not in listed.text

    with client.app.state.session_factory() as session:
        row = session.get(LLMConnectionModel, UUID(connection_data["id"]))
        assert row is not None
        assert b"top-secret-key" not in row.credentials_ciphertext


def test_test_connection_marks_verified_and_returns_no_generated_text(client, monkeypatch) -> None:
    from cv_backend.api.routes.llm_connections import get_provider_adapters

    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    adapter = FakeAdapter()
    client.app.dependency_overrides[get_provider_adapters] = lambda: {
        "openai": adapter,
        "openai_compatible": adapter,
        "yandexgpt": adapter,
        "gigachat": adapter,
    }
    created = client.post(
        "/api/v1/llm-connections",
        json={"provider": "openai", "credentials": {"api_key": "top-secret-key"}, "default_model": "gpt-test"},
    ).json()

    result = client.post(f"/api/v1/llm-connections/{created['id']}/test")

    assert result.status_code == 200
    assert result.json()["ok"] is True
    assert result.json()["status"] == "verified"
    assert "This text must not be returned" not in result.text
    assert "top-secret-key" not in result.text
    assert adapter.calls == 1


def test_cross_owner_cannot_read_or_test_another_users_connection(client, monkeypatch) -> None:
    from cv_backend.api.routes.llm_connections import get_provider_adapters

    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    adapter = FakeAdapter()
    client.app.dependency_overrides[get_provider_adapters] = lambda: {"openai": adapter}
    created = client.post(
        "/api/v1/llm-connections",
        json={"provider": "openai", "credentials": {"api_key": "top-secret-key"}, "default_model": "gpt-test"},
    ).json()
    client.app.dependency_overrides[get_current_user_id] = lambda: OTHER_OWNER_ID

    assert client.get("/api/v1/llm-connections").json() == []
    tested = client.post(f"/api/v1/llm-connections/{created['id']}/test")
    assert tested.status_code == 404
    assert adapter.calls == 0


def test_test_connection_returns_only_normalized_failure(client, monkeypatch) -> None:
    from cv_backend.api.routes.llm_connections import get_provider_adapters

    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    adapter = FakeAdapter(failure=LLMError(LLMErrorCategory.INVALID_CREDENTIALS))
    client.app.dependency_overrides[get_provider_adapters] = lambda: {"openai": adapter}
    created = client.post(
        "/api/v1/llm-connections",
        json={"provider": "openai", "credentials": {"api_key": "top-secret-key"}, "default_model": "gpt-test"},
    ).json()

    result = client.post(f"/api/v1/llm-connections/{created['id']}/test")

    assert result.status_code == 200
    assert result.json()["ok"] is False
    assert result.json()["error_category"] == "invalid_credentials"
    assert "top-secret-key" not in result.text


def test_llm_connection_operations_fail_closed_without_encryption_key(client, monkeypatch) -> None:
    monkeypatch.delenv("CV_LLM_ENCRYPTION_KEY", raising=False)

    response = client.get("/api/v1/llm-connections")

    assert response.status_code == 503


def test_connection_create_rejects_missing_provider_credentials_and_insecure_endpoint(client, monkeypatch) -> None:
    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())

    missing_key = client.post(
        "/api/v1/llm-connections",
        json={"provider": "openai", "credentials": {"api_key": ""}, "default_model": "gpt-test"},
    )
    insecure_endpoint = client.post(
        "/api/v1/llm-connections",
        json={
            "provider": "openai_compatible",
            "settings": {"base_url": "http://127.0.0.1:8080/v1"},
            "credentials": {"api_key": "compatible-key"},
            "default_model": "model",
        },
    )

    assert missing_key.status_code == 422
    assert insecure_endpoint.status_code == 422


def test_validation_error_never_echoes_submitted_credentials(client, monkeypatch) -> None:
    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    marker = "SYNTHETIC-VALIDATION-SECRET"

    response = client.post(
        "/api/v1/llm-connections",
        json={"provider": "openai", "credentials": {"api_key": marker}},
    )

    assert response.status_code == 422
    assert marker not in response.text
    assert "input" not in response.json()["detail"][0]

    malformed = client.post(
        "/api/v1/llm-connections",
        content='{"credentials":{"api_key":"' + marker + '"}',
        headers={"content-type": "application/json"},
    )
    assert malformed.status_code == 422
    assert marker not in malformed.text


def test_llm_connections_use_production_identity_dependency(client, monkeypatch) -> None:
    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    monkeypatch.delenv("CV_ENV", raising=False)
    client.app.dependency_overrides.pop(get_current_user_id)

    response = client.get("/api/v1/llm-connections")

    assert response.status_code == 401
