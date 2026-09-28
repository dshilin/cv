"""Add owner-scoped LLM provider connections.

Revision ID: 20260928_0002
Revises: 20260925_0001
"""
from alembic import op
import sqlalchemy as sa


revision = "20260928_0002"
down_revision = "20260925_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("credentials_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("default_model", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "provider IN ('openai', 'openai_compatible', 'yandexgpt', 'gigachat')",
            name="ck_llm_connections_provider",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'verified', 'failed', 'disabled')",
            name="ck_llm_connections_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_llm_connections_owner_created", "llm_connections", ["owner_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_llm_connections_owner_created", table_name="llm_connections")
    op.drop_table("llm_connections")
