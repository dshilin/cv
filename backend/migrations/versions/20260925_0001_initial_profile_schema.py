"""Initial profile backend schema, including draft review and soft deletion.

Revision ID: 20260925_0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "20260925_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidate_bases",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_candidate_bases_owner_id", "candidate_bases", ["owner_id"], unique=True)
    op.create_table(
        "candidate_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("base_id", sa.Uuid(), sa.ForeignKey("candidate_bases.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("item_type", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("item_type IN ('experience','project','skill','tool','education','certification','language','contact','preference')", name="ck_candidate_items_type"),
        sa.CheckConstraint("status IN ('draft','confirmed','rejected','deprecated')", name="ck_candidate_items_status"),
    )
    for col in ("base_id", "owner_id"):
        op.create_index(f"ix_candidate_items_{col}", "candidate_items", [col])
    op.create_table(
        "candidate_item_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("candidate_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("item_id", "version_number", name="uq_candidate_item_version"),
    )
    for col in ("item_id", "owner_id"):
        op.create_index(f"ix_candidate_item_versions_{col}", "candidate_item_versions", [col])
    op.create_table(
        "specialization_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("target_roles", sa.JSON(), nullable=False),
        sa.Column("search_preferences", sa.JSON(), nullable=False),
        sa.Column("headline", sa.String(240), nullable=True),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("section_order", sa.JSON(), nullable=False),
        sa.Column("text_overrides", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_specialization_profiles_owner_id", "specialization_profiles", ["owner_id"])
    op.create_table(
        "profile_item_selections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("profile_id", sa.Uuid(), sa.ForeignKey("specialization_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("candidate_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("profile_id", "category", "ordinal", name="uq_profile_selection_order"),
        sa.UniqueConstraint("profile_id", "category", "item_id", name="uq_profile_selection_item"),
        sa.CheckConstraint("category IN ('candidate','skill','tool')", name="ck_profile_selection_category"),
    )
    for col in ("profile_id", "item_id"):
        op.create_index(f"ix_profile_item_selections_{col}", "profile_item_selections", [col])
    op.create_table(
        "resume_drafts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("state IN ('needs_user_review','partially_applied','applied','reviewed')", name="ck_resume_drafts_state"),
    )
    op.create_index("ix_resume_drafts_owner_id", "resume_drafts", ["owner_id"])
    op.create_table(
        "draft_blocks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("draft_id", sa.Uuid(), sa.ForeignKey("resume_drafts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("heading", sa.String(160), nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("draft_id", "ordinal", name="uq_draft_block_ordinal"),
        sa.CheckConstraint("kind IN ('basics','preferences','experience','projects','skills','tools','education','certifications','languages','additional','unparsed')", name="ck_draft_blocks_kind"),
    )
    op.create_index("ix_draft_blocks_draft_id", "draft_blocks", ["draft_id"])
    op.create_table(
        "draft_applications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("draft_id", sa.Uuid(), sa.ForeignKey("resume_drafts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("block_id", sa.Uuid(), sa.ForeignKey("draft_blocks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("item_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "idempotency_key", name="uq_draft_application_key"),
        sa.UniqueConstraint("block_id", name="uq_draft_application_block"),
    )
    for col in ("owner_id", "draft_id", "block_id"):
        op.create_index(f"ix_draft_applications_{col}", "draft_applications", [col])


def downgrade() -> None:
    op.drop_table("draft_applications")
    op.drop_index("ix_draft_blocks_draft_id", table_name="draft_blocks")
    op.drop_table("draft_blocks")
    op.drop_index("ix_resume_drafts_owner_id", table_name="resume_drafts")
    op.drop_table("resume_drafts")
    for col in ("item_id", "profile_id"):
        op.drop_index(f"ix_profile_item_selections_{col}", table_name="profile_item_selections")
    op.drop_table("profile_item_selections")
    op.drop_index("ix_specialization_profiles_owner_id", table_name="specialization_profiles")
    op.drop_table("specialization_profiles")
    for col in ("item_id", "owner_id"):
        op.drop_index(f"ix_candidate_item_versions_{col}", table_name="candidate_item_versions")
    op.drop_table("candidate_item_versions")
    for col in ("base_id", "owner_id"):
        op.drop_index(f"ix_candidate_items_{col}", table_name="candidate_items")
    op.drop_table("candidate_items")
    op.drop_index("ix_candidate_bases_owner_id", table_name="candidate_bases")
    op.drop_table("candidate_bases")
