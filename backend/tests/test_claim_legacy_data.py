import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Diary, UserProfile
from scripts.claim_legacy_data import main


ADMIN = "11111111-1111-4111-8111-111111111111"


class ClaimLegacyDataTests(unittest.TestCase):
    def test_claim_is_one_time_and_preserves_records(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add(UserProfile(id=ADMIN, email="admin@example.com", role="admin", active=True))
            db.add(Diary(date="2026-09-24", title="旧日记", raw_text="原文", polished_text="润色", summary="摘要"))
            db.commit()
        with (
            patch("scripts.claim_legacy_data.engine", engine),
            patch("scripts.claim_legacy_data.settings.admin_user_id", ADMIN),
            patch("sys.argv", ["claim_legacy_data", "--admin-user-id", ADMIN, "--admin-email", "admin@example.com", "--apply"]),
        ):
            with patch("sys.argv", ["claim_legacy_data", "--admin-user-id", ADMIN, "--admin-email", "wrong@example.com", "--apply"]):
                with self.assertRaises(SystemExit):
                    main()
            main()
            main()
        with Session(engine) as db:
            self.assertEqual(db.query(Diary).one().user_id, ADMIN)
            self.assertEqual(db.query(Diary).count(), 1)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
