import asyncio
import re
from collections.abc import Callable, Mapping
from typing import Any
from urllib.parse import urlsplit

import httpx

from cv_backend.llm.contracts import LLMRequest, LLMResponse, LLMUsage
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection
from cv_backend.llm.providers.endpoint_security import resolve_public_ip, validate_https_base_url
from cv_backend.llm.providers.http_transport import PinnedHTTPTransport


EndpointValidator = Callable[[str], str]


class OpenAICompatibleAdapter:
    def __init__(
        self,
        *,
        http_client: httpx.AsyncClient | None = None,
        endpoint_validator: EndpointValidator = validate_https_base_url,
        timeout_seconds: float = 30,
    ) -> None:
        self._client = http_client
        self._endpoint_validator = endpoint_validator
        self._timeout_seconds = timeout_seconds

    async def complete(
        self, connection: DecryptedLLMConnection, request: LLMRequest
    ) -> LLMResponse:
        provider = connection.provider
        if provider == "openai":
            base_url = "https://api.openai.com/v1"
        elif provider == "openai_compatible":
            base_url = connection.settings.get("base_url")
            if not isinstance(base_url, str):
                raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        elif provider == "yandexgpt":
            base_url = "https://ai.api.cloud.yandex.net/v1"
        elif provider == "gigachat":
            base_url = "https://api.giga.chat/v1"
        else:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        try:
            checked_base_url = await asyncio.to_thread(self._endpoint_validator, base_url)
        except (ValueError, OSError):
            raise LLMError(LLMErrorCategory.INVALID_REQUEST) from None
        endpoint = httpx.URL(checked_base_url)

        api_key = connection.credentials.get("api_key")
        if not api_key or not api_key.isascii() or any(ord(char) < 0x21 or ord(char) > 0x7E for char in api_key):
            raise LLMError(LLMErrorCategory.INVALID_CREDENTIALS)
        model = request.model
        headers = {"Authorization": f"Bearer {api_key}"}
        if provider == "yandexgpt":
            folder_id = connection.settings.get("folder_id")
            if not isinstance(folder_id, str) or not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", folder_id
            ):
                raise LLMError(LLMErrorCategory.INVALID_REQUEST)
            if model.startswith("gpt://"):
                model_uri = urlsplit(model)
                if (
                    model_uri.netloc != folder_id
                    or model_uri.query
                    or model_uri.fragment
                    or not model_uri.path.strip("/")
                ):
                    raise LLMError(LLMErrorCategory.INVALID_REQUEST)
            else:
                if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]*", model) or any(
                    part in {"", ".", ".."} for part in model.split("/")
                ):
                    raise LLMError(LLMErrorCategory.INVALID_REQUEST)
                model = f"gpt://{folder_id}/{model}"
            headers = {
                "Authorization": f"Api-Key {api_key}",
                "OpenAI-Project": folder_id,
            }
        payload: dict[str, Any] = {
            "model": model,
            "messages": [message.model_dump() for message in request.messages],
        }
        if request.temperature is not None:
            payload["temperature"] = request.temperature
        if request.max_tokens is not None:
            token_field = "max_completion_tokens" if provider == "openai" else "max_tokens"
            payload[token_field] = request.max_tokens
        own_client = self._client is None
        if self._client is None:
            try:
                pinned_ip = await asyncio.to_thread(
                    resolve_public_ip, endpoint.host, endpoint.port or 443
                )
            except (ValueError, OSError):
                raise LLMError(LLMErrorCategory.INVALID_REQUEST) from None
            transport = PinnedHTTPTransport(endpoint.host, endpoint.port or 443, pinned_ip)
            client = httpx.AsyncClient(
                transport=transport,
                timeout=httpx.Timeout(self._timeout_seconds),
                follow_redirects=False,
                trust_env=False,
            )
        else:
            client = self._client
        try:
            response = await client.post(
                f"{checked_base_url}/chat/completions",
                headers=headers,
                json=payload,
                follow_redirects=False,
            )
            if response.status_code >= 400:
                raise LLMError(self._status_category(response.status_code))
            if response.is_redirect:
                raise LLMError(LLMErrorCategory.INVALID_RESPONSE)
            try:
                data = response.json()
                return self._normalize_response(provider, data)
            except (ValueError, KeyError, TypeError, IndexError):
                raise LLMError(LLMErrorCategory.INVALID_RESPONSE) from None
        except httpx.TimeoutException:
            raise LLMError(LLMErrorCategory.TIMEOUT) from None
        except httpx.RequestError:
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR) from None
        finally:
            if own_client:
                await client.aclose()

    @staticmethod
    def _status_category(status_code: int) -> LLMErrorCategory:
        if status_code in {401, 403}:
            return LLMErrorCategory.INVALID_CREDENTIALS
        if status_code == 402:
            return LLMErrorCategory.QUOTA_EXCEEDED
        if status_code == 404:
            return LLMErrorCategory.MODEL_UNAVAILABLE
        if status_code == 429:
            return LLMErrorCategory.RATE_LIMITED
        if status_code >= 500:
            return LLMErrorCategory.PROVIDER_ERROR
        return LLMErrorCategory.INVALID_REQUEST

    @staticmethod
    def _normalize_response(provider: str, data: Mapping[str, Any]) -> LLMResponse:
        choices = data["choices"]
        if not isinstance(choices, list) or not choices:
            raise ValueError("Missing completion choices")
        message = choices[0]["message"]
        text = message["content"]
        model = data["model"]
        if not isinstance(text, str) or not isinstance(model, str):
            raise ValueError("Invalid completion fields")
        usage_data = data.get("usage")
        usage = None
        if usage_data is not None:
            if not isinstance(usage_data, Mapping):
                raise ValueError("Invalid usage")
            input_tokens = usage_data.get("prompt_tokens", usage_data.get("input_tokens"))
            output_tokens = usage_data.get("completion_tokens", usage_data.get("output_tokens"))
            total_tokens = usage_data.get("total_tokens")
            if not all(isinstance(value, int) and value >= 0 for value in (input_tokens, output_tokens, total_tokens)):
                raise ValueError("Invalid usage fields")
            usage = LLMUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
            )
        return LLMResponse(text=text, provider=provider, model=model, usage=usage)
