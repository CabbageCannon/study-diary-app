"""Add user ownership to personal records.

Legacy rows remain unassigned until the explicit claim_legacy_data step.

Revision ID: 20260924_01
Revises: 20260909_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20260924_01"
down_revision = "20260909_01"
branch_labels = None
depends_on = None


PERSONAL_TABLES = (
    "diaries",
    "push_subscriptions",
    "algorithm_practice_sessions",
    "algorithm_attempts",
    "algorithm_review_schedules",
    "algorithm_problem_progress",
    "algorithm_reasoning_answers",
    "algorithm_daily_recommendation_settings",
    "algorithm_daily_feeds",
    "interview_question_sets",
    "interview_answers",
    "interview_review_schedules",
    "study_sessions",
)


def _replace_unique(table: str, old_column: str, new_name: str) -> None:
    bind = op.get_bind()
    uniques = sa.inspect(bind).get_unique_constraints(table)
    if any(set(constraint["column_names"]) == {"user_id", old_column} for constraint in uniques):
        return
    matching = [
        constraint for constraint in uniques
        if constraint["column_names"] == [old_column]
    ]
    if bind.dialect.name == "sqlite":
        convention = {"uq": "uq_%(table_name)s_%(column_0_name)s"}
        with op.batch_alter_table(table, recreate="always", naming_convention=convention) as batch:
            for constraint in matching:
                batch.drop_constraint(constraint["name"] or f"uq_{table}_{old_column}", type_="unique")
            batch.create_unique_constraint(new_name, ["user_id", old_column])
    else:
        for constraint in matching:
            op.drop_constraint(constraint["name"], table, type_="unique")
        op.create_unique_constraint(new_name, table, ["user_id", old_column])


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_profiles" not in inspector.get_table_names():
        op.create_table(
            "user_profiles",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email", sa.String(320), nullable=False),
            sa.Column("role", sa.String(20), nullable=False, server_default="user"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("preferences_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    if "ix_user_profiles_email" not in {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("user_profiles")}:
        op.create_index("ix_user_profiles_email", "user_profiles", ["email"])
    for table in PERSONAL_TABLES:
        table_inspector = sa.inspect(op.get_bind())
        if "user_id" not in {column["name"] for column in table_inspector.get_columns(table)}:
            op.add_column(table, sa.Column("user_id", sa.String(36), nullable=True))
        if f"ix_{table}_user_id" not in {index["name"] for index in table_inspector.get_indexes(table)}:
            op.create_index(f"ix_{table}_user_id", table, ["user_id"])

    _replace_unique("algorithm_review_schedules", "problem_id", "uq_algorithm_review_user_problem")
    _replace_unique("algorithm_problem_progress", "problem_id", "uq_algorithm_progress_user_problem")
    _replace_unique("algorithm_daily_feeds", "recommendation_date", "uq_algorithm_feed_user_date")
    _replace_unique("interview_review_schedules", "question_id", "uq_interview_review_user_question")
    _replace_unique("study_sessions", "client_event_id", "uq_study_session_user_event")
    settings_indexes = sa.inspect(op.get_bind()).get_indexes("algorithm_daily_recommendation_settings")
    if not any(index["column_names"] == ["user_id"] and index["unique"] for index in settings_indexes):
        op.create_index(
            "ix_algorithm_daily_recommendation_settings_user_id_unique",
            "algorithm_daily_recommendation_settings", ["user_id"], unique=True,
        )

    # The browser receives a Supabase publishable key for Auth. It must not be
    # able to bypass the Render API through Supabase's public PostgREST schema.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        from app.database import Base
        from app import models  # noqa: F401

        quoted = bind.dialect.identifier_preparer.quote
        roles = {
            row[0] for row in bind.execute(
                sa.text("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
            )
        }
        for table in Base.metadata.sorted_tables:
            name = f"public.{quoted(table.name)}"
            op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
            for role in roles:
                op.execute(f"REVOKE ALL PRIVILEGES ON TABLE {name} FROM {quoted(role)}")


def downgrade() -> None:
    raise RuntimeError("Account ownership cannot be safely removed once users have data")
