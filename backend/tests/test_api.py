"""Run from backend/: python -m unittest discover -s tests -v."""

import ast
from decimal import Decimal
import os
from pathlib import Path
import re
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import bcrypt
import dns.exception
import dns.resolver
from psycopg import OperationalError
from psycopg.errors import UniqueViolation
from pydantic import ValidationError

from app.main import app
from app.catalog import get_database_catalog
from app.models import PublicTrainer


class PublicApiTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": ""})
        environment.start()
        self.addCleanup(environment.stop)
        # Sign-ups must not depend on real DNS in tests.
        domain = patch("app.auth.email_domain_exists", return_value=True)
        self.domain_exists = domain.start()
        self.addCleanup(domain.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "gym-booking-api"})

    def test_catalog_matches_frontend_public_contract(self):
        response = self.client.get("/public/catalog")
        self.assertEqual(response.status_code, 200)
        catalog = response.json()
        self.assertEqual(set(catalog), {"trainers", "halls"})
        self.assertEqual({row["trainer_id"] for row in catalog["trainers"]}, {1, 2, 3, 4})
        self.assertEqual({row["hall_id"] for row in catalog["halls"]}, {1, 2, 3})
        for trainer in catalog["trainers"]:
            self.assertEqual(set(trainer), {"trainer_id", "full_name", "specialization", "session_price_kzt"})
            self.assertGreater(trainer["session_price_kzt"], 0)
        for hall in catalog["halls"]:
            self.assertEqual(set(hall), {"hall_id", "hall_name", "capacity", "hourly_rate_kzt"})
        self.assertEqual(self.client.get("/trainers").json(), catalog["trainers"])
        self.assertEqual(self.client.get("/halls").json(), catalog["halls"])

    def test_cors_allows_local_frontend_only(self):
        for origin in ["http://localhost:5173", "http://127.0.0.1:5173"]:
            response = self.client.get("/public/catalog", headers={"Origin": origin})
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        response = self.client.get("/public/catalog", headers={"Origin": "https://example.com"})
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_catalog_is_read_only(self):
        before = self.client.get("/public/catalog").json()
        self.assertEqual(self.client.post("/trainers", json={"full_name": "Test"}).status_code, 405)
        self.assertEqual(self.client.get("/public/catalog").json(), before)

    def test_interactive_docs_and_api_schema(self):
        self.assertEqual(self.client.get("/docs").status_code, 200)
        schema = self.client.get("/openapi.json").json()
        for path in ["/health", "/trainers", "/halls", "/public/catalog"]:
            self.assertIn("get", schema["paths"][path])

    def test_sample_catalog_matches_supplied_task9_sql(self):
        sql = (Path(__file__).parents[1] / "sql" / "task09_reference.sql").read_text(encoding="utf-8")
        catalog = self.client.get("/public/catalog").json()
        for table in ["trainers", "halls"]:
            match = re.search(r"INSERT INTO " + table + r"\s*\((.*?)\) VALUES(.*?);", sql, re.S)
            self.assertIsNotNone(match)
            columns = [field.strip() for field in match[1].split(",")]
            values = re.sub(r"--[^\n]*", "", match[2]).strip().rstrip(",")
            records = ast.literal_eval("[" + values + "]")
            expected = [dict(zip(columns, row)) for row in records]
            actual = [{key: value for key, value in row.items() if key != table[:-1] + "_id"} for row in catalog[table]]
            self.assertEqual(actual, expected)

    def test_sql_money_precision_and_json_number_contract(self):
        fields = dict(trainer_id=1, full_name="Trainer", specialization="Boxing")
        trainer = PublicTrainer(**fields, session_price_kzt=Decimal("6500.25"))
        self.assertEqual(trainer.model_dump(mode="json")["session_price_kzt"], 6500.25)
        for invalid in ["0", "-1", "6500.251", "100000000.00", "NaN", "Infinity"]:
            with self.subTest(value=invalid), self.assertRaises(ValidationError):
                PublicTrainer(**fields, session_price_kzt=invalid)

    def test_database_catalog_uses_read_only_public_queries(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"}), patch("app.catalog.psycopg.connect") as connect:
            cursor = connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
            cursor.fetchall.side_effect = [
                [{"trainer_id": 9, "full_name": "Database Trainer", "specialization": "Boxing", "session_price_kzt": Decimal("7000.25")}],
                [{"hall_id": 7, "hall_name": "Database Hall", "capacity": 20, "hourly_rate_kzt": Decimal("9000.50")}],
            ]
            catalog = get_database_catalog().model_dump(mode="json")
            self.assertEqual(catalog["trainers"][0]["session_price_kzt"], 7000.25)
            self.assertEqual(catalog["halls"][0]["hourly_rate_kzt"], 9000.5)
            self.assertIn("default_transaction_read_only=on", connect.call_args.kwargs["options"])
            queries = [call.args[0] for call in cursor.execute.call_args_list]
            self.assertTrue(all(query.startswith("SELECT ") and "is_active = TRUE" in query for query in queries))

    def test_database_failure_returns_503_without_secrets_or_sample_fallback(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"}), patch(
            "app.catalog.psycopg.connect", side_effect=OperationalError("secret password should never reach the browser")
        ):
            response = self.client.get("/public/catalog")
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("secret password", response.text)
            self.assertNotIn("trainers", response.json())
            # Service liveness is deliberately independent of database readiness.
            self.assertEqual(self.client.get("/health").status_code, 200)
            self.assertEqual(self.client.get("/").json()["data_source"], "postgresql")


class TrainerRegistrationTests(unittest.TestCase):
    valid = {
        "full_name": "  New   Trainer ",
        "email": "New.Trainer@Example.kz",
        "password": "Secret12!",
        "specialization": "Boxing",
        "session_price_kzt": 7000,
    }

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        # Sign-ups must not depend on real DNS in tests.
        domain = patch("app.auth.email_domain_exists", return_value=True)
        self.domain_exists = domain.start()
        self.addCleanup(domain.stop)
        connect = patch("app.auth.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        mailer = patch("app.auth.send_verification_code")
        self.send_code = mailer.start()
        self.addCleanup(mailer.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_trainer_is_created_inactive_with_linked_login(self):
        self.cursor.fetchone.return_value = (5,)
        response = self.client.post("/auth/register/trainer", json=self.valid)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json(),
            {
                "trainer_id": 5,
                "full_name": "New Trainer",
                "email": "new.trainer@example.kz",
                "status": "verification_required",
                "email_sent": True,
            },
        )
        trainer_call, user_call, code_call = self.cursor.execute.call_args_list
        self.assertIn("email_verifications", code_call.args[0])
        self.assertIn("FALSE", user_call.args[0])
        self.send_code.assert_called_once()
        self.assertIn("FALSE", trainer_call.args[0])
        email, password_hash, trainer_id = user_call.args[1]
        self.assertEqual((email, trainer_id), ("new.trainer@example.kz", 5))
        self.assertTrue(bcrypt.checkpw(b"Secret12!", password_hash.encode()))

    def test_duplicate_email_returns_409(self):
        self.cursor.fetchone.return_value = (5,)
        self.cursor.execute.side_effect = [None, UniqueViolation()]
        response = self.client.post("/auth/register/trainer", json=self.valid)
        self.assertEqual(response.status_code, 409)

    def test_invalid_input_is_rejected_before_the_database(self):
        for field, value in [("session_price_kzt", 0), ("specialization", "    "), ("email", "not-an-email"), ("password", "short")]:
            with self.subTest(field=field):
                response = self.client.post("/auth/register/trainer", json={**self.valid, field: value})
                self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_new_passwords_need_length_capital_and_symbol(self):
        member = {
            "full_name": "New Member",
            "email": "new.member@example.kz",
            "phone": "+77011112233",
            "membership_plan": "monthly",
        }
        routes = [("/auth/register", member), ("/auth/register/trainer", self.valid)]
        for path, payload in routes:
            for password in ["Short1!", "lowercase1!", "NoSymbol123", "No Symbol 123"]:
                with self.subTest(path=path, password=password):
                    response = self.client.post(path, json={**payload, "password": password})
                    self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

        self.cursor.fetchone.return_value = (5,)
        for path, payload in routes:
            with self.subTest(path=path, password="valid"):
                response = self.client.post(path, json={**payload, "password": "Abcdef1!"})
                self.assertEqual(response.status_code, 201)

    def test_trainer_login_is_refused_only_with_the_right_password(self):
        password_hash = bcrypt.hashpw(b"secret123", bcrypt.gensalt()).decode()
        self.cursor.fetchone.return_value = (1, "t@example.kz", password_hash, "trainer", None, None, True)
        credentials = {"email": "t@example.kz", "password": "secret123"}
        self.assertEqual(self.client.post("/auth/login", json=credentials).status_code, 403)
        wrong = self.client.post("/auth/login", json={**credentials, "password": "wrong-password"})
        self.assertEqual(wrong.status_code, 401)


class ValidationFixTests(unittest.TestCase):
    member = {
        "full_name": "New Member",
        "email": "new.member@example.kz",
        "phone": "+77011112233",
        "password": "Abcdef1!",
        "membership_plan": "monthly",
    }

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        # Sign-ups must not depend on real DNS in tests.
        domain = patch("app.auth.email_domain_exists", return_value=True)
        self.domain_exists = domain.start()
        self.addCleanup(domain.stop)
        connect = patch("app.db.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_password_over_72_bytes_is_422_not_500(self):
        # 72 characters, but Cyrillic letters are 2 bytes each in UTF-8.
        password = "Пароль!" + "ж" * 65
        response = self.client.post("/auth/register", json={**self.member, "password": password})
        self.assertEqual(response.status_code, 422)
        self.assertIn("72 bytes", response.json()["detail"])
        self.connect.assert_not_called()

    def test_weak_email_formats_are_rejected(self):
        for email in ["@@@.x", "a@b..kz", "a,b@c.kz", "a@b.c", ".a@b.kz", "a@-b.kz"]:
            with self.subTest(email=email):
                response = self.client.post("/auth/register", json={**self.member, "email": email})
                self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()

    def test_missing_database_url_returns_503(self):
        with patch.dict(os.environ, {"DATABASE_URL": ""}):
            requests = [
                ("post", "/auth/register", self.member),
                ("post", "/auth/register/trainer", {**self.member, "specialization": "Yoga", "session_price_kzt": 5000}),
                ("post", "/auth/login", {"email": "a@b.kz", "password": "whatever"}),
                ("get", "/bookings", None),
                ("get", "/members", None),
                ("get", "/members/1", None),
            ]
            for method, path, body in requests:
                with self.subTest(path=path):
                    response = self.client.request(method, path, json=body)
                    self.assertEqual(response.status_code, 503)
                    self.assertIsInstance(response.json()["detail"], str)

    def test_database_failure_on_register_returns_503(self):
        self.connect.side_effect = OperationalError("connection refused")
        response = self.client.post("/auth/register", json=self.member)
        self.assertEqual(response.status_code, 503)

    def test_validation_errors_are_one_readable_string(self):
        response = self.client.post("/auth/register", json={**self.member, "full_name": "A"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Full name: string should have at least 2 characters.")

    def test_booking_request_checks_times_and_resource(self):
        base = {"member_id": 1, "booking_type": "training", "trainer_id": 2,
                "start_time": "2026-11-12T10:00:00", "end_time": "2026-11-12T11:00:00"}
        cases = [
            ({"end_time": "2026-11-12T09:00:00"}, "end time must be after"),
            ({"trainer_id": None}, "needs a trainer"),
            ({"hall_id": 3}, "needs a trainer"),
            ({"booking_type": "hall_rental"}, "needs a hall"),
        ]
        for change, message in cases:
            with self.subTest(change=change):
                response = self.client.post("/bookings", json={**base, **change})
                self.assertEqual(response.status_code, 422)
                self.assertIn(message, response.json()["detail"])
        self.connect.assert_not_called()


class EmailConfirmationTests(unittest.TestCase):
    member = {
        "full_name": "New Member",
        "email": "New.Member@Example.kz",
        "phone": "+77011112233",
        "password": "Abcdef1!",
        "membership_plan": "monthly",
    }

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        # Sign-ups must not depend on real DNS in tests.
        domain = patch("app.auth.email_domain_exists", return_value=True)
        self.domain_exists = domain.start()
        self.addCleanup(domain.stop)
        connect = patch("app.db.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        mailer = patch("app.auth.send_verification_code")
        self.send_code = mailer.start()
        self.addCleanup(mailer.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def sql_calls(self):
        return [call.args[0] for call in self.cursor.execute.call_args_list]

    def verification_row(self, code="123456", attempts=0, still_valid=True, verified=False):
        from app.auth import code_hash
        return (7, "new.member@example.kz", "member", 3, None, verified, "New Member",
                code_hash(7, code), attempts, still_valid)

    def test_register_saves_unverified_account_and_emails_a_hashed_code(self):
        self.cursor.fetchone.side_effect = [(3,), (7,)]
        response = self.client.post("/auth/register", json=self.member)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"email": "new.member@example.kz", "status": "verification_required", "email_sent": True})

        to, code, minutes = self.send_code.call_args.args
        self.assertEqual(to, "new.member@example.kz")
        self.assertRegex(code, r"^\d{6}$")
        user_sql, code_sql = self.sql_calls()[1:]
        self.assertIn("FALSE", user_sql)
        stored_hash = self.cursor.execute.call_args_list[2].args[1][1]
        from app.auth import code_hash
        self.assertEqual(stored_hash, code_hash(7, code))
        self.assertNotIn(code, str(self.cursor.execute.call_args_list[2].args[1]))

    def test_account_is_kept_when_the_email_cannot_be_sent(self):
        self.cursor.fetchone.side_effect = [(3,), (7,)]
        self.send_code.side_effect = OSError("smtp down")
        response = self.client.post("/auth/register", json=self.member)
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.json()["email_sent"])

    def test_correct_code_confirms_and_signs_in(self):
        self.cursor.fetchone.return_value = self.verification_row()
        response = self.client.post("/auth/verify-email", json={"email": "new.member@example.kz", "code": "123456"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["member_id"], 3)
        self.assertTrue(any("email_verified = TRUE" in sql for sql in self.sql_calls()))
        self.assertTrue(any("DELETE FROM email_verifications" in sql for sql in self.sql_calls()))

    def test_wrong_code_counts_an_attempt_and_is_rejected(self):
        self.cursor.fetchone.return_value = self.verification_row()
        response = self.client.post("/auth/verify-email", json={"email": "new.member@example.kz", "code": "000000"})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(any("attempts = attempts + 1" in sql for sql in self.sql_calls()))
        self.assertFalse(any("email_verified = TRUE" in sql for sql in self.sql_calls()))

    def test_expired_locked_and_malformed_codes(self):
        cases = [
            (self.verification_row(still_valid=False), "123456", 410),
            (self.verification_row(attempts=5), "123456", 429),
            (self.verification_row(verified=True), "123456", 409),
            (None, "123456", 400),
        ]
        for row, code, status in cases:
            with self.subTest(status=status):
                self.cursor.fetchone.return_value = row
                response = self.client.post("/auth/verify-email", json={"email": "new.member@example.kz", "code": code})
                self.assertEqual(response.status_code, status)
        response = self.client.post("/auth/verify-email", json={"email": "new.member@example.kz", "code": "12ab"})
        self.assertEqual(response.status_code, 422)
        self.assertIn("6-digit", response.json()["detail"])

    def test_login_is_blocked_until_the_email_is_confirmed(self):
        password_hash = bcrypt.hashpw(b"Abcdef1!", bcrypt.gensalt()).decode()
        self.cursor.fetchone.return_value = (7, "new.member@example.kz", password_hash, "member", 3, "New Member", False)
        response = self.client.post("/auth/login", json={"email": "new.member@example.kz", "password": "Abcdef1!"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.headers["X-Error-Code"], "email_not_verified")

        self.cursor.fetchone.return_value = (7, "new.member@example.kz", password_hash, "member", 3, "New Member", True)
        response = self.client.post("/auth/login", json={"email": "new.member@example.kz", "password": "Abcdef1!"})
        self.assertEqual(response.status_code, 200)

    def test_resend_code_respects_cooldown_and_hides_unknown_emails(self):
        self.cursor.fetchone.return_value = (7, False, True)  # sent less than a minute ago
        self.assertEqual(self.client.post("/auth/resend-code", json={"email": "new.member@example.kz"}).status_code, 429)

        self.cursor.fetchone.return_value = (7, False, False)
        self.assertEqual(self.client.post("/auth/resend-code", json={"email": "new.member@example.kz"}).status_code, 202)
        self.send_code.assert_called_once()

        self.send_code.reset_mock()
        self.cursor.fetchone.return_value = None
        unknown = self.client.post("/auth/resend-code", json={"email": "nobody@example.kz"})
        self.assertEqual(unknown.status_code, 202)
        self.send_code.assert_not_called()


class EmailDomainTests(unittest.TestCase):
    member = {
        "full_name": "New Member",
        "email": "someone@nosuchdomain.kz",
        "phone": "+77011112233",
        "password": "Abcdef1!",
        "membership_plan": "monthly",
    }
    trainer = {
        "full_name": "New Trainer",
        "email": "someone@nosuchdomain.kz",
        "password": "Secret12!",
        "specialization": "Boxing",
        "session_price_kzt": 7000,
    }

    def setUp(self):
        from app.email_domain import domain_accepts_mail
        domain_accepts_mail.cache_clear()
        self.addCleanup(domain_accepts_mail.cache_clear)
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        connect = patch("app.db.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        mailer = patch("app.auth.send_verification_code")
        self.send_code = mailer.start()
        self.addCleanup(mailer.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def dns(self, answers):
        """Fake DNS: answers maps a record type to a list of records or an exception class."""
        def resolve(domain, record_type):
            result = answers.get(record_type, dns.resolver.NoAnswer)
            if isinstance(result, type) and issubclass(result, Exception):
                raise result()
            return result
        resolver = patch("app.email_domain.dns.resolver.Resolver")
        resolver.start().return_value.resolve.side_effect = resolve
        self.addCleanup(resolver.stop)

    def test_unknown_domain_blocks_member_and_trainer_sign_up(self):
        self.dns({"MX": dns.resolver.NXDOMAIN})
        for path, body in (("/auth/register", self.member), ("/auth/register/trainer", self.trainer)):
            response = self.client.post(path, json=body)
            self.assertEqual(response.status_code, 422, path)
            self.assertIn("nosuchdomain.kz does not exist", response.json()["detail"])
        self.connect.assert_not_called()
        self.send_code.assert_not_called()

    def test_domain_answers(self):
        from app.email_domain import domain_accepts_mail
        mx = type("MX", (), {"exchange": "mx.mail.kz."})()
        null_mx = type("MX", (), {"exchange": "."})()
        cases = [
            ({"MX": [mx]}, True),
            ({"MX": dns.resolver.NXDOMAIN}, False),
            ({"MX": [null_mx]}, False),  # RFC 7505: accepts no mail
            ({"A": ["1.2.3.4"]}, True),  # no MX, falls back to the address
            ({}, False),  # exists but has no MX, A or AAAA
            ({"MX": dns.exception.Timeout}, None),
        ]
        for answers, expected in cases:
            domain_accepts_mail.cache_clear()
            with self.subTest(answers=answers):
                self.dns(answers)
                self.assertIs(domain_accepts_mail("mail.kz"), expected)

    def test_dns_outage_does_not_block_sign_up(self):
        self.dns({"MX": dns.resolver.NoNameservers})
        cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = [(3,), (7,)]
        response = self.client.post("/auth/register", json=self.member)
        self.assertEqual(response.status_code, 201)


if __name__ == "__main__":
    unittest.main()
