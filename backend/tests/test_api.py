"""Run from backend/: python -m unittest discover -s tests -v."""

import ast
from decimal import Decimal
import os
from pathlib import Path
import re
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from psycopg import OperationalError
from pydantic import ValidationError

from app.main import app
from app.catalog import get_database_catalog
from app.models import PublicTrainer


class PublicApiTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": ""})
        environment.start()
        self.addCleanup(environment.stop)
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


if __name__ == "__main__":
    unittest.main()
