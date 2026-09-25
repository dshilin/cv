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
