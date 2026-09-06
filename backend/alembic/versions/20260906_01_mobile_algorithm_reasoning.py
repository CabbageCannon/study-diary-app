"""Add mobile algorithm reasoning context and feedback tables.

Revision ID: 20260906_01
Revises: 20260804_01
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260906_01"
down_revision = "20260804_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("algorithm_reasoning_answers"):
        return

    op.create_table(
        "algorithm_problem_contexts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False),
        sa.Column("problem_key", sa.String(length=160), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("content_version", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column("content_status", sa.String(length=20), nullable=False, server_default="ready"),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("content_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("problem_id", "content_version", name="uq_algorithm_context_problem_version"),
        sa.UniqueConstraint("problem_id", "content_hash", name="uq_algorithm_context_problem_hash"),
    )
    op.create_index("ix_algorithm_problem_contexts_problem_id", "algorithm_problem_contexts", ["problem_id"])
    op.create_index("ix_algorithm_problem_contexts_problem_key", "algorithm_problem_contexts", ["problem_key"])
    op.create_index("ix_algorithm_problem_contexts_content_hash", "algorithm_problem_contexts", ["content_hash"])
    op.create_index("ix_algorithm_problem_contexts_content_status", "algorithm_problem_contexts", ["content_status"])
    op.create_index("ix_algorithm_problem_contexts_is_current", "algorithm_problem_contexts", ["is_current"])

    op.create_table(
        "algorithm_reasoning_answers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("algorithm_problems.id"), nullable=False),
        sa.Column(
            "session_id",
            sa.String(length=36),
            sa.ForeignKey("algorithm_practice_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "session_item_id",
            sa.Integer(),
            sa.ForeignKey("algorithm_practice_session_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "revision_of_answer_id",
            sa.Integer(),
            sa.ForeignKey("algorithm_reasoning_answers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("answer_source", sa.String(length=20), nullable=False, server_default="text"),
        sa.Column("details", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("client_answer_id", sa.String(length=36), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("client_answer_id", name="uq_algorithm_reasoning_client_answer"),
    )
    op.create_index("ix_algorithm_reasoning_answers_problem_id", "algorithm_reasoning_answers", ["problem_id"])
    op.create_index("ix_algorithm_reasoning_answers_session_id", "algorithm_reasoning_answers", ["session_id"])
    op.create_index("ix_algorithm_reasoning_answers_session_item_id", "algorithm_reasoning_answers", ["session_item_id"])
    op.create_index("ix_algorithm_reasoning_answers_revision_of_answer_id", "algorithm_reasoning_answers", ["revision_of_answer_id"])
    op.create_index("ix_algorithm_reasoning_answers_client_answer_id", "algorithm_reasoning_answers", ["client_answer_id"])

    op.create_table(
        "algorithm_reasoning_feedbacks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "answer_id",
            sa.Integer(),
            sa.ForeignKey("algorithm_reasoning_answers.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("problem_context_id", sa.Integer(), sa.ForeignKey("algorithm_problem_contexts.id"), nullable=False),
        sa.Column("synced_attempt_id", sa.Integer(), sa.ForeignKey("algorithm_attempts.id"), nullable=True),
        sa.Column("conclusion", sa.String(length=32), nullable=False),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("context_sufficient", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("feedback", sa.Text(), nullable=False),
        sa.Column("model_name", sa.String(length=160), nullable=False),
        sa.Column("prompt_version", sa.String(length=80), nullable=False),
        sa.Column("context_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algorithm_reasoning_feedbacks_answer_id", "algorithm_reasoning_feedbacks", ["answer_id"])
    op.create_index("ix_algorithm_reasoning_feedbacks_problem_context_id", "algorithm_reasoning_feedbacks", ["problem_context_id"])
    op.create_index("ix_algorithm_reasoning_feedbacks_synced_attempt_id", "algorithm_reasoning_feedbacks", ["synced_attempt_id"])
    op.create_index("ix_algorithm_reasoning_feedbacks_conclusion", "algorithm_reasoning_feedbacks", ["conclusion"])


def downgrade() -> None:
    op.drop_table("algorithm_reasoning_feedbacks")
    op.drop_table("algorithm_reasoning_answers")
    op.drop_table("algorithm_problem_contexts")
