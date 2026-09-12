from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import PushSubscription
from app.services.reminder_service import dispatch_due_reminders, reminder_copy, subscription_is_due


class ReminderServiceTests(unittest.TestCase):
    def subscription(self) -> PushSubscription:
        return PushSubscription(
            endpoint="https://push.example/subscription",
            p256dh="key",
            auth="auth",
            enabled=True,
            reminder_time="21:30",
            timezone="Asia/Shanghai",
            interview_goal=3,
            algorithm_goal=3,
            include_diary=True,
            include_review=True,
        )

    def test_due_uses_subscription_timezone_and_only_sends_once(self) -> None:
        subscription = self.subscription()
        due, date_key = subscription_is_due(
            subscription,
            datetime(2026, 9, 8, 13, 31, tzinfo=timezone.utc),
        )
        self.assertTrue(due)
        self.assertEqual(date_key, "2026-09-08")
        subscription.last_sent_local_date = date_key
        self.assertFalse(subscription_is_due(subscription, datetime(2026, 9, 8, 14, 0, tzinfo=timezone.utc))[0])

    def test_copy_is_stable_for_the_day_and_names_missing_work(self) -> None:
        subscription = self.subscription()
        first = reminder_copy(subscription, ["八股 2 道", "一篇日记"], "2026-09-08")
        second = reminder_copy(subscription, ["八股 2 道", "一篇日记"], "2026-09-08")
        self.assertEqual(first, second)
        self.assertIn("八股 2 道、一篇日记", first[1])

    def test_dispatch_skips_notification_when_everything_is_done(self) -> None:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add(self.subscription())
            db.commit()
            with (
                patch("app.services.reminder_service._missing_items", return_value=[]),
                patch("app.services.reminder_service.settings.vapid_private_key", "private"),
                patch("app.services.reminder_service.settings.vapid_subject", "mailto:test@example.com"),
                patch("app.services.reminder_service.webpush") as send,
            ):
                result = dispatch_due_reminders(db, datetime(2026, 9, 8, 13, 31, tzinfo=timezone.utc))
            self.assertEqual(result["sent"], 0)
            send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
