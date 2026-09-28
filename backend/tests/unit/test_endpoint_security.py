import asyncio
import socket

import httpcore
import pytest
import httpx

from cv_backend.llm.providers.endpoint_security import validate_https_base_url
from cv_backend.llm.providers.http_transport import PinnedHTTPTransport, PinnedNetworkBackend


@pytest.mark.parametrize(
    "url",
    [
        "http://provider.example/v1",
        "https://localhost/v1",
        "https://127.0.0.1/v1",
        "https://[::1]/v1",
        "https://user:pass@provider.example/v1",
        "https://provider.example/v1?token=secret",
    ],
)
def test_endpoint_security_rejects_unsafe_url_shapes(url: str) -> None:
    with pytest.raises(ValueError):
        validate_https_base_url(url, resolver=lambda *_args, **_kwargs: [])


@pytest.mark.parametrize("address", ["10.0.0.8", "169.254.2.2", "192.168.1.20", "fc00::1"])
def test_endpoint_security_rejects_dns_names_resolving_to_non_public_ip(address: str) -> None:
    result = [
        (
            socket.AF_INET6 if ":" in address else socket.AF_INET,
            socket.SOCK_STREAM,
            socket.IPPROTO_TCP,
            "",
            (address, 443),
        )
    ]

    with pytest.raises(ValueError):
        validate_https_base_url(
            "https://llm.example/v1", resolver=lambda *_args, **_kwargs: result
        )


def test_endpoint_security_accepts_public_https_endpoint_and_normalizes_trailing_slash() -> None:
    result = [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("8.8.8.8", 443))
    ]

    assert validate_https_base_url(
        "https://llm.example/v1/", resolver=lambda *_args, **_kwargs: result
    ) == "https://llm.example/v1"


def test_pinned_network_backend_connects_to_checked_ip_and_rejects_other_origins() -> None:
    class RecordingBackend:
        host = None

        async def connect_tcp(self, host, port, **kwargs):
            self.host = host
            return object()

        async def connect_unix_socket(self, path, **kwargs):
            raise AssertionError("Unix socket must not be called")

        async def sleep(self, seconds):
            return None

    backend = PinnedNetworkBackend("llm.example", 443, "8.8.8.8")
    recording = RecordingBackend()
    backend._backend = recording
    asyncio.run(backend.connect_tcp("llm.example", 443))

    assert recording.host == "8.8.8.8"
    with pytest.raises(httpcore.ConnectError):
        asyncio.run(backend.connect_tcp("attacker.example", 443))


def test_pinned_http_transport_uses_httpcore_pool_and_returns_httpx_response() -> None:
    transport = PinnedHTTPTransport("llm.example", 80, "8.8.8.8")
    transport._pool._network_backend._backend = httpcore.AsyncMockBackend(
        [b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"]
    )

    async def make_request() -> httpx.Response:
        async with httpx.AsyncClient(transport=transport) as client:
            return await client.get("http://llm.example/test")

    response = asyncio.run(make_request())
    assert response.status_code == 200
    assert response.text == "ok"
