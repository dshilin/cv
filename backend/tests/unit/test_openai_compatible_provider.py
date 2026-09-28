import asyncio
import json

import httpx
import pytest

from cv_backend.llm.contracts import LLMMessage, LLMRequest
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection
from cv_backend.llm.providers.openai_compatible import OpenAICompatibleAdapter


def make_connection(provider: str = "openai") -> DecryptedLLMConnection:
    settings = {"base_url": "https://llm.example/v1"}
    return DecryptedLLMConnection(
        id=__import__("uuid").uuid4(),
        owner_id=__import__("uuid").uuid4(),
        provider=provider,
        settings=settings,
        credentials={"api_key": "secret-key"},
    )


def make_request() -> LLMRequest:
    return LLMRequest(
        messages=[LLMMessage(role="user", content="Hello")],
        model="test-model",
        temperature=0.4,
        max_tokens=25,
    )


def test_openai_compatible_adapter_posts_normalized_completion_and_parses_usage() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["Authorization"]
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": "actual-model",
                "choices": [{"message": {"content": "Hello back"}}],
                "usage": {"prompt_tokens": 4, "completion_tokens": 3, "total_tokens": 7},
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        response = asyncio.run(adapter.complete(make_connection("openai_compatible"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert captured["url"] == "https://llm.example/v1/chat/completions"
    assert captured["authorization"] == "Bearer secret-key"
    assert captured["payload"] == {
        "model": "test-model",
        "messages": [{"role": "user", "content": "Hello"}],
        "temperature": 0.4,
        "max_tokens": 25,
    }
    assert response.text == "Hello back"
    assert response.model == "actual-model"
    assert response.usage is not None and response.usage.input_tokens == 4


@pytest.mark.parametrize(
    "status,category",
    [
        (401, LLMErrorCategory.INVALID_CREDENTIALS),
        (404, LLMErrorCategory.MODEL_UNAVAILABLE),
        (429, LLMErrorCategory.RATE_LIMITED),
        (500, LLMErrorCategory.PROVIDER_ERROR),
    ],
)
def test_openai_compatible_adapter_normalizes_http_errors_without_upstream_body(
    status: int, category: LLMErrorCategory, caplog
) -> None:
    secret = "secret-key"
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _request: httpx.Response(status, text=secret))
    )
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        with pytest.raises(LLMError) as error:
            asyncio.run(adapter.complete(make_connection("openai_compatible"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert error.value.category == category
    assert secret not in str(error.value)
    assert secret not in caplog.text


def test_openai_adapter_uses_official_endpoint_and_current_token_limit_field() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"model": "actual-model", "choices": [{"message": {"content": "ok"}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        asyncio.run(adapter.complete(make_connection("openai"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["payload"]["max_completion_tokens"] == 25


def test_openai_compatible_adapter_does_not_follow_redirects() -> None:
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(302, headers={"Location": "https://127.0.0.1/private"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        with pytest.raises(LLMError):
            asyncio.run(adapter.complete(make_connection("openai_compatible"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert len(requests) == 1


def test_openai_compatible_adapter_normalizes_timeout_without_exposing_exception_text() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("upstream leaked secret-key", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        with pytest.raises(LLMError) as error:
            asyncio.run(adapter.complete(make_connection("openai_compatible"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert error.value.category == LLMErrorCategory.TIMEOUT
    assert "secret-key" not in str(error.value)


def test_openai_compatible_adapter_rejects_malformed_success_response() -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={"choices": []}))
    )
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        with pytest.raises(LLMError) as error:
            asyncio.run(adapter.complete(make_connection("openai_compatible"), make_request()))
    finally:
        asyncio.run(client.aclose())

    assert error.value.category == LLMErrorCategory.INVALID_RESPONSE


def test_openai_compatible_adapter_rejects_header_control_characters_without_leaking_key() -> None:
    connection = make_connection("openai")
    connection.credentials["api_key"] = "secret-key\n"
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail("request must not be sent")))
    adapter = OpenAICompatibleAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        with pytest.raises(LLMError) as error:
            asyncio.run(adapter.complete(connection, make_request()))
    finally:
        asyncio.run(client.aclose())

    assert error.value.category == LLMErrorCategory.INVALID_CREDENTIALS
    assert "secret-key" not in str(error.value)
