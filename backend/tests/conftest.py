from collections.abc import Iterator
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine

from cv_backend.api.dependencies import get_current_user_id
from cv_backend.app import create_app

TEST_USER_ID = UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def database_engine(tmp_path: Path) -> Iterator[Engine]:
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'test.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def client(database_engine: Engine) -> Iterator[TestClient]:
    app = create_app()
    app.state.database_engine = database_engine
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
