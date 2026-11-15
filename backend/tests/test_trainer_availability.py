from datetime import datetime
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
        self.cursor.fetchone.return_value = {
            "trainer_id": 8,
            "state": "break",
            "note": "back at 15:00",
            "break_until": datetime(2026, 11, 16, 15, 0),
            "updated_at": datetime(2026, 11, 15, 12, 0),
        }

        result = update_my_availability(
            TrainerAvailabilityUpdateRequest(
                state="break",
                note="  back   at 15:00 ",
                break_until=datetime(2026, 11, 16, 15, 0),
            ),
            self.trainer_user(),
        )

        self.assertEqual(result.state, "break")
        self.assertEqual(result.note, "back at 15:00")
        self.assertEqual(
            self.cursor.execute.call_args.args[1],
            ("break", "break", datetime(2026, 11, 16, 15, 0), "back at 15:00", 8),
        )

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
