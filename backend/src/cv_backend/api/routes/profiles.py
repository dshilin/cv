from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.domain.profiles import ProfileCreate, ProfilePatch, ProfileSelections, ProfileView
from cv_backend.services.profile_service import ProfileService

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])


@router.post("", response_model=ProfileView, status_code=status.HTTP_201_CREATED)
def create_profile(
    data: ProfileCreate,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> ProfileView:
    return ProfileService(session).create(owner_id, data)


@router.get("", response_model=list[ProfileView])
def list_profiles(
    owner_id: UUID = Depends(get_current_user_id), session: Session = Depends(get_db_session)
) -> list[ProfileView]:
    return ProfileService(session).list(owner_id)


@router.get("/{profile_id}", response_model=ProfileView)
def get_profile(
    profile_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> ProfileView:
    profile = ProfileService(session).get(owner_id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/{profile_id}", response_model=ProfileView)
def update_profile(
    profile_id: UUID,
    patch: ProfilePatch,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> ProfileView:
    profile = ProfileService(session).update(owner_id, profile_id, patch)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/{profile_id}/selections", response_model=ProfileView)
def set_profile_selections(
    profile_id: UUID,
    selections: ProfileSelections,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> ProfileView:
    try:
        profile = ProfileService(session).set_selections(owner_id, profile_id, selections)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db_session),
) -> None:
    if not ProfileService(session).delete(owner_id, profile_id):
        raise HTTPException(status_code=404, detail="Profile not found")
