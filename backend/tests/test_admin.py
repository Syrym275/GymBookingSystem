"""Admin API and the create_admin script. Run from backend/: python -m unittest tests.test_admin -v"""

from datetime import datetime
from decimal import Decimal
import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user


ADMIN = CurrentUserResponse(user_id=1, full_name="Admin", email="admin@gym.kz", role="admin")
RECEPTION = CurrentUserResponse(user_id=2, full_name="Desk", email="desk@gym.kz", role="receptionist")
TRAINER_ROW = dict(trainer_id=7, full_name="New Trainer", specialization="Boxing", session_price_kzt=Decimal("7000"), is_active=True)


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        database = patch("app.admin.connect")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.connection = self.connect.return_value.__enter__.return_value
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.cursor.execute.return_value = self.cursor
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(app.dependency_overrides.clear)
        self.sign_in(ADMIN)

    def sign_in(self, user):
        app.dependency_overrides[current_user] = lambda: user

    def executed(self) -> list[str]:
        return [call.args[0] for call in self.cursor.execute.call_args_list]

    def audit_actions(self) -> list[str]:
        return [call.args[1][3] for call in self.cursor.execute.call_args_list if "INSERT INTO audit_log" in call.args[0]]

    def test_every_admin_route_rejects_other_roles(self):
        self.sign_in(RECEPTION)
        for path in ["/admin/trainers", "/admin/trainer-applications", "/admin/members", "/admin/audit", "/admin/staff"]:
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.assertEqual(self.client.post("/admin/trainer-applications/7/approve").status_code, 403)
        self.connect.assert_not_called()

    def test_signed_out_user_gets_401(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/admin/trainers").status_code, 401)

    def test_approve_activates_pending_trainer_and_audits(self):
        self.cursor.fetchone.return_value = TRAINER_ROW
        response = self.client.post("/admin/trainer-applications/7/approve")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])
        update = next(q for q in self.executed() if q.lstrip().startswith("UPDATE trainers"))
        self.assertIn("approved_at = CURRENT_TIMESTAMP", update)
        self.assertIn("t.approved_at IS NULL", update)  # only a still-pending sign-up can be approved
        self.assertEqual(self.audit_actions(), ["trainer.approved"])

    def test_approve_unknown_application_is_404(self):
        self.cursor.fetchone.return_value = None
        response = self.client.post("/admin/trainer-applications/99/approve")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.audit_actions(), [])

    def test_reject_deletes_login_and_trainer(self):
        self.cursor.fetchone.side_effect = [{"full_name": "New Trainer", "email": "new@gym.kz"}, {"n": 0}]
        response = self.client.post("/admin/trainer-applications/7/reject")
        self.assertEqual(response.status_code, 204)
        queries = self.executed()
        self.assertTrue(any(q.startswith("DELETE FROM users WHERE trainer_id") for q in queries))
        self.assertTrue(any(q.startswith("DELETE FROM trainers") for q in queries))
        self.assertEqual(self.audit_actions(), ["trainer.rejected"])

    def test_trainer_with_bookings_cannot_be_deleted(self):
        self.cursor.fetchone.side_effect = [{"full_name": "Busy Trainer"}, {"n": 3}]
        response = self.client.delete("/admin/trainers/7")
        self.assertEqual(response.status_code, 409)
        self.assertFalse(any(q.startswith("DELETE") for q in self.executed()))

    def test_activating_trainer_also_approves(self):
        self.cursor.fetchone.return_value = TRAINER_ROW
        response = self.client.patch("/admin/trainers/7", json={"is_active": True})
        self.assertEqual(response.status_code, 200)
        self.assertIn("approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)", self.executed()[0])
        self.assertEqual(self.audit_actions(), ["trainer.activated"])

    def test_staff_form_cannot_create_a_second_admin(self):
        response = self.client.post(
            "/admin/staff",
            json={"full_name": "Second Admin", "email": "two@gym.kz", "role": "admin", "password": "Strong#Pass1"},
        )
        self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_staff_password_follows_password_rules(self):
        response = self.client.post(
            "/admin/staff",
            json={"full_name": "Desk", "email": "desk2@gym.kz", "role": "receptionist", "password": "weakpassword"},
        )
        self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_admin_cannot_deactivate_own_account(self):
        response = self.client.patch(f"/admin/staff/{ADMIN.user_id}", json={"is_active": False})
        self.assertEqual(response.status_code, 409)
        self.connect.assert_not_called()

    def test_deactivating_staff_ends_their_sessions(self):
        self.cursor.fetchone.side_effect = [
            {"email": "desk@gym.kz", "role": "receptionist"},
            dict(user_id=2, email="desk@gym.kz", role="receptionist", trainer_id=None, is_active=False, full_name="Desk"),
        ]
        response = self.client.patch("/admin/staff/2", json={"is_active": False})
        self.assertEqual(response.status_code, 200)
        self.assertIn("DELETE FROM user_sessions WHERE user_id = %s", self.executed())
        self.assertEqual(self.audit_actions(), ["staff.deactivated"])

    def test_booking_status_rejects_impossible_change(self):
        self.cursor.fetchone.return_value = {"status": "expired", "started": True}
        response = self.client.post("/admin/bookings/5/status", json={"status": "confirmed"})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(any(q.startswith("UPDATE bookings") for q in self.executed()))

    def test_cancelling_paid_booking_refunds_payment(self):
        booking = dict(
            booking_id=5, member_id=1, booking_type="training", trainer_id=1, hall_id=None,
            start_time=datetime(2026, 12, 1, 10), end_time=datetime(2026, 12, 1, 11), status="cancelled",
            price_kzt=Decimal("7000"), created_at=datetime(2026, 11, 1), payment_expires_at=None,
            member_name="M", member_phone="+77000000000", member_email="m@gym.kz",
            member_membership_plan="monthly", member_membership_expires_on=datetime(2027, 1, 1).date(),
            trainer_name="T", hall_name=None, payment_id=None, amount_kzt=None, payment_method=None,
            payment_status=None, provider_txn_ref=None, payment_created_at=None, paid_at=None,
        )
        self.cursor.fetchone.side_effect = [{"status": "confirmed", "started": False}, booking]
        response = self.client.post("/admin/bookings/5/status", json={"status": "cancelled"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any("SET payment_status = 'refunded'" in q for q in self.executed()))
        self.assertEqual(self.audit_actions(), ["booking.status_changed"])


class CreateAdminScriptTests(unittest.TestCase):
    def run_script(self, *args, existing_admin=None):
        from scripts import create_admin

        connection = MagicMock()
        connection.__enter__.return_value = connection
        results = iter([(1,), existing_admin])  # migration column check, then the admin lookup
        connection.execute.side_effect = lambda *a, **k: MagicMock(fetchone=MagicMock(return_value=next(results)))
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"}), \
             patch("scripts.create_admin.psycopg.connect", return_value=connection), \
             patch("sys.argv", ["create_admin", *args]), \
             patch("builtins.input") as typed:
            code = create_admin.main()
        return code, connection, typed

    def test_refuses_when_an_admin_already_exists(self):
        code, connection, typed = self.run_script(existing_admin=(1, "admin@gym.kz", "Admin", True))
        self.assertEqual(code, 1)
        typed.assert_not_called()  # it checks before asking anything
        connection.cursor.assert_not_called()  # and changes nothing

    def test_show_reports_missing_admin(self):
        code, connection, _ = self.run_script("--show", existing_admin=None)
        self.assertEqual(code, 0)
        connection.cursor.assert_not_called()


if __name__ == "__main__":
    unittest.main()
