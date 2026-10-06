"""Assign pre-login records to the verified administrator, once.

Run after backing up PostgreSQL and signing in as ADMIN_USER_ID. Without
--apply this only prints counts. The claim and NOT NULL constraints share one
transaction, so a failure cannot leave a partially assigned database.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402


PERSONAL_TABLES = (
    "diaries", "push_subscriptions", "algorithm_practice_sessions",
    "algorithm_attempts", "algorithm_review_schedules", "algorithm_problem_progress",
    "algorithm_reasoning_answers", "algorithm_daily_recommendation_settings",
    "algorithm_daily_feeds", "interview_question_sets", "interview_answers",
    "interview_review_schedules", "study_sessions",
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-user-id", required=True)
    parser.add_argument("--admin-email", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    user_id = str(UUID(args.admin_user_id))
    if not settings.admin_user_id or user_id != settings.admin_user_id:
        raise SystemExit("ADMIN_USER_ID must match --admin-user-id")

    with engine.begin() as connection:
        profile = connection.execute(
            text("SELECT email, active FROM user_profiles WHERE id = :id"), {"id": user_id}
        ).one_or_none()
        if profile is None or not profile.active or profile.email.casefold() != args.admin_email.strip().casefold():
            raise SystemExit("Sign in with the verified administrator account before claiming legacy data")
        counts = {
            table: int(connection.execute(text(f"SELECT count(*) FROM {table} WHERE user_id IS NULL")).scalar_one())
            for table in PERSONAL_TABLES
        }
        for table, count in counts.items():
            print(f"{table}: {count} unassigned")
        if not args.apply:
            print("Dry run only. Back up the database, then repeat with --apply.")
            return
        for table, count in counts.items():
            changed = connection.execute(
                text(f"UPDATE {table} SET user_id = :id WHERE user_id IS NULL"), {"id": user_id}
            ).rowcount
            if changed != count:
                raise RuntimeError(f"{table}: expected {count} updates, got {changed}")
            remaining = connection.execute(text(f"SELECT count(*) FROM {table} WHERE user_id IS NULL")).scalar_one()
            if remaining:
                raise RuntimeError(f"{table}: {remaining} unassigned rows remain")
        if engine.dialect.name == "postgresql":
            for table in PERSONAL_TABLES:
                connection.execute(text(f"ALTER TABLE {table} ALTER COLUMN user_id SET NOT NULL"))
        print("Legacy records assigned and verified. Ownership columns are now required on PostgreSQL.")


if __name__ == "__main__":
    main()
