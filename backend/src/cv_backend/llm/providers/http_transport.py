import ssl
import logging
from collections.abc import Iterable
from typing import AsyncIterable

import httpcore
import httpx


class _SafeHttpcoreLogFilter(logging.Filter):
    """Prevent third-party transport traces from recording provider secrets or bodies."""

    def filter(self, record: logging.LogRecord) -> bool:
        # httpcore DEBUG trace fields include raw request and response headers.
        if record.levelno <= logging.DEBUG:
            return False
        record.msg = "Provider HTTP transport event"
        record.args = ()
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True


_SAFE_LOG_FILTER = _SafeHttpcoreLogFilter()
for _logger_name in (
    "httpcore.connection",
    "httpcore.http11",
    "httpcore.http2",
    "httpcore.proxy",
    "httpcore.socks",
    "httpx",
):
    logging.getLogger(_logger_name).addFilter(_SAFE_LOG_FILTER)


class PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    """Connect to the validated IP while httpcore keeps the original TLS hostname."""

    def __init__(self, hostname: str, port: int, address: str) -> None:
        self._hostname = hostname.encode("idna").decode("ascii").lower()
        self._port = port
        self._address = address
        self._backend = httpcore.AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[tuple[object, ...]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        if host.lower() != self._hostname or port != self._port:
            raise httpcore.ConnectError("Connection origin does not match validated endpoint")
        return await self._backend.connect_tcp(
            self._address,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[tuple[object, ...]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        raise httpcore.ConnectError("Unix sockets are not allowed for provider endpoints")

    async def sleep(self, seconds: float) -> None:
        await self._backend.sleep(seconds)


class _HttpcoreStream(httpx.AsyncByteStream):
    def __init__(self, stream: AsyncIterable[bytes], request: httpx.Request) -> None:
        self._stream = stream
        self._request = request

    async def __aiter__(self):
        try:
            async for chunk in self._stream:
                yield chunk
        except httpcore.TimeoutException:
            raise httpx.ReadTimeout("Provider response stream timed out", request=self._request) from None
        except (httpcore.NetworkError, httpcore.ProtocolError):
            raise httpx.NetworkError("Provider response stream failed", request=self._request) from None

    async def aclose(self) -> None:
            try:
                await self._stream.aclose()
            except httpcore.TimeoutException:
                raise httpx.ReadTimeout("Provider response stream timed out", request=self._request) from None
            except (httpcore.NetworkError, httpcore.ProtocolError):
                raise httpx.NetworkError("Provider response stream failed", request=self._request) from None


class PinnedHTTPTransport(httpx.AsyncBaseTransport):
    def __init__(self, hostname: str, port: int, address: str) -> None:
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=ssl.create_default_context(),
            network_backend=PinnedNetworkBackend(hostname, port, address),
            max_connections=10,
            max_keepalive_connections=0,
            retries=0,
        )

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        core_request = httpcore.Request(
            method=request.method,
            url=str(request.url),
            headers=request.headers.raw,
            content=request.stream,
            extensions={key: value for key, value in request.extensions.items() if key != "trace"},
        )
        try:
            response = await self._pool.handle_async_request(core_request)
        except httpcore.TimeoutException:
            raise httpx.TimeoutException("Provider request timed out", request=request) from None
        except (httpcore.NetworkError, httpcore.ProtocolError, httpcore.TimeoutException):
            raise httpx.NetworkError("Provider transport failed", request=request) from None
        return httpx.Response(
            status_code=response.status,
            headers=response.headers,
            stream=_HttpcoreStream(response.stream, request),
            extensions=response.extensions,
            request=request,
        )

    async def aclose(self) -> None:
        await self._pool.aclose()
