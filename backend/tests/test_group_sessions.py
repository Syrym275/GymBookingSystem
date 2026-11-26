"""Group sessions. Run from backend/: python -m unittest discover -s tests -v."""

import os
import unittest
from datetime import date, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user


START = datetime(2099, 1, 10, 17, 0)
END = datetime(2099, 1, 10, 18, 0)


def booking(**changes):
    row = {
        "booking_id": 41, "member_id": 18, "trainer_id": 5, "booking_type": "training",
        "status": "confirmed", "start_time": START, "end_time": END, "started": False,
    }
    return {**row, **changes}


GROUP_HEAD = {"booking_id": 41, "owner_member_id": 18, "owner_name": "Owner"}


class GroupTestCase(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        verified = patch("app.groups.ensure_email_verified")
        verified.start()
        self.addCleanup(verified.stop)
        connect = patch("app.groups.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        mail = patch("app.groups.send_email")
        self.send_email = mail.start()
        self.addCleanup(mail.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.cursor.fetchall.return_value = []
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.sign_in(member_id=18)

    def sign_in(self, role="member", **fields):
        user = CurrentUserResponse(user_id=1, full_name="Test", email="me@example.kz", role=role, **fields)
        app.dependency_overrides[current_user] = lambda: user
        self.addCleanup(app.dependency_overrides.pop, current_user, None)

    def executed(self) -> list[str]:
        return [c.args[0] for c in self.cursor.execute.call_args_list]


class InviteTests(GroupTestCase):
    def test_owner_invites_a_member_by_email_and_they_get_an_email(self):
        guest = {"member_id": 22, "full_name": "Guest", "email": "guest@example.kz"}
        notice = {"owner_name": "Owner", "start_time": START, "end_time": END, "trainer_name": "Coach", "hall_name": None}
        self.cursor.fetchone.side_effect = [booking(), guest, None, {"n": 1}, notice, GROUP_HEAD]
        self.cursor.fetchall.return_value = [
            {"member_id": 22, "full_name": "Guest", "email": "guest@example.kz", "status": "invited",
             "invited_at": START, "responded_at": None},
        ]

        response = self.client.post("/bookings/41/group", json={"email": "Guest@Example.kz"})

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["size"], 1)  # invited guests are not in the group yet
        self.assertEqual(body["max_size"], 5)
        self.assertEqual(body["participants"][0]["email"], "guest@example.kz")
        self.assertTrue(any("INSERT INTO booking_participants" in q for q in self.executed()))
        self.send_email.assert_called_once()
        self.assertEqual(self.send_email.call_args.args[0].to, "guest@example.kz")
        self.assertIn("/member/groups", self.send_email.call_args.args[0].text)

    def test_only_the_owner_can_invite(self):
        self.cursor.fetchone.side_effect = [booking(member_id=99)]
        response = self.client.post("/bookings/41/group", json={"email": "guest@example.kz"})
        self.assertEqual(response.status_code, 403)
        self.send_email.assert_not_called()

    def test_staff_and_trainers_cannot_invite(self):
        self.sign_in(role="trainer", trainer_id=5)
        response = self.client.post("/bookings/41/group", json={"email": "guest@example.kz"})
        self.assertEqual(response.status_code, 403)
        self.connect.assert_not_called()

    def test_unknown_email_is_rejected(self):
        self.cursor.fetchone.side_effect = [booking(), None]
        response = self.client.post("/bookings/41/group", json={"email": "nobody@example.kz"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "No member account uses this email.")

    def test_cannot_invite_yourself(self):
        self.cursor.fetchone.side_effect = [booking(), {"member_id": 18, "full_name": "Owner", "email": "me@example.kz"}]
        response = self.client.post("/bookings/41/group", json={"email": "me@example.kz"})
        self.assertEqual(response.status_code, 422)

    def test_group_of_five_is_full(self):
        guest = {"member_id": 22, "full_name": "Guest", "email": "guest@example.kz"}
        self.cursor.fetchone.side_effect = [booking(), guest, None, {"n": 4}]
        response = self.client.post("/bookings/41/group", json={"email": "guest@example.kz"})
        self.assertEqual(response.status_code, 409)
        self.assertIn("full", response.json()["detail"])
        self.assertFalse(any("INSERT INTO booking_participants" in q for q in self.executed()))

    def test_already_invited_member_is_not_invited_twice(self):
        guest = {"member_id": 22, "full_name": "Guest", "email": "guest@example.kz"}
        self.cursor.fetchone.side_effect = [booking(), guest, {"status": "invited"}]
        response = self.client.post("/bookings/41/group", json={"email": "guest@example.kz"})
        self.assertEqual(response.status_code, 409)

    def test_cancelled_or_started_sessions_cannot_change(self):
        for row in (booking(status="cancelled"), booking(started=True)):
            with self.subTest(row=row):
                self.cursor.fetchone.side_effect = [row]
                response = self.client.post("/bookings/41/group", json={"email": "guest@example.kz"})
                self.assertEqual(response.status_code, 409)

    def test_invalid_email_is_rejected_before_the_database(self):
        response = self.client.post("/bookings/41/group", json={"email": "not an email"})
        self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()


class AcceptTests(GroupTestCase):
    def setUp(self):
        super().setUp()
        self.sign_in(member_id=22)

    def test_guest_accepts_an_invitation(self):
        self.cursor.fetchone.side_effect = [
            booking(), {"status": "invited"}, {"membership_expires_on": date(2099, 12, 31)}, {"busy": False}, GROUP_HEAD,
        ]
        response = self.client.post("/groups/invitations/41/accept")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(any("SET status = 'accepted'" in q for q in self.executed()))
        # Guests never see other people's emails.
        self.assertTrue(all(p["email"] is None for p in response.json()["participants"]))

    def test_overlapping_booking_blocks_accepting(self):
        self.cursor.fetchone.side_effect = [
            booking(), {"status": "invited"}, {"membership_expires_on": date(2099, 12, 31)}, {"busy": True},
        ]
        response = self.client.post("/groups/invitations/41/accept")
        self.assertEqual(response.status_code, 409)
        self.assertIn("another booking", response.json()["detail"])

    def test_expired_membership_blocks_accepting(self):
        self.cursor.fetchone.side_effect = [booking(), {"status": "invited"}, {"membership_expires_on": date(2099, 1, 1)}]
        response = self.client.post("/groups/invitations/41/accept")
        self.assertEqual(response.status_code, 409)
        self.assertIn("membership", response.json()["detail"])

    def test_no_invitation_means_not_found(self):
        self.cursor.fetchone.side_effect = [booking(), None]
        response = self.client.post("/groups/invitations/41/accept")
        self.assertEqual(response.status_code, 404)

    def test_decline(self):
        self.cursor.fetchone.side_effect = [(22,)]
        response = self.client.post("/groups/invitations/41/decline")
        self.assertEqual(response.status_code, 204)


class RemoveTests(GroupTestCase):
    def test_owner_removes_a_guest(self):
        self.cursor.fetchone.side_effect = [booking(), {"member_id": 22}, GROUP_HEAD]
        response = self.client.delete("/bookings/41/group/22")
        self.assertEqual(response.status_code, 200)
        update = next(c for c in self.cursor.execute.call_args_list if "UPDATE booking_participants" in c.args[0])
        self.assertEqual(update.args[1][0], "removed")

    def test_guest_leaves(self):
        self.sign_in(member_id=22)
        self.cursor.fetchone.side_effect = [booking(), {"member_id": 22}, GROUP_HEAD]
        response = self.client.delete("/bookings/41/group/22")
        self.assertEqual(response.status_code, 200)
        update = next(c for c in self.cursor.execute.call_args_list if "UPDATE booking_participants" in c.args[0])
        self.assertEqual(update.args[1][0], "left")

    def test_guest_cannot_remove_someone_else(self):
        self.sign_in(member_id=22)
        self.cursor.fetchone.side_effect = [booking()]
        response = self.client.delete("/bookings/41/group/23")
        self.assertEqual(response.status_code, 403)


class ViewTests(GroupTestCase):
    def test_stranger_cannot_see_the_group(self):
        self.sign_in(member_id=77)
        self.cursor.fetchone.side_effect = [{"member_id": 18, "trainer_id": 5, "is_guest": False}]
        self.assertEqual(self.client.get("/bookings/41/group").status_code, 403)

    def test_trainer_of_the_session_sees_names_without_emails(self):
        self.sign_in(role="trainer", trainer_id=5)
        self.cursor.fetchone.side_effect = [{"member_id": 18, "trainer_id": 5, "is_guest": False}, GROUP_HEAD]
        self.cursor.fetchall.return_value = [
            {"member_id": 22, "full_name": "Guest", "email": "guest@example.kz", "status": "accepted",
             "invited_at": START, "responded_at": START},
        ]
        response = self.client.get("/bookings/41/group")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["size"], 2)
        self.assertIsNone(response.json()["participants"][0]["email"])

    def test_invitations_list_is_members_only(self):
        self.sign_in(role="receptionist")
        self.assertEqual(self.client.get("/groups/invitations").status_code, 403)


if __name__ == "__main__":
    unittest.main()
