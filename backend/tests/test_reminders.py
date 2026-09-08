from datetime import datetime, timezone
import unittest

from app.models import PushSubscription
from app.services.reminder_service import reminder_copy, subscription_is_due


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


if __name__ == "__main__":
    unittest.main()
