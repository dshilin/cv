import httpx

from cv_backend.llm.providers.openai_compatible import EndpointValidator, OpenAICompatibleAdapter


class YandexGPTAdapter(OpenAICompatibleAdapter):
    """Yandex AI Studio Chat Completions auth and model URI adapter."""

    def __init__(
        self,
        *,
        http_client: httpx.AsyncClient | None = None,
        endpoint_validator: EndpointValidator | None = None,
        timeout_seconds: float = 30,
    ) -> None:
        kwargs = {"http_client": http_client, "timeout_seconds": timeout_seconds}
        if endpoint_validator is not None:
            kwargs["endpoint_validator"] = endpoint_validator
        super().__init__(**kwargs)
