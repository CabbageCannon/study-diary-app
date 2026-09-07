"""Create the initial Study Diary schema.

Revision ID: 20260803_01
Revises:
Create Date: 2026-08-03
"""

from alembic import op


revision = "20260803_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This baseline reflects the reviewed SQLAlchemy metadata at the point
    # Alembic was introduced. Later changes must use explicit revisions.
    from app import models  # noqa: F401
    from app.database import Base

    later_algorithm_practice_tables = {
        "algorithm_practice_sessions",
        "algorithm_practice_session_items",
        "algorithm_attempts",
        "algorithm_review_schedules",
        "algorithm_problem_progress",
        "algorithm_daily_recommendation_settings",
        "algorithm_daily_feeds",
        "algorithm_problem_contexts",
        "algorithm_reasoning_answers",
        "algorithm_reasoning_feedbacks",
    }
    Base.metadata.create_all(
        bind=op.get_bind(),
        tables=[table for table in Base.metadata.sorted_tables if table.name not in later_algorithm_practice_tables],
    )


def downgrade() -> None:
    from app import models  # noqa: F401
    from app.database import Base

    Base.metadata.drop_all(bind=op.get_bind())
