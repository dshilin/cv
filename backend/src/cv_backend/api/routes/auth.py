from __future__ import annotations

import base64
import hashlib
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, SecretStr
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_db_session
from cv_backend.services.auth import AuthService, SESSION_SECONDS

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
AUTH_URL = "https://id.vk.ru/authorize"
TOKEN_URL = "https://id.vk.ru/oauth2/auth"
USER_INFO_URL = "https://id.vk.ru/oauth2/user_info"


def config() -> tuple[str, str] | None:
    app_id = os.getenv("VK_ID_APP_ID")
    redirect_uri = os.getenv("VK_ID_REDIRECT_URI")
    if not app_id or not redirect_uri:
        return None
    return app_id, redirect_uri


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _store_flow(response: Response, *, state: str, verifier: str, secret: str) -> None:
    from itsdangerous import URLSafeTimedSerializer

    payload = URLSafeTimedSerializer(secret, salt="vk-id-oauth").dumps({"state": state, "verifier": verifier})
    response.set_cookie("cv_vk_flow", payload, max_age=600, httponly=True, secure=True, samesite="lax", path="/api/v1/auth")


def _load_flow(value: str, secret: str) -> dict[str, str]:
    from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

    try:
        payload = URLSafeTimedSerializer(secret, salt="vk-id-oauth").loads(value, max_age=600)
        if not isinstance(payload, dict) or not isinstance(payload.get("state"), str) or not isinstance(payload.get("verifier"), str):
            raise ValueError
        return payload
    except (BadSignature, SignatureExpired, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired VK login state") from None


@router.get("/vk/start")
def vk_start() -> RedirectResponse:
    settings = config()
    secret = os.getenv("CV_AUTH_STATE_SECRET")
    if settings is None or not secret or not os.getenv("CV_SESSION_COOKIE_SECURE", "true").lower() == "true":
        raise HTTPException(status_code=503, detail="VK ID authentication is not configured")
    app_id, redirect_uri = settings
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode("ascii")).digest())
    url = AUTH_URL + "?" + urlencode({
        "client_id": app_id, "redirect_uri": redirect_uri, "response_type": "code",
        "state": state, "code_challenge": challenge,
        "code_challenge_method": "s256",
    })
    response = RedirectResponse(url, status_code=302)
    _store_flow(response, state=state, verifier=verifier, secret=secret)
    return response


@router.get("/vk/callback")
async def vk_callback(request: Request, session: Session = Depends(get_db_session)) -> RedirectResponse:
    settings, secret = config(), os.getenv("CV_AUTH_STATE_SECRET")
    if settings is None or not secret:
        raise HTTPException(status_code=503, detail="VK ID authentication is not configured")
    code, state, device_id = (request.query_params.get("code"), request.query_params.get("state"), request.query_params.get("device_id"))
    flow_cookie = request.cookies.get("cv_vk_flow")
    if not code or not state or not device_id or not flow_cookie:
        raise HTTPException(status_code=400, detail="VK login response is incomplete")
    flow = _load_flow(flow_cookie, secret)
    if not secrets.compare_digest(flow["state"], state):
        raise HTTPException(status_code=400, detail="VK login state mismatch")
    app_id, redirect_uri = settings
    query = {"grant_type": "authorization_code", "code_verifier": flow["verifier"],
             "client_id": app_id, "redirect_uri": redirect_uri, "state": state, "device_id": device_id}
    body = {"code": code}
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            token_response = await client.post(TOKEN_URL, params=query, data=body)
            token_response.raise_for_status()
            token_data = token_response.json()
            token_state = token_data.get("state")
            if not isinstance(token_state, str) or not secrets.compare_digest(state, token_state):
                raise ValueError("token state mismatch")
            access_token = token_data.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise ValueError("missing access token")
            info_response = await client.post(USER_INFO_URL, params={"client_id": app_id}, data={"access_token": access_token})
            info_response.raise_for_status()
            info = info_response.json()
        subject = info.get("user", {}).get("user_id") or info.get("user_id") or token_data.get("user_id")
        if not isinstance(subject, (str, int)) or not str(subject):
            raise ValueError("missing subject")
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="VK authentication failed") from None
    service = AuthService(session)
    owner_id = service.owner_for_vk_subject(str(subject))
    token, csrf = service.create_session(owner_id)
    response = RedirectResponse("/profile", status_code=303)
    response.delete_cookie("cv_vk_flow", path="/api/v1/auth")
    response.set_cookie("cv_session", token, max_age=SESSION_SECONDS, httponly=True, secure=True, samesite="lax", path="/")
    response.set_cookie("cv_csrf", csrf, max_age=SESSION_SECONDS, httponly=False, secure=True, samesite="strict", path="/")
    return response


class LogoutPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    csrf_token: SecretStr


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutPayload, request: Request, response: Response, session: Session = Depends(get_db_session)) -> Response:
    token = request.cookies.get("cv_session")
    csrf = payload.csrf_token.get_secret_value()
    service = AuthService(session)
    if not token or not service.csrf_matches(token, csrf):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    service.revoke_session(token)
    response.delete_cookie("cv_session", path="/")
    response.delete_cookie("cv_csrf", path="/")
    return response


@router.get("/me")
def current_user(request: Request, session: Session = Depends(get_db_session)) -> dict[str, bool]:
    token = request.cookies.get("cv_session")
    if token and AuthService(session).owner_for_session(token):
        return {"authenticated": True}
    if os.getenv("CV_ENV") == "development" and os.getenv("CV_DEV_USER_ID"):
        return {"authenticated": True, "development": True}
    return {"authenticated": False}
