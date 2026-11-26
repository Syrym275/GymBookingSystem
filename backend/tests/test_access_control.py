"""Session tokens and request control: who may read or change which records.

No live database: every connection is a mock.
"""

from datetime import date
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException, Response
from fastapi.testclient import TestClient

from app.bookings import booking_availability, get_booking, list_member_bookings
from app.main import app
from app.models import CurrentUserResponse
from app.security import (
    SESSION_COOKIE,
    _session_hash,
    create_session,
    current_user,
    ensure_booking_access,
    ensure_member_access,
)


def user(role: str, **fields) -> CurrentUserResponse:
    return CurrentUserResponse(user_id=1, full_name="Test User", email="user@example.kz", role=role, **fields)


MEMBER = user("member", member_id=3)
OTHER_MEMBER_ID = 4
TRAINER = user("trainer", trainer_id=5)
RECEPTION = user("receptionist")


class SessionTokenTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        database = patch("app.security.connect")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_request_without_token_gets_401(self):
        for path in ["/auth/me", "/bookings", "/bookings/1", "/bookings/1/payments", "/members/1"]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)
        self.connect.assert_not_called()

    def test_unknown_or_expired_token_gets_401(self):
        # The query only returns sessions that exist and have not expired, so both cases look the same.
        self.cursor.fetchone.return_value = None
        self.client.cookies.set(SESSION_COOKIE, "made-up-token")
        response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 401)
        sql = self.cursor.execute.call_args.args[0]
        self.assertIn("expires_at > CURRENT_TIMESTAMP", sql)
        self.assertIn("u.is_active = TRUE", sql)

    def test_database_only_sees_the_token_hash(self):
        self.cursor.fetchone.return_value = None
        self.client.cookies.set(SESSION_COOKIE, "secret-token")
        self.client.get("/auth/me")
        self.assertEqual(self.cursor.execute.call_args.args[1], (_session_hash("secret-token"),))
        self.assertNotIn("secret-token", str(self.cursor.execute.call_args_list))

    def test_new_session_cookie_is_random_http_only_and_stores_only_a_hash(self):
        tokens = []
        for _ in range(2):
            response = Response()
            create_session(7, response)
            cookie = response.headers["set-cookie"]
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=lax", cookie)
            token = cookie.split(";")[0].split("=", 1)[1]
            self.assertGreaterEqual(len(token), 43)
            user_id, stored_hash, _ = self.cursor.execute.call_args.args[1]
            self.assertEqual((user_id, stored_hash), (7, _session_hash(token)))
            tokens.append(token)
        self.assertNotEqual(tokens[0], tokens[1])

    def test_logout_deletes_the_session(self):
        self.client.cookies.set(SESSION_COOKIE, "secret-token")
        response = self.client.post("/auth/logout")
        self.assertEqual(response.status_code, 204)
        sql, params = self.cursor.execute.call_args.args
        self.assertIn("DELETE FROM user_sessions", sql)
        self.assertEqual(params, (_session_hash("secret-token"),))


class BookingOwnershipTests(unittest.TestCase):
    """ensure_booking_access reads (member_id, trainer_id, booking_type) of the booking."""

    def setUp(self):
        database = patch("app.security.connect")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value

    def assert_forbidden(self, account, booking, *, write=False):
        self.cursor.fetchone.return_value = booking
        with self.assertRaises(HTTPException) as error:
            ensure_booking_access(account, 41, write=write)
        self.assertEqual(error.exception.status_code, 403)

    def assert_allowed(self, account, booking, *, write=False):
        self.cursor.fetchone.return_value = booking
        ensure_booking_access(account, 41, write=write)

    def test_member_reaches_own_booking(self):
        self.assert_allowed(MEMBER, (3, 5, "training"), write=True)

    def test_member_cannot_read_or_change_another_members_booking(self):
        self.assert_forbidden(MEMBER, (OTHER_MEMBER_ID, 5, "training"))
        self.assert_forbidden(MEMBER, (OTHER_MEMBER_ID, 5, "training"), write=True)

    def test_trainer_reads_only_own_sessions_and_cannot_change_them(self):
        self.assert_allowed(TRAINER, (3, 5, "training"))
        self.assert_forbidden(TRAINER, (3, 6, "training"))
        self.assert_forbidden(TRAINER, (3, None, "hall_rental"))
        self.assert_forbidden(TRAINER, (3, 5, "training"), write=True)

    def test_staff_reach_every_booking(self):
        self.assert_allowed(RECEPTION, (OTHER_MEMBER_ID, 6, "training"), write=True)

    def test_missing_booking_is_404(self):
        self.cursor.fetchone.return_value = None
        with self.assertRaises(HTTPException) as error:
            ensure_booking_access(MEMBER, 41)
        self.assertEqual(error.exception.status_code, 404)


class RequestControlTests(unittest.TestCase):
    def setUp(self):
        database = patch("app.bookings.connect")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value

    def test_member_profile_access(self):
        ensure_member_access(MEMBER, 3)
        for account, member_id in ((MEMBER, OTHER_MEMBER_ID), (TRAINER, 3)):
            with self.subTest(role=account.role), self.assertRaises(HTTPException) as error:
                ensure_member_access(account, member_id)
            self.assertEqual(error.exception.status_code, 403)

    def test_member_booking_list_ignores_a_foreign_member_id(self):
        self.cursor.fetchall.return_value = []
        list_member_bookings(member_id=OTHER_MEMBER_ID, user=MEMBER)
        params = self.cursor.execute.call_args.args[1]
        self.assertEqual(params[1:3], (3, 3))

    def test_trainer_booking_list_only_shows_own_sessions(self):
        self.cursor.fetchall.return_value = []
        list_member_bookings(trainer_id=6, user=TRAINER)
        params = self.cursor.execute.call_args.args[1]
        self.assertEqual(params, (5, None, None, 5, 5))

    def test_member_cannot_ask_for_another_members_busy_hours(self):
        with self.assertRaises(HTTPException) as error:
            booking_availability("training", 5, date(2030, 1, 10), member_id=OTHER_MEMBER_ID, user=MEMBER)
        self.assertEqual(error.exception.status_code, 403)

    def test_trainer_cannot_learn_a_members_busy_hours(self):
        self.cursor.fetchone.side_effect = [("available", None), *[(False,)] * 15]
        booking_availability("training", 5, date(2030, 1, 10), member_id=OTHER_MEMBER_ID, user=TRAINER)
        slot_queries = [call.args[1] for call in self.cursor.execute.call_args_list if call.args[1:] and len(call.args[1]) == 6]
        self.assertTrue(slot_queries)
        # Neither the member's own bookings nor the group sessions they joined are looked up.
        self.assertTrue(all(params[2] is None and params[3] is None for params in slot_queries))

    def test_trainer_does_not_see_member_phone_on_a_single_booking(self):
        self.cursor.fetchone.return_value = None
        with patch("app.bookings.ensure_booking_access"):
            for account, hidden in ((TRAINER, True), (MEMBER, False), (RECEPTION, False)):
                with self.subTest(role=account.role), self.assertRaises(HTTPException):
                    get_booking(41, user=account)
                self.assertIn("CASE WHEN %s THEN NULL ELSE m.phone END", self.cursor.execute.call_args.args[0])
                self.assertEqual(self.cursor.execute.call_args.args[1], (hidden, 41))


if __name__ == "__main__":
    unittest.main()
