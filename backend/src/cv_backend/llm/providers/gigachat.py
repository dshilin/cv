import asyncio
import time
from dataclasses import replace
from typing import Callable
from uuid import uuid4

import httpx

from cv_backend.llm.contracts import LLMRequest, LLMResponse
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.gateway import DecryptedLLMConnection
from cv_backend.llm.providers.endpoint_security import resolve_public_ip
from cv_backend.llm.providers.http_transport import PinnedHTTPTransport
from cv_backend.llm.providers.openai_compatible import EndpointValidator, OpenAICompatibleAdapter
from cv_backend.llm.providers.token_cache import AccessToken, AccessTokenCache


_SCOPE_VALUES = {
    "PERS": "GIGACHAT_API_PERS",
    "B2B": "GIGACHAT_API_B2B",
    "CORP": "GIGACHAT_API_CORP",
}
_TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"


class GigaChatTokenProvider:
    def __init__(
        self,
        *,
        http_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.time,
        timeout_seconds: float = 20,
    ) -> None:
        self._client = http_client
        self._clock = clock
        self._timeout_seconds = timeout_seconds
        self._cache = AccessTokenCache()

    async def get_token(self, connection: DecryptedLLMConnection) -> str:
        scope = connection.settings.get("scope")
        scope_value = _SCOPE_VALUES.get(scope) if isinstance(scope, str) else None
        authorization_key = connection.credentials.get("authorization_key")
        if scope_value is None:
            raise LLMError(LLMErrorCategory.INVALID_REQUEST)
        if not authorization_key or not authorization_key.isascii() or any(
            ord(char) < 0x21 or ord(char) > 0x7E for char in authorization_key
        ):
            raise LLMError(LLMErrorCategory.INVALID_CREDENTIALS)

        cache_key = connection.id
        cached = self._cache.get(cache_key, self._clock())
        if cached is not None:
            return cached.value
        lock = self._cache.lock_for(cache_key)
        async with lock:
            cached = self._cache.get(cache_key, self._clock())
            if cached is not None:
                return cached.value
            token = await self._fetch_token(authorization_key, scope_value)
            self._cache.set(cache_key, token)
            return token.value

    async def _fetch_token(self, authorization_key: str, scope: str) -> AccessToken:
        own_client = self._client is None
        if self._client is None:
            endpoint = httpx.URL(_TOKEN_URL)
            try:
                address = await asyncio.to_thread(
                    resolve_public_ip, endpoint.host, endpoint.port or 443
                )
            except (ValueError, OSError):
                raise LLMError(LLMErrorCategory.PROVIDER_ERROR) from None
            client = httpx.AsyncClient(
                transport=PinnedHTTPTransport(endpoint.host, endpoint.port or 443, address),
                timeout=httpx.Timeout(self._timeout_seconds),
                follow_redirects=False,
                trust_env=False,
            )
        else:
            client = self._client
        try:
            response = await client.post(
                _TOKEN_URL,
                headers={
                    "Authorization": f"Basic {authorization_key}",
                    "RqUID": str(uuid4()),
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"scope": scope},
                follow_redirects=False,
            )
            if response.status_code >= 400:
                raise LLMError(OpenAICompatibleAdapter._status_category(response.status_code))
            data = response.json()
            value = data.get("access_token")
            expiry = data.get("expires_at")
            if not isinstance(value, str) or not value:
                raise LLMError(LLMErrorCategory.INVALID_RESPONSE)
            if isinstance(expiry, (float, int)):
                expires_at = float(expiry)
                if expires_at > 1e12:
                    expires_at /= 1000
            else:
                expires_at = self._clock() + 1800
            if expires_at <= self._clock():
                raise LLMError(LLMErrorCategory.INVALID_RESPONSE)
            return AccessToken(value=value, expires_at=expires_at)
        except LLMError:
            raise
        except httpx.TimeoutException:
            raise LLMError(LLMErrorCategory.TIMEOUT) from None
        except httpx.RequestError:
            raise LLMError(LLMErrorCategory.PROVIDER_ERROR) from None
        except (ValueError, TypeError, AttributeError):
            raise LLMError(LLMErrorCategory.INVALID_RESPONSE) from None
        finally:
            if own_client:
                await client.aclose()


class GigaChatAdapter(OpenAICompatibleAdapter):
    def __init__(
        self,
        *,
        http_client: httpx.AsyncClient | None = None,
        token_provider: GigaChatTokenProvider | None = None,
        endpoint_validator: EndpointValidator | None = None,
        timeout_seconds: float = 30,
    ) -> None:
        kwargs = {"http_client": http_client, "timeout_seconds": timeout_seconds}
        if endpoint_validator is not None:
            kwargs["endpoint_validator"] = endpoint_validator
        super().__init__(**kwargs)
        self._token_provider = token_provider or GigaChatTokenProvider(http_client=http_client)

    async def complete(
        self, connection: DecryptedLLMConnection, request: LLMRequest
    ) -> LLMResponse:
        token = await self._token_provider.get_token(connection)
        token_connection = replace(
            connection,
            credentials={"api_key": token},
        )
        return await super().complete(token_connection, request)
