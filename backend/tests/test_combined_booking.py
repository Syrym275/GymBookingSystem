"""Hall + trainer ("combined") bookings. Run from backend/: python -m unittest discover -s tests -v."""

import os
import unittest
from decimal import Decimal
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user


def sign_in(test: unittest.TestCase, **fields) -> None:
    user = CurrentUserResponse(user_id=1, full_name="Test User", email="user@example.kz", email_verified=True, **fields)
    app.dependency_overrides[current_user] = lambda: user
    test.addCleanup(app.dependency_overrides.pop, current_user, None)


COMBINED = {
    "member_id": 18,
    "booking_type": "combined",
    "trainer_id": 5,
    "hall_id": 2,
    "start_time": "2026-12-12T17:00:00",
    "end_time": "2026-12-12T19:00:00",
}


class CombinedBookingRequestRules(unittest.TestCase):
    def setUp(self):
        connect = patch("app.bookings.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        sign_in(self, role="admin")

    def test_needs_both_a_hall_and_a_trainer(self):
        for change in ({"hall_id": None}, {"trainer_id": None}):
            with self.subTest(change=change):
                response = self.client.post("/bookings", json={**COMBINED, **change})
                self.assertEqual(response.status_code, 422)
                self.assertIn("needs both a hall and a trainer", response.json()["detail"])
        self.connect.assert_not_called()

    def test_must_start_and_end_on_the_hour(self):
        response = self.client.post("/bookings", json={**COMBINED, "start_time": "2026-12-12T17:30:00"})
        self.assertEqual(response.status_code, 422)
        self.assertIn("on the hour", response.json()["detail"])
        self.connect.assert_not_called()

    def test_training_and_hall_rental_rules_are_unchanged(self):
        training = {**COMBINED, "booking_type": "training"}
        response = self.client.post("/bookings", json=training)  # a hall must not ride along
        self.assertEqual(response.status_code, 422)
        self.assertIn("needs a trainer and no hall", response.json()["detail"])
        hall = {**COMBINED, "booking_type": "hall_rental"}
        response = self.client.post("/bookings", json=hall)  # a trainer must not ride along
        self.assertEqual(response.status_code, 422)
        self.assertIn("needs a hall and no trainer", response.json()["detail"])


class CombinedBookingCreate(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        guard = patch("app.verification.ensure_email_verified")
        guard.start()
        self.addCleanup(guard.stop)
        connect = patch("app.bookings.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        sign_in(self, role="admin")

    def inserted(self):
        for call in self.cursor.execute.call_args_list:
            if "INSERT INTO bookings" in call.args[0]:
                return call.args[1]
        return None

    def test_price_is_trainer_plus_hall_for_every_hour(self):
        saved = {
            "booking_id": 77, "member_id": 18, "booking_type": "combined", "trainer_id": 5, "hall_id": 2,
            "start_time": "2026-12-12T17:00:00", "end_time": "2026-12-12T19:00:00", "status": "pending",
            "price_kzt": Decimal("26000.00"), "created_at": "2026-11-26T10:00:00", "payment_expires_at": "2026-11-26T10:15:00",
        }
        self.cursor.fetchone.side_effect = [
            {"starts_in_past": False},
            {"session_price_kzt": Decimal("7000"), "availability_status": "available", "availability_break_until": None},
            {"trainer_busy": False},
            {"hourly_rate_kzt": Decimal("6000")},
            saved,
        ]
        response = self.client.post("/bookings", json=COMBINED)
        self.assertEqual(response.status_code, 201, response.text)
        # (7000 trainer + 6000 hall) x 2 hours
        member_id, booking_type, trainer_id, hall_id, _start, _end, price = self.inserted()
        self.assertEqual((member_id, booking_type, trainer_id, hall_id), (18, "combined", 5, 2))
        self.assertEqual(price, Decimal("26000.00"))
        self.assertEqual(response.json()["booking_type"], "combined")

    def test_a_busy_trainer_blocks_the_whole_booking(self):
        self.cursor.fetchone.side_effect = [
            {"starts_in_past": False},
            {"session_price_kzt": Decimal("7000"), "availability_status": "available", "availability_break_until": None},
            {"trainer_busy": True},
        ]
        response = self.client.post("/bookings", json=COMBINED)
        self.assertEqual(response.status_code, 409)
        self.assertIn("trainer is already booked", response.json()["detail"])
        self.assertIsNone(self.inserted())

    def test_trainer_on_a_day_off_cannot_be_booked_with_a_hall(self):
        self.cursor.fetchone.side_effect = [
            {"starts_in_past": False},
            {"session_price_kzt": Decimal("7000"), "availability_status": "off", "availability_break_until": None},
        ]
        response = self.client.post("/bookings", json=COMBINED)
        self.assertEqual(response.status_code, 409)
        self.assertIn("day off", response.json()["detail"])
        self.assertIsNone(self.inserted())

    def test_unknown_hall_is_404_and_nothing_is_saved(self):
        self.cursor.fetchone.side_effect = [
            {"starts_in_past": False},
            {"session_price_kzt": Decimal("7000"), "availability_status": "available", "availability_break_until": None},
            {"trainer_busy": False},
            None,
        ]
        response = self.client.post("/bookings", json=COMBINED)
        self.assertEqual(response.status_code, 404)
        self.assertIn("Hall not found", response.json()["detail"])
        self.assertIsNone(self.inserted())


class TrainerSeesCombinedBookings(unittest.TestCase):
    """A trainer is in the room for a combined booking, so it is on their schedule and they may open it."""

    def test_trainer_may_open_a_combined_booking_that_includes_them(self):
        from fastapi import HTTPException
        from app.security import ensure_booking_access

        trainer = CurrentUserResponse(user_id=9, full_name="Coach", email="c@example.kz", role="trainer", trainer_id=5)
        for booking_type, allowed in (("combined", True), ("training", True), ("hall_rental", False)):
            with self.subTest(booking_type=booking_type), patch("app.security.connect") as connect:
                cursor = connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
                cursor.fetchone.return_value = (18, 5, booking_type)
                if allowed:
                    ensure_booking_access(trainer, 1)
                else:
                    with self.assertRaises(HTTPException):
                        ensure_booking_access(trainer, 1)


if __name__ == "__main__":
    unittest.main()
