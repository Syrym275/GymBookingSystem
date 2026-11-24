"""The pooled connect() helper. Run from backend/: python -m unittest tests.test_db_pool -v"""

import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from psycopg.rows import dict_row, tuple_row

from app import db


class PooledConnectTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"DATABASE_URL": "postgresql://test"})
        environment.start()
        self.addCleanup(environment.stop)

    def test_missing_database_url_is_503_without_touching_a_pool(self):
        with patch.dict(os.environ, {"DATABASE_URL": "  "}), patch("app.db._pool") as pool:
            with self.assertRaises(HTTPException) as error, db.connect():
                pass
        self.assertEqual(error.exception.status_code, 503)
        pool.assert_not_called()

    def test_row_factory_is_set_for_the_block_and_reset_for_the_next_borrower(self):
        connection = MagicMock()
        with patch("app.db._checkout") as checkout:
            checkout.return_value.__enter__.return_value = connection
            with db.connect(row_factory=dict_row) as borrowed:
                self.assertIs(borrowed, connection)
                self.assertIs(connection.row_factory, dict_row)
        self.assertIs(connection.row_factory, tuple_row)
        checkout.assert_called_once_with("postgresql://test", False)

    def test_row_factory_is_reset_even_when_the_block_raises(self):
        connection = MagicMock()
        with patch("app.db._checkout") as checkout:
            checkout.return_value.__enter__.return_value = connection
            with self.assertRaises(RuntimeError), db.connect(row_factory=dict_row):
                raise RuntimeError("boom")
        self.assertIs(connection.row_factory, tuple_row)
        # The pool's own context manager sees the error, so it rolls back instead of committing.
        exc_type = checkout.return_value.__exit__.call_args.args[0]
        self.assertIs(exc_type, RuntimeError)

    def test_one_pool_per_url_and_mode_with_read_only_options(self):
        with patch("app.db.ConnectionPool", side_effect=lambda *a, **k: MagicMock()) as pool_class, \
                patch.dict(db._pools, clear=True):
            main = db._pool("postgresql://test", False)
            self.assertIs(db._pool("postgresql://test", False), main)
            read_only = db._pool("postgresql://test", True)
        self.assertEqual(pool_class.call_count, 2)
        main_kwargs = pool_class.call_args_list[0].kwargs["kwargs"]
        read_only_kwargs = pool_class.call_args_list[1].kwargs["kwargs"]
        self.assertNotIn("options", main_kwargs)
        self.assertIn("default_transaction_read_only=on", read_only_kwargs["options"])
        self.assertIn("statement_timeout=3000", read_only_kwargs["options"])
        self.assertEqual(main_kwargs["connect_timeout"], 10)
        self.assertIsNot(read_only, main)


if __name__ == "__main__":
    unittest.main()
