"""Run from backend/: python -m unittest discover -s tests -v."""

import os
import re
import unittest
from unittest.mock import patch

import bcrypt
from fastapi.testclient import TestClient
from psycopg import OperationalError

from app.main import app
from app.verification import token_hash


class PasswordResetTests(unittest.TestCase):
    token = "y" * 43

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test", "APP_URL": "https://gym.example.kz/"})
        environment.start()
        self.addCleanup(environment.stop)
        connect = patch("app.db.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        sender = patch("app.password_reset.send_email")
        self.send_email = sender.start()
        self.addCleanup(sender.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def sql(self):
        return [" ".join(call.args[0].split()) for call in self.cursor.execute.call_args_list]

    # -- forgot-password ------------------------------------------------------------

    def test_forgot_password_emails_a_hashed_one_time_link(self):
        self.cursor.fetchone.side_effect = [(7,), (0,)]
        response = self.client.post("/auth/forgot-password", json={"email": " Member@Example.KZ "})

        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], ("member@example.kz",))
        self.send_email.assert_called_once()
        message = self.send_email.call_args.args[0]
        self.assertEqual(message.to, "member@example.kz")
        link = re.search(r"https://gym\.example\.kz/reset-password\?token=([A-Za-z0-9_-]{43})", message.text)
        self.assertIsNotNone(link)

        # Older links are expired first, and only the hash of the new token is stored.
        statements = self.sql()
        self.assertTrue(statements[2].startswith("UPDATE password_reset_tokens SET expires_at"))
        self.assertTrue(statements[3].startswith("INSERT INTO password_reset_tokens"))
        stored = self.cursor.execute.call_args_list[3].args[1]
        self.assertEqual(stored[1], token_hash(link.group(1)))
        self.assertNotIn(link.group(1), str(stored))

    def test_forgot_password_answers_the_same_for_unknown_and_limited_accounts(self):
        answers = []
        for rows in ([None], [(7,), (3,)], [(7,), (0,)]):
            self.cursor.fetchone.side_effect = rows
            response = self.client.post("/auth/forgot-password", json={"email": "a@b.kz"})
            self.assertEqual(response.status_code, 202)
            answers.append(response.json())

        self.assertEqual(answers[0], answers[1])
        self.assertEqual(answers[1], answers[2])
        self.assertEqual(self.send_email.call_count, 1)  # only the last one was allowed

    def test_mail_failure_does_not_leak_into_the_answer(self):
        self.send_email.side_effect = RuntimeError("SMTP down")
        self.cursor.fetchone.side_effect = [(7,), (0,)]
        response = self.client.post("/auth/forgot-password", json={"email": "a@b.kz"})
        self.assertEqual(response.status_code, 202)

    def test_forgot_password_returns_503_when_the_database_fails(self):
        self.connect.side_effect = OperationalError("down")
        response = self.client.post("/auth/forgot-password", json={"email": "a@b.kz"})
        self.assertEqual(response.status_code, 503)

    # -- reset-password -------------------------------------------------------------

    def test_reset_sets_new_password_uses_up_links_and_signs_out_everywhere(self):
        self.cursor.fetchone.return_value = (11, 7)
        response = self.client.post("/auth/reset-password", json={"token": self.token, "password": "NewPass1!"})

        self.assertEqual(response.status_code, 200)
        calls = self.cursor.execute.call_args_list
        self.assertEqual(calls[0].args[1], (token_hash(self.token),))

        statements = self.sql()
        self.assertTrue(statements[1].startswith("UPDATE users SET password_hash"))
        new_hash, user_id = calls[1].args[1]
        self.assertEqual(user_id, 7)
        self.assertTrue(bcrypt.checkpw(b"NewPass1!", new_hash.encode()))
        self.assertTrue(statements[2].startswith("UPDATE password_reset_tokens"))
        self.assertEqual(calls[2].args[1], (11, 7))
        self.assertEqual(statements[3], "DELETE FROM user_sessions WHERE user_id = %s")
        self.assertEqual(calls[3].args[1], (7,))

    def test_reset_rejects_unknown_used_or_expired_links(self):
        self.cursor.fetchone.return_value = None
        response = self.client.post("/auth/reset-password", json={"token": self.token, "password": "NewPass1!"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or has expired", response.json()["detail"])
        self.assertFalse(any(s.startswith("UPDATE users") for s in self.sql()))

    def test_reset_rejects_weak_password_before_touching_the_database(self):
        response = self.client.post("/auth/reset-password", json={"token": self.token, "password": "short"})
        self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_reset_rejects_an_empty_token(self):
        response = self.client.post("/auth/reset-password", json={"token": "  ", "password": "NewPass1!"})
        self.assertEqual(response.status_code, 400)
        self.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
