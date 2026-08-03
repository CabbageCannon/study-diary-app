"""Add persisted algorithm practice state.

Revision ID: 20260803_02
Revises: 20260803_01
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260803_02"
down_revision = "20260803_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy SQLite startup used Base.metadata.create_all before Alembic was
    # introduced. It may already contain this complete set of new tables.
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("algorithm_practice_sessions"):
        return
    op.create_table(
        "algorithm_practice_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("current_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filters", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("abandoned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_practice_sessions_mode", "algorithm_practice_sessions", ["mode"])
    op.create_index("ix_algorithm_practice_sessions_status", "algorithm_practice_sessions", ["status"])
    op.create_index("ix_algorithm_practice_sessions_deleted_at", "algorithm_practice_sessions", ["deleted_at"])

    op.create_table(
        "algorithm_practice_session_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.String(length=36), sa.ForeignKey("algorithm_practice_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("skipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "position", name="uq_algorithm_session_item_position"),
        sa.UniqueConstraint("session_id", "problem_id", name="uq_algorithm_session_item_problem"),
    )
    op.create_index("ix_algorithm_practice_session_items_session_id", "algorithm_practice_session_items", ["session_id"])
    op.create_index("ix_algorithm_practice_session_items_problem_id", "algorithm_practice_session_items", ["problem_id"])
    op.create_index("ix_algorithm_practice_session_items_status", "algorithm_practice_session_items", ["status"])

    op.create_table(
        "algorithm_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False),
        sa.Column("session_id", sa.String(length=36), sa.ForeignKey("algorithm_practice_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_item_id", sa.Integer(), sa.ForeignKey("algorithm_practice_session_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("result", sa.String(length=24), nullable=False),
        sa.Column("language", sa.String(length=48), nullable=True),
        sa.Column("approach", sa.Text(), nullable=False, server_default=""),
        sa.Column("time_complexity", sa.String(length=160), nullable=True),
        sa.Column("space_complexity", sa.String(length=160), nullable=True),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("reflection", sa.Text(), nullable=True),
        sa.Column("mistakes", sa.Text(), nullable=True),
        sa.Column("edge_cases", sa.Text(), nullable=True),
        sa.Column("hint_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ai_feedback", sa.Text(), nullable=True),
        sa.Column("ai_feedback_status", sa.String(length=20), nullable=False, server_default="not_requested"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_attempts_problem_id", "algorithm_attempts", ["problem_id"])
    op.create_index("ix_algorithm_attempts_session_id", "algorithm_attempts", ["session_id"])
    op.create_index("ix_algorithm_attempts_session_item_id", "algorithm_attempts", ["session_item_id"])
    op.create_index("ix_algorithm_attempts_result", "algorithm_attempts", ["result"])
    op.create_index("ix_algorithm_attempts_needs_review", "algorithm_attempts", ["needs_review"])
    op.create_index("ix_algorithm_attempts_ai_feedback_status", "algorithm_attempts", ["ai_feedback_status"])

    op.create_table(
        "algorithm_review_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False, unique=True),
        sa.Column("last_attempt_id", sa.Integer(), sa.ForeignKey("algorithm_attempts.id"), nullable=False),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("mastery_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_review_schedules_problem_id", "algorithm_review_schedules", ["problem_id"])
    op.create_index("ix_algorithm_review_schedules_last_attempt_id", "algorithm_review_schedules", ["last_attempt_id"])
    op.create_index("ix_algorithm_review_schedules_next_review_at", "algorithm_review_schedules", ["next_review_at"])

    op.create_table(
        "algorithm_problem_progress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False, unique=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="unseen"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("solved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_result", sa.String(length=24), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mastery_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_problem_progress_problem_id", "algorithm_problem_progress", ["problem_id"])
    op.create_index("ix_algorithm_problem_progress_status", "algorithm_problem_progress", ["status"])
    op.create_index("ix_algorithm_problem_progress_needs_review", "algorithm_problem_progress", ["needs_review"])


def downgrade() -> None:
    op.drop_table("algorithm_problem_progress")
    op.drop_table("algorithm_review_schedules")
    op.drop_table("algorithm_attempts")
    op.drop_table("algorithm_practice_session_items")
    op.drop_table("algorithm_practice_sessions")
