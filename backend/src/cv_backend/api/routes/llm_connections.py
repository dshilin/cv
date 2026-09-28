from collections.abc import Mapping
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.api.schemas.llm_connections import (
    LLMConnectionCreate,
    LLMConnectionSummary,
    LLMConnectionTestResult,
)
from cv_backend.llm.errors import LLMError, LLMErrorCategory
from cv_backend.llm.security import CredentialCipher
from cv_backend.services.llm_connections import LLMConnectionService


router = APIRouter(prefix="/api/v1/llm-connections", tags=["llm-connections"])


def get_provider_adapters(request: Request) -> Mapping[str, object]:
    return request.app.state.llm_adapters


def get_llm_cipher() -> CredentialCipher:
    try:
        return CredentialCipher.from_env()
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM credential encryption is not configured",
        ) from None


def get_llm_connection_service(
    session: Session = Depends(get_db_session),
    cipher: CredentialCipher = Depends(get_llm_cipher),
    adapters: Mapping[str, object] = Depends(get_provider_adapters),
) -> LLMConnectionService:
    return LLMConnectionService(session, cipher, adapters)


def _summary(record) -> LLMConnectionSummary:
    return LLMConnectionSummary(
        id=record.id,
        provider=record.provider,
        settings=record.settings,
        default_model=record.default_model,
        status=record.status,
        last_tested_at=record.last_tested_at,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _translate_error(error: LLMError) -> HTTPException:
    if error.category == LLMErrorCategory.CONNECTION_NOT_FOUND:
        return HTTPException(status_code=404, detail="LLM connection not found")
    if error.category == LLMErrorCategory.INVALID_REQUEST:
        return HTTPException(status_code=422, detail="Invalid LLM connection settings")
    return HTTPException(status_code=503, detail="LLM connection service is unavailable")


@router.post("", response_model=LLMConnectionSummary, status_code=status.HTTP_201_CREATED)
def create_connection(
    payload: LLMConnectionCreate,
    owner_id: UUID = Depends(get_current_user_id),
    service: LLMConnectionService = Depends(get_llm_connection_service),
) -> LLMConnectionSummary:
    try:
        record = service.create(
            owner_id,
            provider=payload.provider,
            settings=payload.settings,
            credentials=payload.credentials,
            default_model=payload.default_model,
        )
    except LLMError as error:
        raise _translate_error(error) from None
    return _summary(record)


@router.get("", response_model=list[LLMConnectionSummary])
def list_connections(
    owner_id: UUID = Depends(get_current_user_id),
    service: LLMConnectionService = Depends(get_llm_connection_service),
) -> list[LLMConnectionSummary]:
    return [_summary(record) for record in service.list_for_owner(owner_id)]


@router.post("/{connection_id}/test", response_model=LLMConnectionTestResult)
async def test_connection(
    connection_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    service: LLMConnectionService = Depends(get_llm_connection_service),
) -> LLMConnectionTestResult:
    try:
        record, error_category = await service.test_connection(owner_id, connection_id)
    except LLMError as error:
        raise _translate_error(error) from None
    return LLMConnectionTestResult(
        id=record.id,
        provider=record.provider,
        model=record.default_model,
        ok=error_category is None,
        status=record.status,
        error_category=error_category,
        tested_at=record.last_tested_at,
    )
