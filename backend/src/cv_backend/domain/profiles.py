from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_roles: list[str] | None = None
    search_preferences: dict[str, Any] | None = None
    headline: str | None = None
    summary: str | None = None
    section_order: list[str] | None = None
    text_overrides: dict[UUID, str] | None = None

    @field_validator("name")
    @classmethod
    def name_cannot_be_cleared(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Profile name cannot be cleared")
        return value


class ProfileSelections(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_item_ids: list[UUID] = Field(default_factory=list)
    skill_ids: list[UUID] = Field(default_factory=list)
    tool_ids: list[UUID] = Field(default_factory=list)


class ProfileView(BaseModel):
    id: UUID
    name: str
    target_roles: list[str]
    search_preferences: dict[str, Any]
    headline: str | None
    summary: str | None
    section_order: list[str]
    text_overrides: dict[UUID, str]
    candidate_item_ids: list[UUID]
    skill_ids: list[UUID]
    tool_ids: list[UUID]
