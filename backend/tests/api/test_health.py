from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from cv_backend.api.dependencies import get_current_user_id


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_current_user_dependency_fails_closed_until_auth_is_configured() -> None:
    with pytest.raises(HTTPException) as error:
        get_current_user_id()

    assert error.value.status_code == 401


def test_development_identity_requires_both_explicit_development_mode_and_uuid(monkeypatch) -> None:
    monkeypatch.setenv("CV_ENV", "development")
    monkeypatch.setenv("CV_DEV_USER_ID", "00000000-0000-4000-8000-000000000009")
    assert get_current_user_id() == UUID("00000000-0000-4000-8000-000000000009")


def test_development_identity_is_not_enabled_in_production(monkeypatch) -> None:
    monkeypatch.setenv("CV_ENV", "production")
    monkeypatch.setenv("CV_DEV_USER_ID", "00000000-0000-4000-8000-000000000009")
    with pytest.raises(HTTPException) as error:
        get_current_user_id()
    assert error.value.status_code == 401
