from datetime import date
from typing import Annotated, Literal, TypeAlias
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CandidateItemFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExperienceItemInput(CandidateItemFields):
    kind: Literal["experience"] = "experience"
    employer: str = Field(min_length=1)
    position: str = Field(min_length=1)
    started_on: date | None = None
    ended_on: date | None = None
    responsibilities: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)


class ProjectItemInput(CandidateItemFields):
    kind: Literal["project"] = "project"
    name: str = Field(min_length=1)
    role: str | None = None
    description: str = ""
    started_on: date | None = None
    ended_on: date | None = None
    achievements: list[str] = Field(default_factory=list)


class SkillItemInput(CandidateItemFields):
    kind: Literal["skill"] = "skill"
    name: str = Field(min_length=1)
    level: Literal["knowledge", "used", "advanced", "expert"] = "used"
    first_used_year: int | None = Field(default=None, ge=1900, le=2100)
    last_used_year: int | None = Field(default=None, ge=1900, le=2100)
    related_project_ids: list[UUID] = Field(default_factory=list)


class ToolItemInput(CandidateItemFields):
    kind: Literal["tool"] = "tool"
    name: str = Field(min_length=1)
    level: Literal["knowledge", "used", "advanced", "expert"] = "used"
    first_used_year: int | None = Field(default=None, ge=1900, le=2100)
    last_used_year: int | None = Field(default=None, ge=1900, le=2100)
    related_project_ids: list[UUID] = Field(default_factory=list)


class EducationItemInput(CandidateItemFields):
    kind: Literal["education"] = "education"
    institution: str = Field(min_length=1)
    qualification: str = ""
    specialty: str = ""
    started_on: date | None = None
    ended_on: date | None = None


class CertificationItemInput(CandidateItemFields):
    kind: Literal["certification"] = "certification"
    name: str = Field(min_length=1)
    issuer: str = ""
    issued_on: date | None = None
    expires_on: date | None = None


class LanguageItemInput(CandidateItemFields):
    kind: Literal["language"] = "language"
    language: str = Field(min_length=1)
    proficiency: str = ""


class ContactItemInput(CandidateItemFields):
    kind: Literal["contact"] = "contact"
    label: str = Field(min_length=1)
    value: str = Field(min_length=1)


class PreferenceItemInput(CandidateItemFields):
    kind: Literal["preference"] = "preference"
    category: str = Field(min_length=1)
    value: str = Field(min_length=1)


CandidateItemInput: TypeAlias = Annotated[
    ExperienceItemInput
    | ProjectItemInput
    | SkillItemInput
    | ToolItemInput
    | EducationItemInput
    | CertificationItemInput
    | LanguageItemInput
    | ContactItemInput
    | PreferenceItemInput,
    Field(discriminator="kind"),
]


class CandidateItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    changes: dict[str, object] = Field(min_length=1)
