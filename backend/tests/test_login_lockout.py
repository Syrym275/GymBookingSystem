"""Sign-in lockout after repeated wrong passwords. Run from backend/: python -m unittest discover -s tests -v."""

import os
import unittest
from unittest.mock import patch

import bcrypt
from fastapi.testclient import TestClient

from app.main import app


PASSWORD_HASH = bcrypt.hashpw(b"Abcdef1!", bcrypt.gensalt()).decode()
ACCOUNT = (7, "a@b.kz", PASSWORD_HASH, "member", 3, None, "A B", None, None, None, True)


def attempt(number: int, locked_seconds: float | None = None):
    """Row returned by login_lockout.begin_attempt: attempt number in this window, seconds left on a lock."""
    return (number, locked_seconds)


class LoginLockoutTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        database = patch("app.db._checkout")
        self.connect = database.start()
        self.addCleanup(database.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def login(self, password: str = "Abcdef1!", email: str = " A@B.kz "):
        return self.client.post("/auth/login", json={"email": email, "password": password})

    def sql(self) -> str:
        return "\n".join(call.args[0] for call in self.cursor.execute.call_args_list)

    def lock_calls(self):
        return [c for c in self.cursor.execute.call_args_list if "SET locked_until = CURRENT_TIMESTAMP" in c.args[0]]

    def test_attempt_is_counted_before_the_password_is_checked(self):
        self.cursor.fetchone.side_effect = [attempt(1), ACCOUNT]
        self.login("wrong-password")
        statements = [c.args[0] for c in self.cursor.execute.call_args_list]
        count = next(i for i, sql in enumerate(statements) if "INSERT INTO login_lockouts" in sql)
        lookup = next(i for i, sql in enumerate(statements) if "FROM users u" in sql)
        self.assertLess(count, lookup)
        self.assertEqual(self.cursor.execute.call_args_list[count].args[1]["email"], "a@b.kz")

    def test_locked_email_is_refused_without_checking_the_password(self):
        self.cursor.fetchone.side_effect = [attempt(3, 600.2)]  # 10 minutes left on the lock
        response = self.login()  # correct password, still refused
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "601")
        self.assertEqual(response.json()["detail"], "Too many failed sign-in attempts. Try again in 11 minutes.")
        self.assertNotIn("FROM users u", self.sql())
        self.assertNotIn("INSERT INTO user_sessions", self.sql())

    def test_failures_below_the_limit_are_plain_wrong_password(self):
        self.cursor.fetchone.side_effect = [attempt(4), ACCOUNT]
        response = self.login("wrong-password")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Wrong email or password.")
        self.assertEqual(self.lock_calls(), [])

    def test_fifth_failure_locks_the_email_for_15_minutes(self):
        self.cursor.fetchone.side_effect = [attempt(5), ACCOUNT]
        response = self.login("wrong-password")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "900")
        self.assertIn("15 minutes", response.json()["detail"])
        (lock,) = self.lock_calls()
        self.assertEqual(lock.args[1], (15, "a@b.kz"))
        self.assertIn("auth.login_locked", str(self.cursor.execute.call_args_list))

    def test_parallel_attempts_over_the_limit_are_refused_before_checking(self):
        # Five earlier attempts are still being checked; the sixth must not get a guess.
        self.cursor.fetchone.side_effect = [attempt(6)]
        with patch("app.auth.bcrypt.checkpw") as checkpw:
            response = self.login()
        self.assertEqual(response.status_code, 429)
        checkpw.assert_not_called()
        self.assertNotIn("FROM users u", self.sql())
        self.assertEqual(len(self.lock_calls()), 1)

    def test_fifth_success_is_still_allowed(self):
        self.cursor.fetchone.side_effect = [attempt(5), ACCOUNT]
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.lock_calls(), [])

    def test_unknown_email_is_counted_and_locked_the_same_way(self):
        self.cursor.fetchone.side_effect = [attempt(5), None]
        response = self.login(email="nobody@b.kz")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(self.lock_calls()[0].args[1], (15, "nobody@b.kz"))

    def test_unknown_email_still_runs_bcrypt_so_timing_reveals_nothing(self):
        self.cursor.fetchone.side_effect = [attempt(1), None]
        with patch("app.auth.bcrypt.checkpw", wraps=bcrypt.checkpw) as checkpw:
            response = self.login(email="nobody@b.kz")
        self.assertEqual(response.status_code, 401)
        checkpw.assert_called_once()

    def test_successful_login_clears_the_failure_count(self):
        self.cursor.fetchone.side_effect = [attempt(1), ACCOUNT]
        response = self.login()
        self.assertEqual(response.status_code, 200)
        clear = next(c for c in self.cursor.execute.call_args_list if "DELETE FROM login_lockouts" in c.args[0])
        self.assertEqual(clear.args[1], ("a@b.kz",))

    def test_password_over_72_bytes_is_a_wrong_password_not_a_crash(self):
        self.cursor.fetchone.side_effect = [attempt(1), ACCOUNT]
        response = self.login("Я" * 40)  # 40 characters, 80 bytes
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
