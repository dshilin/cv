from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_upgrades_and_downgrades_schema(tmp_path):
    database = tmp_path / "migration.sqlite3"
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{database.as_posix()}")

    command.upgrade(config, "head")
    command.check(config)
    engine = create_engine(f"sqlite+pysqlite:///{database.as_posix()}")
    try:
        inspector = inspect(engine)
        assert "resume_drafts" in inspector.get_table_names()
        assert {column["name"] for column in inspector.get_columns("resume_drafts")} >= {
            "is_deleted", "deleted_at", "state"
        }
        assert {column["name"] for column in inspector.get_columns("candidate_items")} >= {
            "is_deleted", "deleted_at"
        }
        assert {column["name"] for column in inspector.get_columns("specialization_profiles")} >= {
            "is_deleted", "deleted_at"
        }
        assert {column["name"] for column in inspector.get_columns("llm_connections")} >= {
            "owner_id", "provider", "settings", "credentials_ciphertext", "default_model", "status"
        }
    finally:
        engine.dispose()

    command.downgrade(config, "base")
    engine = create_engine(f"sqlite+pysqlite:///{database.as_posix()}")
    try:
        assert inspect(engine).get_table_names() == ["alembic_version"]
    finally:
        engine.dispose()
