"""Payment history reads: no live database or payment writes required."""

from decimal import Decimal
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from psycopg import OperationalError

from app.main import app


class PaymentHistoryTests(unittest.TestCase):
    def setUp(self):
        connection = patch("app.payments.connect")
        self.connect = connection.start()
        self.addCleanup(connection.stop)
        self.cursor = self.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_history_returns_database_attempts_and_uses_stable_order(self):
        self.cursor.fetchone.return_value = {"booking_id": 60}
        self.cursor.fetchall.return_value = [{
            "payment_id": 42, "booking_id": 60, "amount_kzt": Decimal("7000.50"),
            "method": "card", "payment_status": "approved",
            "provider_txn_ref": "TEST-42", "created_at": "2026-11-13T10:00:00",
        }]
        response = self.client.get("/bookings/60/payments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["amount_kzt"], 7000.5)
        self.assertEqual(response.json()[0]["provider_txn_ref"], "TEST-42")
        calls = self.cursor.execute.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(call.args[1] == (60,) for call in calls))
        self.assertIn("ORDER BY created_at DESC, payment_id DESC", calls[1].args[0])
        self.assertTrue(all(call.args[0].strip().startswith("SELECT") for call in calls))

    def test_existing_booking_without_payments_returns_empty_list(self):
        self.cursor.fetchone.return_value = {"booking_id": 60}
        self.cursor.fetchall.return_value = []
        response = self.client.get("/bookings/60/payments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_missing_booking_returns_404_without_reading_payments(self):
        self.cursor.fetchone.return_value = None
        response = self.client.get("/bookings/999/payments")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Booking not found.")
        self.cursor.fetchall.assert_not_called()

    def test_database_error_returns_503_without_connection_details(self):
        self.connect.side_effect = OperationalError("private connection details")
        with self.assertLogs("app.payments", level="ERROR"):
            response = self.client.get("/bookings/60/payments")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Payment history service unavailable.")
        self.assertNotIn("private", response.text)

    def test_invalid_booking_id_is_rejected_before_database_access(self):
        response = self.client.get("/bookings/not-an-id/payments")
        self.assertEqual(response.status_code, 422)
        self.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
