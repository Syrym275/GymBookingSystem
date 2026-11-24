from datetime import datetime, timedelta
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.models import CurrentUserResponse, TrainerAvailabilityUpdateRequest
from app.trainer_status import (
    get_my_availability,
    get_trainer_availability,
    update_my_availability,
)
from app.security import require_roles


class TrainerAvailabilityTests(unittest.TestCase):
    def setUp(self):
        connection = patch("app.trainer_status.connect")
        self.connect = connection.start()
        self.addCleanup(connection.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value

    @staticmethod
    def trainer_user(trainer_id: int = 8) -> CurrentUserResponse:
        return CurrentUserResponse(
            user_id=20,
            full_name="Trainer",
            email="trainer@example.kz",
            role="trainer",
            trainer_id=trainer_id,
        )

    def test_update_uses_authenticated_trainer_and_normalizes_note(self):
        # A break must end in the future, so build the time from today instead of a fixed date.
        break_until = (datetime.now() + timedelta(days=1)).replace(hour=15, minute=0, second=0, microsecond=0)
        self.cursor.fetchone.return_value = {
            "trainer_id": 8,
            "state": "break",
            "note": "back at 15:00",
            "break_until": break_until,
            "updated_at": datetime.now(),
        }

        result = update_my_availability(
            TrainerAvailabilityUpdateRequest(
                state="break",
                note="  back   at 15:00 ",
                break_until=break_until,
            ),
            self.trainer_user(),
        )

        self.assertEqual(result.state, "break")
        self.assertEqual(result.note, "back at 15:00")
        self.assertEqual(
            self.cursor.execute.call_args.args[1],
            ("break", "break", break_until, "back at 15:00", 8),
        )

    def test_past_break_end_is_rejected(self):
        with self.assertRaises(ValueError):
            TrainerAvailabilityUpdateRequest(state="break", break_until=datetime.now() - timedelta(minutes=1))

    def test_available_and_day_off_save_without_a_break_time(self):
        # Regression: an empty break time was sent as text and PostgreSQL refused it.
        for state in ("available", "off"):
            with self.subTest(state=state):
                self.cursor.fetchone.return_value = {
                    "trainer_id": 8, "state": state, "note": "", "break_until": None, "updated_at": datetime.now(),
                }
                result = update_my_availability(TrainerAvailabilityUpdateRequest(state=state), self.trainer_user())
                self.assertEqual(result.state, state)
                self.assertIn("%s::timestamp", self.cursor.execute.call_args.args[0])
                self.assertIsNone(self.cursor.execute.call_args.args[1][2])

    def test_trainer_cannot_read_another_trainers_public_status(self):
        with self.assertRaises(HTTPException) as error:
            get_trainer_availability(9, self.trainer_user(8))
        self.assertEqual(error.exception.status_code, 403)
        self.connect.assert_not_called()

    def test_member_cannot_use_trainer_only_dependency(self):
        member = CurrentUserResponse(
            user_id=21,
            full_name="Member",
            email="member@example.kz",
            role="member",
            member_id=19,
        )
        with self.assertRaises(HTTPException) as error:
            require_roles("trainer")(member)
        self.assertEqual(error.exception.status_code, 403)

    def test_get_own_status_reads_database(self):
        self.cursor.fetchone.return_value = {
            "trainer_id": 8,
            "state": "available",
            "note": "",
            "break_until": None,
            "updated_at": None,
        }

        result = get_my_availability(self.trainer_user())

        self.assertEqual(result.trainer_id, 8)
        self.assertEqual(result.state, "available")
        self.assertEqual(result.updated_at, None)


if __name__ == "__main__":
    unittest.main()
