from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.domain.candidate import CandidateItemInput, ContactItemInput
from cv_backend.storage.models.candidate import CandidateBaseModel, CandidateItemModel
from cv_backend.storage.repositories.candidate import CandidateRepository

router = APIRouter(prefix="/api/v1/candidate-base", tags=["candidate-base"])


class CandidateBasePatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    full_name: str | None = Field(default=None, max_length=200)


class ContactPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    label: str | None = Field(default=None, min_length=1, max_length=100)
    value: str | None = Field(default=None, min_length=1, max_length=500)


def _view(session: Session, owner_id: UUID) -> dict[str, Any]:
    base = session.scalar(select(CandidateBaseModel).where(CandidateBaseModel.owner_id == owner_id))
    items = CandidateRepository(session).list_items(owner_id)
    return {
        "full_name": base.full_name if base else None,
        "contacts": [
            {"id": item.id, "kind": item.item_type, "status": item.status, **item.payload}
            for item in items if item.item_type == "contact"
        ],
    }


@router.get("")
def get_candidate_base(
    owner_id: UUID = Depends(get_current_user_id), session: Session = Depends(get_db_session)
) -> dict[str, Any]:
    return _view(session, owner_id)


@router.patch("")
def update_candidate_base(
    patch: CandidateBasePatch,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    base = session.scalar(select(CandidateBaseModel).where(CandidateBaseModel.owner_id == owner_id))
    if base is None:
        base = CandidateBaseModel(owner_id=owner_id)
        session.add(base)
    if "full_name" in patch.model_fields_set:
        base.full_name = patch.full_name
    session.commit()
    return _view(session, owner_id)


@router.post("/contacts", status_code=status.HTTP_201_CREATED)
def create_contact(
    contact: ContactItemInput,
    response: Response,
    owner_id: UUID = Depends(get_current_user_id), session: Session = Depends(get_db_session)
) -> dict[str, Any]:
    item, created = CandidateRepository(session).add_contact_if_missing(owner_id, contact)
    if not created:
        response.status_code = status.HTTP_200_OK
    session.commit()
    return {"id": item.id, "kind": item.item_type, "status": item.status, **item.payload}


@router.patch("/contacts/{contact_id}")
def update_contact(
    contact_id: UUID,
    patch: ContactPatch,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    item = session.scalar(select(CandidateItemModel).where(
        CandidateItemModel.id == contact_id, CandidateItemModel.owner_id == owner_id,
        CandidateItemModel.item_type == "contact", CandidateItemModel.is_deleted.is_(False),
    ))
    if item is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    updated = CandidateRepository(session).update_item(
        owner_id, contact_id, patch.model_dump(exclude_unset=True)
    )
    assert updated is not None
    session.commit()
    return {"id": updated.id, "kind": updated.item_type, "status": updated.status, **updated.payload}


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: UUID,
    owner_id: UUID = Depends(get_current_user_id), session: Session = Depends(get_db_session)
) -> None:
    item = session.scalar(select(CandidateItemModel).where(
        CandidateItemModel.id == contact_id, CandidateItemModel.owner_id == owner_id,
        CandidateItemModel.item_type == "contact",
    ))
    if item is None or not CandidateRepository(session).soft_delete_item(owner_id, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    session.commit()
