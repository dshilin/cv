import asyncio
import json
import time
from uuid import UUID, uuid4

import httpx
import pytest

from cv_backend.llm.contracts import LLMMessage, LLMRequest
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection
from cv_backend.llm.providers.gigachat import GigaChatAdapter, GigaChatTokenProvider


def connection(scope: str = "PERS") -> DecryptedLLMConnection:
    return DecryptedLLMConnection(
        id=uuid4(),
        owner_id=uuid4(),
        provider="gigachat",
        settings={"scope": scope},
        credentials={"authorization_key": "gigachat-secret"},
    )


def request() -> LLMRequest:
    return LLMRequest(
        messages=[LLMMessage(role="user", content="Hello")],
        model="GigaChat",
        temperature=0.2,
        max_tokens=20,
    )


def test_gigachat_token_provider_sends_rquid_and_caches_unexpired_token() -> None:
    calls: list[httpx.Request] = []

    def handler(http_request: httpx.Request) -> httpx.Response:
        calls.append(http_request)
        return httpx.Response(200, json={"access_token": "short-lived-token", "expires_at": time.time() + 1800})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    token_provider = GigaChatTokenProvider(http_client=client)
    llm_connection = connection("B2B")
    try:
        first, second = asyncio.run(
            _gather_tokens(token_provider, llm_connection)
        )
    finally:
        asyncio.run(client.aclose())

    assert first == "short-lived-token"
    assert second == first
    assert len(calls) == 1
    assert calls[0].url == "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    assert calls[0].headers["RqUID"]
    UUID(calls[0].headers["RqUID"])
    assert calls[0].headers["Authorization"] == "Basic gigachat-secret"
    assert calls[0].content == b"scope=GIGACHAT_API_B2B"


async def _gather_tokens(provider: GigaChatTokenProvider, conn: DecryptedLLMConnection) -> tuple[str, str]:
    return await asyncio.gather(provider.get_token(conn), provider.get_token(conn))


def test_gigachat_token_provider_refreshes_token_near_expiry() -> None:
    now = 1_800_000_000.0
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        expiry = now + (30 if calls == 1 else 1800)
        return httpx.Response(200, json={"access_token": f"token-{calls}", "expires_at": expiry})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = GigaChatTokenProvider(http_client=client, clock=lambda: now)
    conn = connection()
    try:
        first = asyncio.run(provider.get_token(conn))
        second = asyncio.run(provider.get_token(conn))
    finally:
        asyncio.run(client.aclose())

    assert first == "token-1"
    assert second == "token-2"
    assert calls == 2


def test_gigachat_adapter_uses_bearer_token_and_normalizes_completion() -> None:
    captured: list[httpx.Request] = []

    def handler(http_request: httpx.Request) -> httpx.Response:
        captured.append(http_request)
        if http_request.url.path == "/api/v2/oauth":
            return httpx.Response(200, json={"access_token": "access-token", "expires_at": time.time() + 1800})
        return httpx.Response(
            200,
            json={
                "model": "GigaChat",
                "choices": [{"message": {"content": "Hello back"}}],
                "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = GigaChatAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        response = asyncio.run(adapter.complete(connection(), request()))
    finally:
        asyncio.run(client.aclose())

    completion_request = captured[-1]
    assert completion_request.url == "https://api.giga.chat/v1/chat/completions"
    assert completion_request.headers["Authorization"] == "Bearer access-token"
    assert json.loads(completion_request.content)["model"] == "GigaChat"
    assert response.provider == "gigachat"
    assert response.text == "Hello back"
    assert response.usage is not None and response.usage.total_tokens == 5


@pytest.mark.parametrize("scope", ["PERS", "B2B", "CORP"])
def test_gigachat_token_provider_maps_scope(scope: str) -> None:
    captured: list[bytes] = []

    def handler(http_request: httpx.Request) -> httpx.Response:
        captured.append(http_request.content)
        return httpx.Response(200, json={"access_token": "token", "expires_at": time.time() + 1800})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = GigaChatTokenProvider(http_client=client)
    try:
        asyncio.run(provider.get_token(connection(scope)))
    finally:
        asyncio.run(client.aclose())

    assert captured == [f"scope=GIGACHAT_API_{scope}".encode()]


def test_gigachat_token_provider_rejects_unsupported_scope_without_leaking_key() -> None:
    provider = GigaChatTokenProvider(http_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail())))
    conn = connection("ADMIN")

    with pytest.raises(LLMError) as error:
        asyncio.run(provider.get_token(conn))

    assert error.value.category == LLMErrorCategory.INVALID_REQUEST
    assert "gigachat-secret" not in str(error.value)


def test_gigachat_default_transport_resolves_endpoint_off_event_loop(monkeypatch) -> None:
    from cv_backend.llm.providers import gigachat

    calls: list[tuple[str, int]] = []

    class FakeClient:
        async def post(self, url, **kwargs):
            return httpx.Response(
                200,
                json={"access_token": "resolved-token", "expires_at": time.time() + 1800},
                request=httpx.Request("POST", url),
            )

        async def aclose(self):
            return None

    monkeypatch.setattr(
        gigachat,
        "resolve_public_ip",
        lambda hostname, port: calls.append((hostname, port)) or "8.8.8.8",
    )
    monkeypatch.setattr(gigachat.httpx, "AsyncClient", lambda **_kwargs: FakeClient())
    provider = GigaChatTokenProvider()

    token = asyncio.run(provider.get_token(connection()))

    assert token == "resolved-token"
    assert calls == [("ngw.devices.sberbank.ru", 9443)]
