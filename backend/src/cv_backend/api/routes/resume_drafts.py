from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.domain.candidate import CandidateItemInput
from cv_backend.domain.drafts import DraftBlockInput
from cv_backend.services.draft_service import DraftNotFoundError, DraftService, IdempotencyConflictError
from cv_backend.services.document_extractor import (
    UnsupportedDocumentError,
    UnsupportedDocumentTypeError,
    extract_document_text,
)
from cv_backend.services.text_parser import parse_resume_text
from cv_backend.storage.repositories.drafts import DraftRepository

router = APIRouter(prefix="/api/v1", tags=["resume-drafts"])
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class DraftBlockResponse(BaseModel):
    id: UUID
    kind: str
    heading: str | None
    text: str
    ordinal: int


class DraftResponse(BaseModel):
    draft_id: UUID
    state: str
    blocks: list[DraftBlockResponse]


class ApplyBlockRequest(BaseModel):
    items: list[CandidateItemInput] = Field(min_length=1)
    idempotency_key: str = Field(min_length=1, max_length=128)


class EditBlockRequest(BaseModel):
    text: str = Field(max_length=100_000)


class ExperienceBlockRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)


class DraftListItem(BaseModel):
    draft_id: UUID
    state: str


def _response(draft) -> DraftResponse:
    return DraftResponse(
        draft_id=draft.id,
        state=draft.state,
        blocks=[
            DraftBlockResponse(
                id=block.id,
                kind=block.kind,
                heading=block.heading,
                text=block.text,
                ordinal=block.ordinal,
            )
            for block in draft.blocks
        ],
    )


@router.get("/resume-drafts", response_model=list[DraftListItem])
def list_drafts(
    state: str | None = None,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
):
    if state not in (None, "needs_user_review", "partially_applied", "applied", "reviewed"):
        raise HTTPException(status_code=422, detail="Unsupported draft state")
    drafts = DraftRepository(session).list(owner_id, state)
    if state is None:
        drafts = [draft for draft in drafts if draft.state != "reviewed"]
    return [DraftListItem(draft_id=draft.id, state=draft.state) for draft in drafts]


@router.post("/resume-drafts", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
def create_draft(
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    draft = DraftRepository(session).create_empty(owner_id)
    session.commit()
    return _response(draft)


@router.post("/resume-drafts/file", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def import_file(
    file: UploadFile = File(...),
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File exceeds 20 MiB")
        text = extract_document_text(file.filename or "", content)
    except UnsupportedDocumentError as error:
        if isinstance(error, UnsupportedDocumentTypeError):
            raise HTTPException(status_code=415, detail=str(error)) from error
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await file.close()
    blocks = parse_resume_text(text)
    if not blocks:
        raise HTTPException(status_code=422, detail="Document contains no importable content")
    draft = DraftRepository(session).create(owner_id, blocks)
    session.commit()
    return _response(draft)


@router.get("/resume-drafts/{draft_id}", response_model=DraftResponse)
def get_draft(
    draft_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    draft = DraftRepository(session).get(owner_id, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _response(draft)


@router.post("/resume-drafts/{draft_id}/review", response_model=DraftResponse)
def review_draft(
    draft_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    draft = DraftRepository(session).review(owner_id, draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    session.commit()
    return _response(draft)


@router.delete("/resume-drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(
    draft_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> None:
    if not DraftRepository(session).soft_delete(owner_id, draft_id):
        raise HTTPException(status_code=404, detail="Draft not found")
    session.commit()


@router.post("/resume-drafts/{draft_id}/experience-blocks", response_model=DraftResponse)
def add_experience_block(
    draft_id: UUID,
    data: ExperienceBlockRequest,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    if not data.text.strip():
        raise HTTPException(status_code=422, detail="Experience text must not be blank")
    draft = DraftRepository(session).add_experience_block(owner_id, draft_id, data.text)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    session.commit()
    return _response(draft)


@router.patch("/resume-drafts/{draft_id}/blocks/{block_id}", response_model=DraftResponse)
def edit_draft_block(
    draft_id: UUID,
    block_id: UUID,
    data: EditBlockRequest,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> DraftResponse:
    repository = DraftRepository(session)
    if repository.get_block(owner_id, draft_id, block_id) is None:
        raise HTTPException(status_code=404, detail="Draft block not found")
    block = repository.get_block(owner_id, draft_id, block_id)
    assert block is not None
    block.text = data.text
    session.commit()
    draft = repository.get(owner_id, draft_id)
    return _response(draft)


@router.post("/resume-drafts/{draft_id}/blocks/{block_id}/apply")
def apply_block(
    draft_id: UUID,
    block_id: UUID,
    data: ApplyBlockRequest,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
):
    try:
        items = DraftService(session).apply_block(
            owner_id, draft_id, block_id, data.items, data.idempotency_key
        )
    except DraftNotFoundError as error:
        raise HTTPException(status_code=404, detail="Draft block not found") from error
    except IdempotencyConflictError as error:
        raise HTTPException(status_code=409, detail="Idempotency key was already used") from error
    return [{"id": item.id, "kind": item.item_type, **item.payload} for item in items]
