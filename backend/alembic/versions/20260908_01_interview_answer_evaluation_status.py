"""add interview answer evaluation status

Revision ID: 20260908_01
Revises: 20260906_01
Create Date: 2026-09-08
"""

from alembic import op
import sqlalchemy as sa


revision = "20260908_01"
down_revision = "20260906_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "interview_answers",
        sa.Column("evaluation_status", sa.String(length=20), nullable=False, server_default="completed"),
    )
    op.add_column("interview_answers", sa.Column("evaluation_error", sa.Text(), nullable=True))
    op.create_index("ix_interview_answers_evaluation_status", "interview_answers", ["evaluation_status"])
    op.execute(
        "UPDATE interview_answers "
        "SET evaluation_status = 'failed', evaluation_error = COALESCE(evaluation_error, '这条回答尚未完成评分。') "
        "WHERE id NOT IN (SELECT answer_id FROM interview_evaluations)"
    )


def downgrade() -> None:
    op.drop_index("ix_interview_answers_evaluation_status", table_name="interview_answers")
    op.drop_column("interview_answers", "evaluation_error")
    op.drop_column("interview_answers", "evaluation_status")
