import os
from uuid import UUID

from fastapi import FastAPI, Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from cv_backend.api.dependencies import get_current_user_id, get_db_session
from cv_backend.api.routes.profiles import router as profiles_router
from cv_backend.api.routes.resume_drafts import router as resume_drafts_router
from cv_backend.api.routes.llm_connections import router as llm_connections_router
from cv_backend.api.routes.auth import router as auth_router
from cv_backend.api.routes.candidate_base import router as candidate_base_router
from cv_backend.llm.providers.gigachat import GigaChatAdapter
from cv_backend.llm.providers.openai_compatible import OpenAICompatibleAdapter
from cv_backend.llm.providers.yandex import YandexGPTAdapter
from cv_backend.storage.models.candidate import CandidateItemModel
from cv_backend.storage.repositories.candidate import CandidateRepository
from cv_backend.storage.database import build_engine


def create_app() -> FastAPI:
    app = FastAPI(title="CV Profile API", version="0.1.0")

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Pydantic errors may contain the original request body under `input`.
        # Never serialize that field: LLM connection requests include plaintext credentials.
        errors = [
            {key: error[key] for key in ("loc", "msg", "type") if key in error}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": errors})

    app.state.llm_adapters = {
        "openai": OpenAICompatibleAdapter(),
        "openai_compatible": OpenAICompatibleAdapter(),
        "yandexgpt": YandexGPTAdapter(),
        "gigachat": GigaChatAdapter(),
    }
    if os.getenv("CV_ENV") == "development":
        database_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./cv_profiles.sqlite3")
        engine = build_engine(database_url)
        app.state.database_engine = engine
        if os.getenv("CV_AUTO_CREATE_SCHEMA") == "true":
            from cv_backend.storage.database import Base
            import cv_backend.storage.models  # noqa: F401

            Base.metadata.create_all(engine)
            _upgrade_local_dev_schema(engine)
    app.include_router(profiles_router)
    app.include_router(resume_drafts_router)
    app.include_router(llm_connections_router)
    app.include_router(auth_router)
    app.include_router(candidate_base_router)

    @app.get("/api/v1/candidate-base/items", tags=["candidate-base"])
    def list_candidate_items(
        owner_id=Depends(get_current_user_id), session: Session = Depends(get_db_session)
    ) -> list[dict[str, object]]:
        items = session.scalars(
            select(CandidateItemModel).where(
                CandidateItemModel.owner_id == owner_id,
                CandidateItemModel.is_deleted.is_(False),
            )
        ).all()
        return [
            {"id": item.id, "kind": item.item_type, "status": item.status, **item.payload}
            for item in items
        ]

    @app.delete("/api/v1/candidate-base/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["candidate-base"])
    def delete_candidate_item(
        item_id: UUID,
        owner_id=Depends(get_current_user_id),
        session: Session = Depends(get_db_session),
    ) -> Response:
        if not CandidateRepository(session).soft_delete_item(owner_id, item_id):
            raise HTTPException(status_code=404, detail="Candidate item not found")
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def _upgrade_local_dev_schema(engine) -> None:
    """Apply additive changes to an existing SQLite-only Docker dev volume."""
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    with engine.begin() as connection:
        draft_columns = {column["name"] for column in inspector.get_columns("resume_drafts")}
        if "title" not in draft_columns:
            connection.execute(text(
                "ALTER TABLE resume_drafts ADD COLUMN title VARCHAR(160) NOT NULL "
                "DEFAULT 'Черновик резюме'"
            ))
            rows = connection.execute(text(
                "SELECT id, owner_id, created_at FROM resume_drafts "
                "ORDER BY owner_id, created_at, id"
            )).mappings()
            used_titles: dict[str, set[str]] = {}
            for row in rows:
                label = str(row["created_at"])[:16]
                base = f"Черновик резюме {label}"
                title = base
                suffix = 2
                owner_titles = used_titles.setdefault(str(row["owner_id"]), set())
                while title in owner_titles:
                    title = f"{base} ({suffix})"
                    suffix += 1
                owner_titles.add(title)
                connection.execute(
                    text("UPDATE resume_drafts SET title=:title WHERE id=:id"),
                    {"title": title, "id": row["id"]},
                )
        if "review_status" not in draft_columns:
            connection.execute(text(
                "ALTER TABLE resume_drafts ADD COLUMN review_status VARCHAR(24) NOT NULL "
                "DEFAULT 'needs_user_review'"
            ))
            connection.execute(text(
                "UPDATE resume_drafts SET review_status = "
                "CASE WHEN state = 'reviewed' THEN 'reviewed' ELSE 'needs_user_review' END"
            ))
        candidate_columns = {column["name"] for column in inspector.get_columns("candidate_bases")}
        if "full_name" not in candidate_columns:
            connection.execute(text("ALTER TABLE candidate_bases ADD COLUMN full_name VARCHAR(200)"))
