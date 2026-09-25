import os

from fastapi import FastAPI
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.api.routes.profiles import router as profiles_router
from cv_backend.api.routes.resume_drafts import router as resume_drafts_router
from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.database import build_engine


def create_app() -> FastAPI:
    app = FastAPI(title="CV Profile API", version="0.1.0")
    if os.getenv("CV_ENV") == "development":
        database_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./cv_profiles.sqlite3")
        engine = build_engine(database_url)
        app.state.database_engine = engine
        if os.getenv("CV_AUTO_CREATE_SCHEMA") == "true":
            from cv_backend.storage.database import Base
            import cv_backend.storage.models  # noqa: F401

            Base.metadata.create_all(engine)
    app.include_router(profiles_router)
    app.include_router(resume_drafts_router)

    @app.get("/api/v1/candidate-base/items", tags=["candidate-base"])
    def list_candidate_items(
        owner_id=Depends(get_current_user_id), session: Session = Depends(get_db_session)
    ) -> list[dict[str, object]]:
        items = session.scalars(
            select(CandidateItemModel).where(CandidateItemModel.owner_id == owner_id)
        ).all()
        return [
            {"id": item.id, "kind": item.item_type, "status": item.status, **item.payload}
            for item in items
        ]

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
