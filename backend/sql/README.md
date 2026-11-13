# Task 9 SQL compatibility

> Historical milestone notes below. The current catalogue and trainer-profile routes
> require `DATABASE_URL`; there is no sample-data mode. `/` reports `unconfigured`
> when it is missing, and database-backed catalogue/profile requests return 503.
> Follow the root README for current setup. Do not rerun the Task 9 reset script
> to enable the trainer-profile endpoint; it uses the existing `trainers` table.

`task09_reference.sql` is an unchanged copy of the supplied Week 9 script. It is
not executed by the app. It drops and recreates tables and contains server-wide
role creation, report queries, and a rolled-back payment demonstration. Only run
it deliberately against a dedicated empty test database after agreeing with the team.

The Week 10 public catalogue uses these existing tables and columns:

| Table | Public response columns | Selection |
| --- | --- | --- |
| trainers | trainer_id, full_name, specialization, session_price_kzt | is_active = TRUE |
| halls | hall_id, hall_name, capacity, hourly_rate_kzt | is_active = TRUE |

Prices use Decimal with the SQL NUMERIC(10,2) bounds and serialize as JSON numbers
to match React. Capacity is limited to 1-200. Name lengths follow the SQL columns.
The sample data matches the SQL's four active trainers and three active halls,
including Zhanna's specialization, Yoga and stretching. Inactive frontend sample
records remain useful fixtures for testing filtering, and are not exposed.

## Optional read-only PostgreSQL mode

Start with an existing test database that contains the Task 9 tables in `public`.
The API never creates them. In the backend PowerShell terminal:

```powershell
$env:DATABASE_URL = "postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/gym_booking"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Use a dedicated database login with schema USAGE and SELECT on trainers and halls.
Do not commit credentials. URL-encode reserved characters in a password. `.env`
files are not automatically loaded; this command sets a process environment variable.
The API opens a read-only session, queries active catalogue rows, and closes it.
`GET /` shows the configured `data_source` (`sample` or `postgresql`), not database
readiness. `GET /health` checks only API liveness. A database failure returns 503
for the catalogue rather than substituting sample records or exposing credentials.

Return to sample mode by stopping the server, running the following command, and
starting the server again:

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

The adapter is covered by mocked connection tests. A live PostgreSQL server was
not available during implementation, so real database integration remains to be
demonstrated with the team.

## Later work before migrating signed-in features

- The SQL has five business tables, but no login/password/session table. Design
  those before replacing mock login; do not treat members.email as authentication.
- SQL sample members differ from frontend demo login data. Agree one seed dataset
  when connecting those features; public catalogue integration does not change login.
- Trainer view v_trainer_schedule hides contact details but does not filter by the
  current trainer. Server ownership checks are still required.
- Booking trigger checks INSERT only; membership and pending-count validation must
  also cover relevant UPDATE transitions when implemented.
- Payment function does not compare amount with booking price. Agree full payment
  versus deposit before implementing payment confirmation.
- Automatic expiry and active-resource booking checks are later tasks.
- Hall size in square metres is a frontend illustration, not a SQL column. The
  connected landing page shows database-supported capacity and hourly prices.

This milestone exposes no member, booking, or payment data and implements no writes.
