import asyncio
import json
from uuid import uuid4

import httpx
import pytest

from cv_backend.llm.contracts import LLMMessage, LLMRequest
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection
from cv_backend.llm.providers.yandex import YandexGPTAdapter


FOLDER_ID = "b1gofolder123"


def connection(*, settings: dict[str, object] | None = None) -> DecryptedLLMConnection:
    return DecryptedLLMConnection(
        id=uuid4(),
        owner_id=uuid4(),
        provider="yandexgpt",
        settings=settings if settings is not None else {"folder_id": FOLDER_ID},
        credentials={"api_key": "yandex-secret"},
    )


def request(model: str = "yandexgpt/latest") -> LLMRequest:
    return LLMRequest(
        messages=[LLMMessage(role="user", content="Привет")],
        model=model,
        temperature=0.3,
        max_tokens=50,
    )


def test_yandex_adapter_uses_api_key_folder_header_and_model_uri() -> None:
    captured: dict[str, object] = {}

    def handler(http_request: httpx.Request) -> httpx.Response:
        captured["url"] = str(http_request.url)
        captured["headers"] = http_request.headers
        captured["payload"] = json.loads(http_request.content)
        return httpx.Response(
            200,
            json={"model": f"gpt://{FOLDER_ID}/yandexgpt/latest", "choices": [{"message": {"content": "Ответ"}}]},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = YandexGPTAdapter(http_client=client, endpoint_validator=lambda value: value)
    try:
        response = asyncio.run(adapter.complete(connection(), request()))
    finally:
        asyncio.run(client.aclose())

    assert captured["url"] == "https://ai.api.cloud.yandex.net/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Api-Key yandex-secret"
    assert captured["headers"]["OpenAI-Project"] == FOLDER_ID
    assert captured["payload"]["model"] == f"gpt://{FOLDER_ID}/yandexgpt/latest"
    assert captured["payload"]["max_tokens"] == 50
    assert response.text == "Ответ"
    assert response.provider == "yandexgpt"


@pytest.mark.parametrize(
    "settings",
    [{}, {"folder_id": ""}, {"folder_id": "bad/folder"}],
)
def test_yandex_adapter_rejects_missing_or_invalid_folder_id(settings: dict[str, object]) -> None:
    adapter = YandexGPTAdapter(endpoint_validator=lambda value: value)

    with pytest.raises(LLMError) as error:
        asyncio.run(adapter.complete(connection(settings=settings), request()))

    assert error.value.category == LLMErrorCategory.INVALID_REQUEST


def test_yandex_adapter_rejects_model_uri_for_another_folder() -> None:
    adapter = YandexGPTAdapter(endpoint_validator=lambda value: value)

    with pytest.raises(LLMError) as error:
        asyncio.run(adapter.complete(connection(), request("gpt://other-folder/yandexgpt/latest")))

    assert error.value.category == LLMErrorCategory.INVALID_REQUEST
