"""add interview answer evaluation status

Revision ID: 20260908_02
Revises: 20260908_01
Create Date: 2026-09-08
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260908_02"
down_revision = "20260908_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    existing_columns = set() if inspector is None else {column["name"] for column in inspector.get_columns("interview_answers")}
    existing_indexes = set() if inspector is None else {index["name"] for index in inspector.get_indexes("interview_answers")}
    if "evaluation_status" not in existing_columns:
        op.add_column(
            "interview_answers",
            sa.Column("evaluation_status", sa.String(length=20), nullable=False, server_default="completed"),
        )
    if "evaluation_error" not in existing_columns:
        op.add_column("interview_answers", sa.Column("evaluation_error", sa.Text(), nullable=True))
    if "ix_interview_answers_evaluation_status" not in existing_indexes:
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
