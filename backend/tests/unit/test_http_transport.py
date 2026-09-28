import asyncio
import logging

import httpcore
import httpx
import pytest

from cv_backend.llm.providers.http_transport import _HttpcoreStream
from cv_backend.llm.providers import http_transport  # noqa: F401


def test_response_stream_protocol_error_is_normalized_without_core_message() -> None:
    async def broken_stream():
        yield b"partial"
        raise httpcore.RemoteProtocolError("upstream echoed SYNTHETIC-SECRET")

    request = httpx.Request("POST", "https://provider.example")
    stream = _HttpcoreStream(broken_stream(), request)

    async def consume() -> None:
        with pytest.raises(httpx.NetworkError) as error:
            async for _ in stream:
                pass
        assert "SYNTHETIC-SECRET" not in str(error.value)
        assert str(error.value) == "Provider response stream failed"

    asyncio.run(consume())


def test_response_stream_timeout_remains_timeout_without_core_message() -> None:
    async def timed_out_stream():
        raise httpcore.ReadTimeout("upstream echoed SYNTHETIC-SECRET")
        yield b"unreachable"

    request = httpx.Request("POST", "https://provider.example")
    stream = _HttpcoreStream(timed_out_stream(), request)

    async def consume() -> None:
        with pytest.raises(httpx.ReadTimeout) as error:
            async for _ in stream:
                pass
        assert "SYNTHETIC-SECRET" not in str(error.value)
        assert str(error.value) == "Provider response stream timed out"

    asyncio.run(consume())


def test_httpcore_debug_and_error_logs_cannot_include_provider_secrets() -> None:
    logger = logging.getLogger("httpcore.http11")
    secret = "SYNTHETIC-REFLECTED-CREDENTIAL"
    assert any(isinstance(item, http_transport._SafeHttpcoreLogFilter) for item in logger.filters)
    secret_record = logging.LogRecord(
        "httpcore.http11", logging.DEBUG, __file__, 1,
        "response_headers=%r", [(b"X-Reflected", secret.encode())], None,
    )
    assert http_transport._SAFE_LOG_FILTER.filter(secret_record) is False

    error_record = logging.LogRecord(
        "httpcore.http11", logging.ERROR, __file__, 1,
        "transport failed with response header %s", (secret,), None,
    )
    assert http_transport._SAFE_LOG_FILTER.filter(error_record) is True
    assert secret not in error_record.getMessage()
    assert error_record.getMessage() == "Provider HTTP transport event"
    assert error_record.exc_info is None
    assert error_record.exc_text is None
    assert error_record.stack_info is None

    httpx_logger = logging.getLogger("httpx")
    assert any(isinstance(item, http_transport._SafeHttpcoreLogFilter) for item in httpx_logger.filters)
    reason_record = logging.LogRecord(
        "httpx", logging.INFO, __file__, 1,
        'HTTP Request: GET https://provider.example "HTTP/1.1 %s"',
        (secret,), None,
    )
    assert http_transport._SAFE_LOG_FILTER.filter(reason_record) is True
    assert secret not in reason_record.getMessage()
