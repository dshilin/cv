from enum import StrEnum


class LLMErrorCategory(StrEnum):
    INVALID_CREDENTIALS = "invalid_credentials"
    MODEL_UNAVAILABLE = "model_unavailable"
    QUOTA_EXCEEDED = "quota_exceeded"
    RATE_LIMITED = "rate_limited"
    TIMEOUT = "timeout"
    PROVIDER_ERROR = "provider_error"
    INVALID_RESPONSE = "invalid_response"
    INVALID_REQUEST = "invalid_request"
    CONNECTION_NOT_FOUND = "connection_not_found"
    CONNECTION_NOT_READY = "connection_not_ready"


class LLMError(Exception):
    """Safe normalized error; never store upstream body or credentials here."""

    def __init__(self, category: LLMErrorCategory) -> None:
        self.category = category
        super().__init__(category.value)
