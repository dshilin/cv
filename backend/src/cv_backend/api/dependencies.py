import os
from collections.abc import Iterator
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session


def get_db_session(request: Request) -> Iterator[Session]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        from cv_backend.storage.database import build_session_factory

        engine = getattr(request.app.state, "database_engine", None)
        if engine is None:
            raise HTTPException(status_code=503, detail="Database is not configured")
        factory = build_session_factory(engine)
        request.app.state.session_factory = factory
    with factory() as session:
        yield session


def get_current_user_id(request: Request, session: Session = Depends(get_db_session)) -> UUID:
    """Resolve the authenticated owner, or the explicitly configured local dev identity."""
    configured_id = os.getenv("CV_DEV_USER_ID")
    if os.getenv("CV_ENV") == "development" and configured_id:
        try:
            return UUID(configured_id)
        except ValueError as error:
            raise HTTPException(status_code=500, detail="CV_DEV_USER_ID must be a UUID") from error
    token = request.cookies.get("cv_session")
    if token:
        from cv_backend.services.auth import AuthService
        owner_id = AuthService(session).owner_for_session(token)
        if owner_id is not None:
            return owner_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is not configured",
    )
