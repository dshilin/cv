from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr


ProviderName = Literal["openai", "openai_compatible", "yandexgpt", "gigachat"]


class LLMConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ProviderName
    settings: dict[str, str] = Field(default_factory=dict)
    credentials: dict[str, SecretStr]
    default_model: str = Field(min_length=1, max_length=200)


class LLMConnectionSummary(BaseModel):
    id: UUID
    provider: ProviderName
    settings: dict[str, str]
    default_model: str
    status: Literal["pending", "verified", "failed", "disabled"]
    last_tested_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LLMConnectionTestResult(BaseModel):
    id: UUID
    provider: ProviderName
    model: str
    ok: bool
    status: Literal["verified", "failed"]
    error_category: str | None = None
    tested_at: datetime
