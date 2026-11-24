"""Signed-in password change. Run from backend/: python -m unittest discover -s tests -v."""

import os
import unittest
from unittest.mock import patch

import bcrypt
from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user


OLD = "Oldpass1!"
NEW = "Newpass2!"
OLD_HASH = bcrypt.hashpw(OLD.encode(), bcrypt.gensalt()).decode()


class ChangePasswordTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        database = patch("app.db._checkout")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        user = CurrentUserResponse(user_id=7, full_name="A B", email="A@b.kz", role="trainer", trainer_id=3, email_verified=True)
        app.dependency_overrides[current_user] = lambda: user
        self.addCleanup(app.dependency_overrides.pop, current_user, None)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.client.cookies.set("gym_session", "this-device")

    def change(self, current: str = OLD, new: str = NEW):
        return self.client.post("/auth/change-password", json={"current_password": current, "new_password": new})

    def calls(self, text: str):
        return [c for c in self.cursor.execute.call_args_list if text in c.args[0]]

    def test_changes_the_password_and_replaces_every_session(self):
        self.cursor.fetchone.side_effect = [(1, None), (OLD_HASH,)]  # attempt 1, stored hash
        response = self.change()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"detail": "Your password has been changed."})
        (update,) = self.calls("UPDATE users SET password_hash")
        new_hash, user_id = update.args[1]
        self.assertEqual(user_id, 7)
        self.assertTrue(bcrypt.checkpw(NEW.encode(), new_hash.encode()))
        # All sessions end (a stolen copy of this cookie too), and this browser gets a new one.
        (sessions,) = self.calls("DELETE FROM user_sessions")
        self.assertEqual(sessions.args[1], (7,))
        self.assertEqual(len(self.calls("INSERT INTO user_sessions")), 1)
        new_cookie = response.cookies.get("gym_session")
        self.assertTrue(new_cookie)
        self.assertNotEqual(new_cookie, "this-device")
        # Reset links emailed earlier stop working.
        (links,) = self.calls("UPDATE password_reset_tokens")
        self.assertEqual(links.args[1], (7,))
        self.assertEqual(self.calls("DELETE FROM login_lockouts")[0].args[1], ("a@b.kz",))
        self.assertIn("auth.password_changed", str(self.cursor.execute.call_args_list))

    def test_wrong_current_password_is_refused_and_counted(self):
        self.cursor.fetchone.side_effect = [(1, None), (OLD_HASH,)]
        response = self.change(current="Wrong1!x")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "The current password is wrong.")
        self.assertEqual(self.calls("UPDATE users SET password_hash"), [])
        self.assertEqual(self.calls("DELETE FROM user_sessions"), [])
        self.assertEqual(self.calls("INSERT INTO login_lockouts")[0].args[1]["email"], "a@b.kz")

    def test_fifth_wrong_current_password_locks(self):
        self.cursor.fetchone.side_effect = [(5, None), (OLD_HASH,)]
        response = self.change(current="Wrong1!x")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "900")

    def test_locked_account_cannot_change_password(self):
        self.cursor.fetchone.side_effect = [(2, 120)]
        response = self.change()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(self.calls("SELECT password_hash"), [])
        self.assertEqual(self.calls("UPDATE users SET password_hash"), [])

    def test_weak_or_unchanged_new_password_never_reaches_the_database(self):
        for new in ["short1!", "nocapital1!", "NoSymbol123", OLD]:
            with self.subTest(new=new):
                response = self.change(new=new)
                self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_requires_sign_in(self):
        app.dependency_overrides.pop(current_user)
        self.client.cookies.clear()
        response = self.change()
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
