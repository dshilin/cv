import hashlib
import os
from urllib.parse import parse_qs, urlparse

from cv_backend.api.routes.auth import _load_flow, _store_flow
from cv_backend.services.auth import AuthService
from cv_backend.storage.models.auth import AuthIdentityModel, AuthSessionModel


def test_vk_start_uses_state_and_pkce(client, monkeypatch):
    monkeypatch.setenv("VK_ID_APP_ID", "test-app")
    monkeypatch.setenv("VK_ID_REDIRECT_URI", "https://example.test/api/v1/auth/vk/callback")
    monkeypatch.setenv("CV_AUTH_STATE_SECRET", "test-secret-with-enough-entropy")
    response = client.get("/api/v1/auth/vk/start", follow_redirects=False)
    assert response.status_code == 302
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["response_type"] == ["code"]
    assert query["code_challenge_method"] == ["s256"]
    assert len(query["state"][0]) >= 32
    assert "cv_vk_flow" in response.headers["set-cookie"]


def test_auth_session_is_hashed_and_revocable(session_factory):
    with session_factory() as session:
        service = AuthService(session)
        owner_id = service.owner_for_vk_subject("vk-user-7")
        token, csrf = service.create_session(owner_id)
        assert service.owner_for_session(token) == owner_id
        assert service.csrf_matches(token, csrf)
        record = session.query(AuthSessionModel).one()
        assert record.token_hash == hashlib.sha256(token.encode()).digest()
        assert token not in record.token_hash.hex()
        service.revoke_session(token)
        assert service.owner_for_session(token) is None
        assert session.query(AuthIdentityModel).one().provider == "vk_id"


def test_flow_cookie_rejects_tampering():
    from fastapi import HTTPException
    import pytest

    with pytest.raises(HTTPException) as error:
        _load_flow("tampered", "test-secret")
    assert error.value.status_code == 400
