"""Add push reminder subscriptions.

Revision ID: 20260908_01
Revises: 20260906_01
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260908_01"
down_revision = "20260906_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("push_subscriptions"):
        return
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reminder_time", sa.String(length=5), nullable=False, server_default="21:30"),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default="Asia/Shanghai"),
        sa.Column("interview_goal", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("algorithm_goal", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("include_diary", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("include_review", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_sent_local_date", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_push_subscriptions_enabled", "push_subscriptions", ["enabled"])


def downgrade() -> None:
    op.drop_table("push_subscriptions")
