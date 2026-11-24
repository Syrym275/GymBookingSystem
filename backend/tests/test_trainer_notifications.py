"""Trainer email on a paid training booking. Run from backend/: python -m unittest discover -s tests -v."""

import os
import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user
from app.trainer_notifications import TrainerSessionNotice, send_trainer_session_email


START = datetime(2026, 12, 1, 14, 0)
END = datetime(2026, 12, 1, 15, 0)


def booking(status: str, booking_type: str = "training") -> dict:
    return {
        "booking_id": 41, "member_id": 3, "booking_type": booking_type,
        "trainer_id": 5 if booking_type == "training" else None,
        "hall_id": None if booking_type == "training" else 2,
        "start_time": START, "end_time": END, "status": status,
        "price_kzt": Decimal("7000.00"), "created_at": datetime(2026, 11, 24, 10, 0),
        "payment_expires_at": datetime(2026, 11, 24, 10, 15),
    }


PAYMENT = {
    "payment_id": 9, "booking_id": 41, "amount_kzt": Decimal("7000.00"), "method": "card",
    "payment_status": "approved", "provider_txn_ref": "TXN-41-x", "created_at": datetime(2026, 11, 24, 10, 1),
}

NOTICE_ROW = {
    "booking_id": 41, "trainer_email": "coach@gym.kz", "trainer_name": "Aidar Coach",
    "member_name": "Dana <Member>", "start_time": START, "end_time": END,
}


class PaidTrainingEmailsTheTrainer(unittest.TestCase):
    def setUp(self):
        for target in ("app.payments.ensure_booking_access",):
            patcher = patch(target)
            patcher.start()
            self.addCleanup(patcher.stop)
        connection = patch("app.payments.connect")
        self.connect = connection.start()
        self.addCleanup(connection.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        sender = patch("app.trainer_notifications.send_email")
        self.send_email = sender.start()
        self.addCleanup(sender.stop)
        app.dependency_overrides[current_user] = lambda: CurrentUserResponse(
            user_id=1, full_name="Admin", email="admin@gym.kz", role="admin",
        )
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def pay(self, outcome: str = "approve"):
        return self.client.post("/bookings/41/payment", json={"method": "card", "outcome": outcome})

    def test_approved_training_payment_emails_the_trainer(self):
        self.cursor.fetchone.side_effect = [booking("pending"), PAYMENT, booking("confirmed"), NOTICE_ROW]
        response = self.pay()
        self.assertEqual(response.status_code, 200, response.text)
        self.send_email.assert_called_once()
        message = self.send_email.call_args.args[0]
        self.assertEqual(message.to, "coach@gym.kz")
        self.assertIn("01 Dec, 14:00", message.subject)
        self.assertIn("Dana <Member> booked a training session", message.text)
        self.assertIn("14:00–15:00", message.text)
        self.assertIn("Dana &lt;Member&gt;", message.html)
        self.assertNotIn("<Member>", message.html)

    def test_declined_payment_sends_nothing(self):
        declined = dict(PAYMENT, payment_status="declined")
        self.cursor.fetchone.side_effect = [booking("pending"), declined, booking("pending")]
        self.assertEqual(self.pay("decline").status_code, 200)
        self.send_email.assert_not_called()

    def test_hall_rental_sends_nothing(self):
        self.cursor.fetchone.side_effect = [
            booking("pending", "hall_rental"), PAYMENT, booking("confirmed", "hall_rental"),
        ]
        self.assertEqual(self.pay().status_code, 200)
        self.send_email.assert_not_called()

    def test_trainer_without_an_active_login_gets_no_email(self):
        self.cursor.fetchone.side_effect = [booking("pending"), PAYMENT, booking("confirmed"), None]
        self.assertEqual(self.pay().status_code, 200)
        self.send_email.assert_not_called()

    def test_email_failure_does_not_fail_the_payment(self):
        self.send_email.side_effect = OSError("smtp down")
        self.cursor.fetchone.side_effect = [booking("pending"), PAYMENT, booking("confirmed"), NOTICE_ROW]
        with self.assertLogs("app.trainer_notifications", level="ERROR"):
            response = self.pay()
        self.assertEqual(response.status_code, 200)


class CancellingEmailsTheTrainer(unittest.TestCase):
    def setUp(self):
        for target in ("app.bookings.ensure_booking_access", "app.bookings.ensure_email_verified"):
            patcher = patch(target)
            patcher.start()
            self.addCleanup(patcher.stop)
        for name in ("bookings", "admin"):
            connection = patch(f"app.{name}.connect")
            mock = connection.start()
            self.addCleanup(connection.stop)
            cursor = mock.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
            setattr(self, f"{name}_cursor", cursor)
        sender = patch("app.trainer_notifications.send_email")
        self.send_email = sender.start()
        self.addCleanup(sender.stop)
        self.sign_in("member")
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def sign_in(self, role: str):
        app.dependency_overrides[current_user] = lambda: CurrentUserResponse(
            user_id=1, full_name="X", email="x@gym.kz", role=role, member_id=3 if role == "member" else None,
        )

    def member_cancels(self, before: str, *rows):
        self.bookings_cursor.fetchone.side_effect = [{"status": before}, booking("cancelled"), *rows]
        response = self.client.post("/bookings/41/cancel")
        self.assertEqual(response.status_code, 200, response.text)

    def test_cancelling_a_paid_session_emails_the_trainer(self):
        self.member_cancels("confirmed", NOTICE_ROW)
        self.send_email.assert_called_once()
        message = self.send_email.call_args.args[0]
        self.assertEqual(message.to, "coach@gym.kz")
        self.assertEqual(message.subject, "Session cancelled: 01 Dec, 14:00")
        self.assertIn("Your training session with Dana <Member> was cancelled.", message.text)
        self.assertIn("with <strong>Dana &lt;Member&gt;</strong> was cancelled.", message.html)

    def test_cancelling_an_unpaid_hold_sends_nothing(self):
        self.member_cancels("pending")
        self.send_email.assert_not_called()

    def test_cancelling_a_paid_hall_rental_sends_nothing(self):
        self.bookings_cursor.fetchone.side_effect = [{"status": "confirmed"}, booking("cancelled", "hall_rental")]
        self.assertEqual(self.client.post("/bookings/41/cancel").status_code, 200)
        self.send_email.assert_not_called()

    @staticmethod
    def admin_row(status: str) -> dict:
        return dict(
            booking(status), member_name="Dana", member_phone=None, member_email="d@gym.kz",
            member_membership_plan=None, member_membership_expires_on=None, trainer_name="Aidar Coach",
            hall_name=None, payment_id=None, amount_kzt=None, payment_method=None, payment_status=None,
            provider_txn_ref=None, payment_created_at=None, paid_at=None,
        )

    def test_admin_cancelling_a_paid_session_emails_the_trainer(self):
        self.sign_in("admin")
        self.admin_cursor.fetchone.side_effect = [
            {"status": "confirmed", "started": False}, NOTICE_ROW, self.admin_row("cancelled"),
        ]
        response = self.client.post("/admin/bookings/41/status", json={"status": "cancelled"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.send_email.call_args.args[0].subject, "Session cancelled: 01 Dec, 14:00")

    def test_admin_marking_attendance_sends_nothing(self):
        self.sign_in("admin")
        self.admin_cursor.fetchone.side_effect = [{"status": "confirmed", "started": True}, self.admin_row("completed")]
        response = self.client.post("/admin/bookings/41/status", json={"status": "completed"})
        self.assertEqual(response.status_code, 200, response.text)
        self.send_email.assert_not_called()


class EmailContent(unittest.TestCase):
    def test_schedule_link_uses_app_url(self):
        with patch.dict(os.environ, {"APP_URL": "https://gym.example.kz/"}), \
                patch("app.trainer_notifications.send_email") as send:
            send_trainer_session_email(TrainerSessionNotice(**NOTICE_ROW))
        message = send.call_args.args[0]
        self.assertIn("https://gym.example.kz/trainer/schedule", message.text)
        self.assertIn('href="https://gym.example.kz/trainer/schedule"', message.html)


if __name__ == "__main__":
    unittest.main()
