"""Add independent desktop-pet study data.

Revision ID: 20260803_03
Revises: 20260803_02
Create Date: 2026-08-03
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260803_03"
down_revision = "20260803_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("study_sessions"):
        return
    op.create_table(
        "study_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("client_event_id", sa.String(length=100), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("activity_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_resumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accumulated_seconds", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_event_id"),
    )
    op.create_index("ix_study_sessions_client_event_id", "study_sessions", ["client_event_id"])
    op.create_index("ix_study_sessions_source", "study_sessions", ["source"])
    op.create_index("ix_study_sessions_activity_type", "study_sessions", ["activity_type"])
    op.create_index("ix_study_sessions_status", "study_sessions", ["status"])
    op.create_table(
        "desktop_pet_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("weather_enabled", sa.Boolean(), nullable=False),
        sa.Column("location_label", sa.String(length=120), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("weather_refresh_minutes", sa.Integer(), nullable=False),
        sa.Column("milestone_minutes", sa.Text(), nullable=False),
        sa.Column("milestone_display_seconds", sa.Integer(), nullable=False),
        sa.Column("show_notifications", sa.Boolean(), nullable=False),
        sa.Column("open_page_on_study_start", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("desktop_pet_settings")
    op.drop_index("ix_study_sessions_status", table_name="study_sessions")
    op.drop_index("ix_study_sessions_activity_type", table_name="study_sessions")
    op.drop_index("ix_study_sessions_source", table_name="study_sessions")
    op.drop_index("ix_study_sessions_client_event_id", table_name="study_sessions")
    op.drop_table("study_sessions")
