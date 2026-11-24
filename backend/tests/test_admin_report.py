"""10 key backend tests for the admin page (no real database: connect is mocked, the user is overridden).
Run from backend/:
    .venv/bin/python -m unittest tests.test_admin_report -v
"""

import os
import unittest
from unittest.mock import patch

import psycopg
from fastapi.testclient import TestClient

from app.main import app
from app.models import CurrentUserResponse
from app.security import current_user


ADMIN = CurrentUserResponse(user_id=1, full_name="Admin", email="admin@gym.kz", role="admin")
MEMBER = CurrentUserResponse(user_id=10, full_name="Member", email="member@gym.kz", role="member", member_id=3)
TRAINER = CurrentUserResponse(user_id=11, full_name="Coach", email="coach@gym.kz", role="trainer", trainer_id=7)
RECEPTION = CurrentUserResponse(user_id=2, full_name="Desk", email="desk@gym.kz", role="receptionist")

HALL_ROW = dict(hall_id=3, hall_name="Main hall", capacity=30, hourly_rate_kzt=12000, is_active=True)


class AdminReportTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)
        # Admin routes use app.admin.connect; the sign-in check uses app.security.connect. Both are fakes.
        admin_db = patch("app.admin.connect")
        self.connect = admin_db.start()
        self.addCleanup(admin_db.stop)
        security_db = patch("app.security.connect")
        self.security_connect = security_db.start()
        self.addCleanup(security_db.stop)
        self.connection = self.connect.return_value.__enter__.return_value
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.cursor.execute.return_value = self.cursor
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(app.dependency_overrides.clear)

    def sign_in(self, user):
        app.dependency_overrides[current_user] = lambda: user

    def executed(self) -> list[str]:
        return [call.args[0] for call in self.cursor.execute.call_args_list]

    def audit_rows(self) -> list[tuple]:
        return [call.args[1] for call in self.cursor.execute.call_args_list if "INSERT INTO audit_log" in call.args[0]]

    # 1. Без входа: гость не может создать зал (ловит: защита require_roles снята с изменяющего маршрута).
    def test_01_signed_out_cannot_create_hall(self):
        response = self.client.post("/admin/halls", json={"hall_name": "Hall X", "capacity": 10, "hourly_rate_kzt": 5000})
        self.assertEqual(response.status_code, 401)
        self.connect.assert_not_called()

    # 2. Участник не видит статистику админа (ловит: роль member случайно добавлена в require_roles).
    def test_02_member_gets_403_on_overview(self):
        self.sign_in(MEMBER)
        for path in ["/admin/overview", "/admin/payments", "/admin/bookings"]:
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.connect.assert_not_called()

    # 3. Тренер не может сам поменять себе цену/статус (ловит: тренера пустили в PATCH /admin/trainers).
    def test_03_trainer_cannot_edit_trainer_profile(self):
        self.sign_in(TRAINER)
        response = self.client.patch(f"/admin/trainers/{TRAINER.trainer_id}", json={"session_price_kzt": 99999})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/admin/overview").status_code, 403)
        self.connect.assert_not_called()

    # 4. Ресепшен не управляет бронями/залами/отчётами админа (ловит: receptionist добавлен в Admin-зависимость).
    def test_04_receptionist_gets_403_on_admin_actions(self):
        self.sign_in(RECEPTION)
        self.assertEqual(self.client.get("/admin/overview").status_code, 403)
        self.assertEqual(self.client.get("/admin/reports/trainers?from=2026-11-01&to=2026-11-30").status_code, 403)
        self.assertEqual(self.client.post("/admin/bookings/5/status", json={"status": "cancelled"}).status_code, 403)
        self.assertEqual(self.client.delete("/admin/halls/3").status_code, 403)
        self.connect.assert_not_called()

    # 5. Админ получает обзор в правильном формате (ловит: сломанный SQL/расчёт или смену формата для фронта).
    def test_05_admin_overview_format(self):
        self.sign_in(ADMIN)
        self.cursor.fetchone.side_effect = [
            {"bookings_week": 12, "confirmed_week": 8, "pending_week": 2},
            {"revenue": 150000},
            {"held": 10, "no_shows": 2},
        ]
        self.cursor.fetchall.side_effect = [
            [{"day": 2, "n": 5}, {"day": 5, "n": 3}],  # Wed is busiest
            [{"hour": 18, "n": 6}, {"hour": 9, "n": 1}],  # 18:00 is busiest
        ]
        response = self.client.get("/admin/overview")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["bookings_week"], 12)
        self.assertEqual(body["revenue_30d"], 150000.0)
        self.assertAlmostEqual(body["no_show_rate"], 0.2)
        self.assertEqual(body["busiest_day"], "Wed")
        self.assertEqual(body["busiest_hour"], "18:00")
        self.assertEqual([d["day"] for d in body["by_weekday"]], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        self.assertEqual(len(body["by_hour"]), 15)  # 07:00 .. 21:00, opening hours
        self.assertEqual(body["by_hour"][0], {"hour": 7, "label": "07:00", "count": 0})

    # 6. Неверные данные зала → 422 и в базу ничего не пишется (ловит: снятую валидацию — зал на 0 мест, цена < 0, без имени).
    def test_06_invalid_hall_data_rejected(self):
        self.sign_in(ADMIN)
        cases = {
            "capacity 0": {"hall_name": "Hall X", "capacity": 0, "hourly_rate_kzt": 5000},
            "negative price": {"hall_name": "Hall X", "capacity": 10, "hourly_rate_kzt": -100},
            "empty name": {"hall_name": "", "capacity": 10, "hourly_rate_kzt": 5000},
            "name of spaces only": {"hall_name": "   ", "capacity": 10, "hourly_rate_kzt": 5000},
        }
        # If bad data slips through to the (fake) database, report a failed check, not a crash in the mock.
        client = TestClient(app, raise_server_exceptions=False)
        self.addCleanup(client.close)
        for label, payload in cases.items():
            with self.subTest(label):
                self.connect.reset_mock()
                response = client.post("/admin/halls", json=payload)
                self.assertEqual(response.status_code, 422, label)
                self.connect.assert_not_called()

    # 7. Изменение зала пишется в аудит: кто, что, над каким объектом (ловит: удалённый/забытый вызов audit()).
    def test_07_hall_update_is_audited(self):
        self.sign_in(ADMIN)
        self.cursor.fetchone.return_value = {**HALL_ROW, "capacity": 40}
        response = self.client.patch("/admin/halls/3", json={"capacity": 40})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["capacity"], 40)
        rows = self.audit_rows()
        self.assertEqual(len(rows), 1)
        actor_id, actor_email, actor_role, action, target_type, target_id, details = rows[0]
        self.assertEqual((actor_id, actor_email, actor_role), (1, "admin@gym.kz", "admin"))
        self.assertEqual((action, target_type, target_id), ("hall.updated", "hall", 3))
        self.assertEqual(details.obj["changes"], {"capacity": 40})

    # 8. Падение базы → 503 с понятным текстом, а не 500 (ловит: убранный except psycopg.Error).
    def test_08_database_error_returns_503(self):
        self.sign_in(ADMIN)
        self.connect.side_effect = psycopg.OperationalError("connection refused")
        for method, path, payload in [
            ("get", "/admin/overview", None),
            ("post", "/admin/halls", {"hall_name": "Hall X", "capacity": 10, "hourly_rate_kzt": 5000}),
        ]:
            with self.subTest(path), self.assertLogs("app.admin", level="ERROR"):  # and the cause is logged
                response = getattr(self.client, method)(path, **({"json": payload} if payload else {}))
                self.assertEqual(response.status_code, 503)
                self.assertIn("temporarily unavailable", response.json()["detail"])

    # 9. Несуществующий объект → 404, аудит не пишется (ловит: «успешное» изменение пустоты и ложную запись в журнал).
    def test_09_unknown_objects_return_404(self):
        self.sign_in(ADMIN)
        self.cursor.fetchone.return_value = None
        cases = [
            ("patch", "/admin/halls/999", {"capacity": 20}, "Hall not found."),
            ("post", "/admin/members/999/extend", {"months": 1}, "Member not found."),
            ("post", "/admin/bookings/999/status", {"status": "cancelled"}, "Booking not found."),
        ]
        for method, path, payload, detail in cases:
            with self.subTest(path):
                response = getattr(self.client, method)(path, json=payload)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()["detail"], detail)
        self.assertEqual(self.audit_rows(), [])

    # 10. Зал с бронями нельзя удалить, только деактивировать (ловит: потерю истории броней и сломанные отчёты).
    def test_10_hall_with_bookings_cannot_be_deleted(self):
        self.sign_in(ADMIN)
        self.cursor.fetchone.side_effect = [{"hall_name": "Main hall"}, {"n": 4}]
        response = self.client.delete("/admin/halls/3")
        self.assertEqual(response.status_code, 409)
        self.assertIn("only be deactivated", response.json()["detail"])
        self.assertFalse(any(q.startswith("DELETE") for q in self.executed()))
        self.assertEqual(self.audit_rows(), [])


if __name__ == "__main__":
    unittest.main()
