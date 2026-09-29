"""Add draft metadata and candidate identity fields.

Revision ID: 20260928_0004
Revises: 20260928_0003
"""
from alembic import op
import sqlalchemy as sa


revision = "20260928_0004"
down_revision = "20260928_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("resume_drafts", sa.Column("title", sa.String(length=160), nullable=True))
    op.add_column("resume_drafts", sa.Column("review_status", sa.String(length=24), nullable=True))
    connection = op.get_bind()
    drafts = connection.execute(sa.text(
        "SELECT id, owner_id, created_at, state FROM resume_drafts "
        "ORDER BY owner_id, created_at, id"
    )).mappings()
    used_titles: dict[object, set[str]] = {}
    for draft in drafts:
        created_at = draft["created_at"]
        if hasattr(created_at, "strftime"):
            label = created_at.strftime("%Y-%m-%d %H:%M")
        else:
            label = str(created_at)[:16]
        title = f"Черновик резюме {label}"
        owner_titles = used_titles.setdefault(draft["owner_id"], set())
        base = title
        suffix = 2
        while title in owner_titles:
            title = f"{base} ({suffix})"
            suffix += 1
        owner_titles.add(title)
        connection.execute(
            sa.text("UPDATE resume_drafts SET title=:title, review_status=:review "
                    "WHERE id=:id"),
            {"title": title,
             "review": "reviewed" if draft["state"] == "reviewed" else "needs_user_review",
             "id": draft["id"]},
        )
    with op.batch_alter_table("resume_drafts") as batch:
        batch.alter_column("title", existing_type=sa.String(length=160), nullable=False)
        batch.alter_column("review_status", existing_type=sa.String(length=24), nullable=False)
    op.add_column("candidate_bases", sa.Column("full_name", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_bases", "full_name")
    op.drop_column("resume_drafts", "review_status")
    op.drop_column("resume_drafts", "title")
