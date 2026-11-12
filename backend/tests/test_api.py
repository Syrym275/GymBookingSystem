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
        # Sign-up emails are not really sent in tests.
        mailer = patch("app.auth.send_verification_email", return_value=True)
        self.send_email = mailer.start()
        self.addCleanup(mailer.stop)
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
        # Sign-up emails are not really sent in tests.
        mailer = patch("app.auth.send_verification_email", return_value=True)
        self.send_email = mailer.start()
        self.addCleanup(mailer.stop)
        connect = patch("app.auth.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_trainer_is_created_inactive_with_linked_login(self):
        self.cursor.fetchone.return_value = (5,)
        response = self.client.post("/auth/register/trainer", json=self.valid)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json(),
            {"trainer_id": 5, "full_name": "New Trainer", "email": "new.trainer@example.kz", "status": "pending_approval", "verification_email_sent": True},
        )
        trainer_call, user_call = self.cursor.execute.call_args_list[:2]
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

    def test_trainer_login_returns_linked_trainer_id(self):
        password_hash = bcrypt.hashpw(b"secret123", bcrypt.gensalt()).decode()
        self.cursor.fetchone.return_value = (1, "t@example.kz", password_hash, "trainer", None, 8, "Trainer Name", "Yoga", Decimal("5000"), True, True)
        credentials = {"email": "t@example.kz", "password": "secret123"}
        response = self.client.post("/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["trainer_id"], 8)
        self.assertEqual(response.json()["full_name"], "Trainer Name")
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
        # Sign-up emails are not really sent in tests.
        mailer = patch("app.auth.send_verification_email", return_value=True)
        self.send_email = mailer.start()
        self.addCleanup(mailer.stop)
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


class BookingWriteTests(unittest.TestCase):
    booking = {
        "member_id": 18,
        "booking_type": "training",
        "trainer_id": 5,
        "start_time": "2026-11-12T17:00:00",
        "end_time": "2026-11-12T18:00:00",
    }

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        # Sign-ups must not depend on real DNS in tests.
        domain = patch("app.auth.email_domain_exists", return_value=True)
        self.domain_exists = domain.start()
        self.addCleanup(domain.stop)
        # Sign-up emails are not really sent in tests.
        mailer = patch("app.auth.send_verification_email", return_value=True)
        self.send_email = mailer.start()
        self.addCleanup(mailer.stop)
        # The email-verification guard is tested in EmailVerificationTests.
        guard = patch("app.verification.ensure_email_verified")
        guard.start()
        self.addCleanup(guard.stop)
        connect = patch("app.bookings.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_past_time_booking_is_rejected_before_insert(self):
        self.cursor.fetchone.return_value = {"starts_in_past": True}
        response = self.client.post("/bookings", json=self.booking)
        self.assertEqual(response.status_code, 409)
        self.assertIn("future", response.json()["detail"])
        self.assertEqual(self.cursor.execute.call_count, 1)

    def test_existing_completed_overlap_is_rejected(self):
        self.cursor.fetchone.side_effect = [
            {"starts_in_past": False},
            {"session_price_kzt": Decimal("7000")},
            {"trainer_busy": True},
        ]
        response = self.client.post("/bookings", json=self.booking)
        self.assertEqual(response.status_code, 409)
        self.assertIn("already booked", response.json()["detail"])
        executed_sql = [call.args[0] for call in self.cursor.execute.call_args_list]
        self.assertFalse(any("INSERT INTO bookings" in query for query in executed_sql))

    def test_early_attendance_is_rejected(self):
        self.cursor.fetchone.side_effect = [None, {"trainer_id": 5, "status": "confirmed", "start_time": None}]
        response = self.client.post("/bookings/41/attendance?status=completed&trainer_id=5")
        self.assertEqual(response.status_code, 409)
        self.assertIn("sessions that have ended", response.json()["detail"])
        update_sql = self.cursor.execute.call_args_list[0].args[0]
        self.assertIn("end_time <= LOCALTIMESTAMP", update_sql)



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



class EmailVerificationTests(unittest.TestCase):
    member = {
        "full_name": "New Member",
        "email": "  New.Member@Example.KZ ",
        "phone": "+77011112233",
        "password": "Abcdef1!",
        "membership_plan": "monthly",
    }
    booking = {
        "member_id": 3,
        "booking_type": "training",
        "trainer_id": 5,
        "start_time": "2030-01-10T17:00:00",
        "end_time": "2030-01-10T18:00:00",
    }
    token = "x" * 43

    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test", "APP_URL": "https://gym.example.kz/"})
        environment.start()
        self.addCleanup(environment.stop)
        domain = patch("app.auth.email_domain_exists", return_value=True)
        domain.start()
        self.addCleanup(domain.stop)
        connect = patch("app.db.psycopg.connect")
        self.connect = connect.start()
        self.addCleanup(connect.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        sender = patch("app.verification.send_email")
        self.send_email = sender.start()
        self.addCleanup(sender.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def sql(self):
        return [" ".join(call.args[0].split()) for call in self.cursor.execute.call_args_list]

    def verify(self, row, token=None):
        self.cursor.fetchone.return_value = row
        return self.client.post("/auth/verify-email", json={"token": token or self.token})

    # -- sign-up --------------------------------------------------------------------

    def test_sign_up_saves_unverified_user_and_emails_a_hashed_single_use_link(self):
        from app.verification import token_hash
        self.cursor.fetchone.side_effect = [(3,), (7,)]
        response = self.client.post("/auth/register", json=self.member)

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["email"], "new.member@example.kz")  # trimmed and lowercased
        self.assertIs(body["email_verified"], False)
        self.assertIs(body["verification_email_sent"], True)

        message = self.send_email.call_args.args[0]
        self.assertEqual(message.to, "new.member@example.kz")
        link = re.search(r"https://gym\.example\.kz/verify-email\?token=([A-Za-z0-9_-]+)", message.text)
        self.assertIsNotNone(link, message.text)
        token = link.group(1)
        self.assertGreaterEqual(len(token), 43)  # 32 random bytes, URL-safe base64
        self.assertIn(token, message.html)

        insert = next(c for c in self.cursor.execute.call_args_list if "INSERT INTO email_verification_tokens" in c.args[0])
        user_id, stored_hash, hours = insert.args[1]
        self.assertEqual((user_id, stored_hash, hours), (7, token_hash(token), 24))
        self.assertNotIn(token, str(self.cursor.execute.call_args_list))  # raw token never stored

    def test_account_is_kept_when_the_email_cannot_be_sent(self):
        self.cursor.fetchone.side_effect = [(3,), (7,)]
        self.send_email.side_effect = OSError("smtp down")
        with self.assertLogs("app.verification", "ERROR"):
            response = self.client.post("/auth/register", json=self.member)
        self.assertEqual(response.status_code, 201)
        self.assertIs(response.json()["verification_email_sent"], False)

    def test_unverified_user_can_still_log_in(self):
        password_hash = bcrypt.hashpw(b"Abcdef1!", bcrypt.gensalt()).decode()
        self.cursor.fetchone.return_value = (7, "a@b.kz", password_hash, "member", 3, None, "A B", None, None, None, False)
        response = self.client.post("/auth/login", json={"email": "a@b.kz", "password": "Abcdef1!"})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["email_verified"], False)

    # -- verify ---------------------------------------------------------------------

    def test_successful_verification_marks_user_and_token_in_one_transaction(self):
        from app.verification import token_hash
        response = self.verify((11, 7, False, True, False, "a@b.kz"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "verified", "email": "a@b.kz", "already_verified": False})
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], (token_hash(self.token),))
        sql = self.sql()
        self.assertIn("UPDATE users SET email_verified = TRUE, email_verified_at = CURRENT_TIMESTAMP WHERE user_id = %s", sql)
        self.assertIn("UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_id = %s", sql)
        self.assertEqual(self.connect.call_count, 1)  # one connection, one transaction

    def test_expired_token_is_rejected(self):
        response = self.verify((11, 7, False, False, False, "a@b.kz"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or has expired", response.json()["detail"])
        self.assertFalse(any(q.startswith("UPDATE") for q in self.sql()))

    def test_reused_token(self):
        # Already used and the user is verified: idempotent success.
        response = self.verify((11, 7, True, True, True, "a@b.kz"))
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json()["already_verified"], True)
        self.assertFalse(any(q.startswith("UPDATE") for q in self.sql()))
        # Used but the user is somehow still unverified: generic error.
        response = self.verify((11, 7, True, True, False, "a@b.kz"))
        self.assertEqual(response.status_code, 400)

    def test_invalid_token_is_rejected_with_the_same_message(self):
        unknown = self.verify(None)
        self.assertEqual(unknown.status_code, 400)
        blank = self.client.post("/auth/verify-email", json={"token": "   "})
        self.assertEqual(blank.status_code, 400)
        self.assertEqual(unknown.json(), blank.json())

    # -- resend ---------------------------------------------------------------------

    def test_resend_invalidates_old_tokens_before_issuing_a_new_one(self):
        self.cursor.fetchone.side_effect = [(7, False), (0,)]
        response = self.client.post("/auth/resend-verification", json={"email": " A@B.kz "})
        self.assertEqual(response.status_code, 202)
        sql = self.sql()
        expire = next(i for i, q in enumerate(sql) if q.startswith("UPDATE email_verification_tokens SET expires_at = CURRENT_TIMESTAMP"))
        insert = next(i for i, q in enumerate(sql) if q.startswith("INSERT INTO email_verification_tokens"))
        self.assertLess(expire, insert)
        self.assertIn("used_at IS NULL", sql[expire])
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], ("a@b.kz",))
        self.assertEqual(self.send_email.call_args.args[0].to, "a@b.kz")

    def test_resend_is_limited_to_three_per_hour(self):
        self.cursor.fetchone.side_effect = [(7, False), (3,)]
        response = self.client.post("/auth/resend-verification", json={"email": "a@b.kz"})
        self.assertEqual(response.status_code, 202)
        self.assertFalse(any(q.startswith("INSERT INTO email_verification_tokens") for q in self.sql()))
        self.send_email.assert_not_called()

    def test_resend_answers_the_same_for_unknown_verified_and_limited_accounts(self):
        answers = []
        for rows in ([None], [(7, True)], [(7, False), (3,)], [(7, False), (0,)]):
            self.cursor.fetchone.side_effect = rows
            response = self.client.post("/auth/resend-verification", json={"email": "a@b.kz"})
            answers.append((response.status_code, response.json()))
        self.assertEqual(len(set(map(str, answers))), 1, answers)
        self.assertEqual(self.send_email.call_count, 1)  # only the last one really sends

    # -- guard ----------------------------------------------------------------------

    def test_guard_blocks_unverified_member_from_booking_and_paying(self):
        with patch("app.bookings.connect") as booking_db, patch("app.payments.connect") as payment_db:
            self.cursor.fetchone.return_value = (False,)
            booked = self.client.post("/bookings", json=self.booking)
            paid = self.client.post("/bookings/41/payment", json={"method": "card"})
        for response in (booked, paid):
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.headers["X-Error-Code"], "email_not_verified")
            self.assertIn("verify your email", response.json()["detail"])
        booking_db.assert_not_called()
        payment_db.assert_not_called()
        self.assertEqual(self.cursor.execute.call_args_list[0].args[1], (3,))
        self.assertEqual(self.cursor.execute.call_args_list[1].args[1], (41,))

    def test_guard_lets_verified_members_and_desk_members_through(self):
        for row in ((True,), None):  # verified login, or a member with no login at all
            with self.subTest(row=row), patch("app.bookings.connect") as booking_db:
                booking_db.side_effect = OperationalError("stop after the guard")
                self.cursor.fetchone.return_value = row
                response = self.client.post("/bookings", json=self.booking)
                self.assertNotEqual(response.status_code, 403)
                booking_db.assert_called_once()

    def test_issue_token_is_random_and_url_safe(self):
        from app.verification import issue_token
        tokens = {issue_token(self.cursor, 7) for _ in range(20)}
        self.assertEqual(len(tokens), 20)
        self.assertTrue(all(re.fullmatch(r"[A-Za-z0-9_-]{43}", t) for t in tokens))

if __name__ == "__main__":
    unittest.main()
