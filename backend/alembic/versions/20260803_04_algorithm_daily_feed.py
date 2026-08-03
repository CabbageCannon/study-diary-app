"""Add persisted daily algorithm recommendations.

Revision ID: 20260803_04
Revises: 20260803_03
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260803_04"
down_revision = "20260803_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing local SQLite databases may have received these tables through
    # Base.metadata.create_all before their Alembic revision was recorded.
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("algorithm_daily_feeds"):
        return
    op.create_table(
        "algorithm_daily_recommendation_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("strategy", sa.String(length=32), nullable=False, server_default="balanced"),
        sa.Column("topics", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("difficulties", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("source_lists", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("exclude_solved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("prioritize_due_review", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("avoid_recent_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("extra_recommendation_count", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("include_adjacent_difficulty", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("include_review_items", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "algorithm_daily_feeds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recommendation_date", sa.String(length=10), nullable=False, unique=True),
        sa.Column("primary_problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False),
        sa.Column("extra_problem_ids", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("settings_snapshot", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("refresh_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warning", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_daily_feeds_recommendation_date", "algorithm_daily_feeds", ["recommendation_date"])
    op.create_index("ix_algorithm_daily_feeds_primary_problem_id", "algorithm_daily_feeds", ["primary_problem_id"])


def downgrade() -> None:
    op.drop_table("algorithm_daily_feeds")
    op.drop_table("algorithm_daily_recommendation_settings")
