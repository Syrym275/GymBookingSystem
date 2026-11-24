"""10 basic backend tests
Run from backend/:
    .venv/bin/python -m unittest tests.test_report_basic -v
"""

import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import bcrypt
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.auth import check_new_password, hash_password, normalize_phone
from app.models import BookingCreateRequest


class BackendBasicTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    # 1. Сервер не стартует после изменений (ошибка импорта, настройки)
    def test_01_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    # 2.Данные пользователя доступны без входа
    def test_02_me_requires_login(self):
        response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 401)

    # 3. Гость может создать бронь 
    def test_03_booking_requires_login(self):
        start = datetime.now() + timedelta(days=1)
        response = self.client.post(
            "/bookings",
            json={
                "member_id": 1,
                "booking_type": "training",
                "trainer_id": 1,
                "start_time": start.isoformat(),
                "end_time": (start + timedelta(hours=1)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, 401)

    # 4. В базу попадает несуществующий тариф
    def test_04_register_rejects_unknown_plan(self):
        response = self.client.post(
            "/auth/register",
            json={
                "full_name": "Test Member",
                "email": "test.member@gmail.com",
                "phone": "+77001234567",
                "password": "Secret12!",
                "membership_plan": "weekly",
            },
        )
        self.assertEqual(response.status_code, 422)

    # 5. Сервер падает с 500 при недоступной базе
    def test_05_login_without_database_returns_503(self):
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        with patch.dict(os.environ, env, clear=True):
            response = self.client.post(
                "/auth/login",
                json={"email": "someone@gmail.com", "password": "Secret12!"},
            )
        self.assertEqual(response.status_code, 503)

    # 6. Один номер сохраняется вразных форматах, проверкадублей не работает
    def test_06_phone_normalization(self):
        self.assertEqual(normalize_phone("8 700 255 85 47"), "+77002558547")
        self.assertEqual(normalize_phone("+7 (700) 255-85-47"), "+77002558547")
        self.assertIsNone(normalize_phone("12345"))

    # 7. Слабые пароли попадают в базу 
    def test_07_weak_password_rejected(self):
        with self.assertRaises(HTTPException) as error:
            check_new_password("password1")
        self.assertEqual(error.exception.status_code, 422)

    # 8. Правило стало слишком строгим, никто не может зарегистрироваться
    def test_08_strong_password_accepted(self):
        check_new_password("Secret12!")  # must not raise

    # 9. Пароль хранится открытым текстом или вход ломается
    def test_09_password_is_hashed(self):
        hashed = hash_password("Secret12!")
        self.assertNotEqual(hashed, "Secret12!")
        self.assertTrue(bcrypt.checkpw(b"Secret12!", hashed.encode()))
        self.assertFalse(bcrypt.checkpw(b"Wrong12!", hashed.encode()))

    # 10. Бронь с отрицательной длительностью или без тренера
    def test_10_booking_times_and_resource_validated(self):
        start = datetime(2030, 1, 10, 10, 0)
        with self.assertRaises(ValidationError):
            BookingCreateRequest(
                member_id=1, booking_type="training", trainer_id=1,
                start_time=start, end_time=start - timedelta(hours=1),
            )
        with self.assertRaises(ValidationError):
            BookingCreateRequest(
                member_id=1, booking_type="training", hall_id=1,
                start_time=start, end_time=start + timedelta(hours=1),
            )


if __name__ == "__main__":
    unittest.main()
