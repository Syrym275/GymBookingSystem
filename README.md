# Gym Booking System

Members book a **60-minute personal training session** or **rent a hall/studio**, pay, and get a confirmation. One trainer or hall is never booked twice for the same time.

| Part | Stack | Runs at |
| --- | --- | --- |
| `frontend/` | React, TypeScript, Vite | http://localhost:5173 |
| `backend/` | FastAPI, Python | http://127.0.0.1:8000 (API docs at `/docs`) |
| `backend/sql/` | PostgreSQL scripts | `localhost:5432`, database `gym_booking` |
| `docs/` | Project description | |

The frontend calls `/api/...`, and the Vite dev server forwards those requests to the backend.

`backend/README.md` and `frontend/README.md` were written before PostgreSQL login was added. Where they disagree with this file, follow this file.

## Requirements

- **Node.js 18+**
- **Python 3.12+**
- **PostgreSQL 13+**

The commands below are for **Windows PowerShell**, starting in the repository root. For macOS or Linux, see [the differences](#macos-and-linux).

## First-time setup

Setup takes four steps and two terminals that stay open.

### 1. Create the database

Run this once. Change `18` to your PostgreSQL version and fill in the password of your `postgres` user.

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$env:PGPASSWORD = "YOUR_POSTGRES_PASSWORD"

& $psql -U postgres -c "CREATE DATABASE gym_booking;"

foreach ($file in "task09_reference", "auth_schema", "booking_hold") {
  & $psql -U postgres -d gym_booking -v ON_ERROR_STOP=1 -q -o NUL -f "backend/sql/$file.sql"
}
```

The scripts must run in this order. `does not exist, skipping` notices from the first script are normal.

> `task09_reference.sql` drops and recreates its tables, so only run it against this dedicated database. It also creates the server-wide roles `gym_app`, `gym_reception` and `gym_trainer`.

With pgAdmin instead: create a database named `gym_booking`, then open each of the three files in the Query Tool and execute them in the same order.

### 2. Start the backend (terminal 1)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

$env:DATABASE_URL = "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/gym_booking"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Wait for `Application startup complete`, then open http://127.0.0.1:8000/. The response must contain `"data_source":"postgresql"`. If it says `sample`, `DATABASE_URL` is not set in that terminal.

`DATABASE_URL` lasts only as long as the terminal, and `.env` files are not loaded by the backend. If the password contains characters such as `@`, `:` or `/`, URL-encode them.

### 3. Start the frontend (terminal 2)

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5173.

### 4. Create an account

Go to http://localhost:5173/register and sign up with a Kazakhstan phone number (for example `+77011234567`) and a password of at least 8 characters with 1 capital letter and 1 symbol (for example `Secret12!`).

You then land on **Confirm your email**. The backend emails a 6-digit code, and the account cannot log in until the code is entered:

- **No mail settings (default):** nothing is sent. The code is printed in the backend terminal, like `[email] SMTP_HOST not set. To: you@example.kz | Confirmation code: 528359`.
- **Real emails:** set the `SMTP_*` variables under [Configuration](#configuration) before starting the backend.

A code works for 15 minutes and allows 5 wrong tries. **Send a new code** works once a minute. If someone tries to log in before confirming, the login page links to the confirmation page.

Before saving the account, the backend asks DNS whether the email's domain can receive mail. A made-up domain such as `user@nosuchsite.kz` is refused right away with "The email domain ... does not exist". This cannot tell whether the mailbox itself exists; the code does that. If DNS does not answer (no internet, router problems), the sign-up is allowed.

**The demo accounts and one-click demo buttons on the login page do not work.** Login now checks the PostgreSQL `users` table, which starts empty.

### Trainer registration

Choose **Trainer** on the sign-up page. Trainers confirm their email with a code too. The trainer is saved as inactive and stays off the public list until approved, and trainers cannot sign in yet. There is no admin screen, so approve a trainer in the database:

```powershell
& $psql -U postgres -d gym_booking -c "UPDATE trainers SET is_active = TRUE WHERE trainer_id = 5;"
```

If your database was created before trainer registration or email confirmation was added, apply the schema update once. It keeps your existing data, and accounts that already exist are marked as confirmed so they can still log in:

```powershell
& $psql -U postgres -d gym_booking -v ON_ERROR_STOP=1 -f backend/sql/auth_schema.sql
```

## Running it again

Terminal 1:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/gym_booking"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm.cmd run dev
```

Stop either server with **Ctrl+C**.

## What is connected to the backend

| Feature | Data source |
| --- | --- |
| Landing page trainers and halls | Backend |
| Member registration and login, trainer registration | Backend, PostgreSQL |
| Create, list, view, cancel and pay for member bookings, 15-minute payment hold | Backend, PostgreSQL |
| Trainer and hall pickers, taken-slot display, member dashboard, profile | Browser mock data |
| Reception pages | Browser mock data |

### Known limitations

- **No way to create staff accounts.** A receptionist needs a `users` row inserted by hand with a bcrypt `password_hash` and `email_verified = TRUE`. Their display name comes from the email address. Trainer logins are refused with a message until a trainer area exists.
- **Approved trainers appear only on the landing page.** The booking page's trainer picker still reads mock data, so members cannot pick them yet.
- **Dashboard and Profile do not show real member data.** They look up the signed-in member in the browser mock data by ID. Real IDs start at 9, so members 9 to 11 see a different mock person, and from 12 onward the pages show `Member not found`. **Book a trainer**, **Rent a hall** and **My bookings** still work from the sidebar.
- **Taken slots can look free.** The slot picker reads mock data. The backend still rejects a real conflict with `This slot was just taken`.
- **Local development only.** The API issues no session or token and does not check who is calling.

### Running without PostgreSQL

If `DATABASE_URL` is not set, the backend serves built-in sample trainers and halls, so the landing page works. Registration, login, bookings and payments return a 503 error that says the database is not configured.

## Tests and build

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

```powershell
cd frontend
npm.cmd run build
```

The backend tests use sample data and mocked connections, so they do not need PostgreSQL.

## Resetting the database

Do not re-run only `task09_reference.sql`, because that leaves old accounts in `users` and removes the payment hold column. Drop the database and repeat [step 1](#1-create-the-database):

```powershell
& $psql -U postgres -c "DROP DATABASE gym_booking;"
```

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Backend terminal | PostgreSQL connection. Required for everything except the catalogue. |
| `BACKEND_URL` | Frontend terminal or `frontend/.env` | Where Vite forwards `/api`. Defaults to `http://127.0.0.1:8000`. |
| `SMTP_HOST` | Backend terminal | Mail server for confirmation codes, e.g. `smtp.gmail.com`. If unset, codes are printed in the backend terminal. |
| `SMTP_PORT` | Backend terminal | Defaults to `587` (STARTTLS). |
| `SMTP_USER`, `SMTP_PASSWORD` | Backend terminal | Mail login. For Gmail, use an [app password](https://myaccount.google.com/apppasswords), not your normal password. |
| `SMTP_FROM` | Backend terminal | Sender address. Defaults to `SMTP_USER`. |

For example, to send real emails through Gmail, set these before starting uvicorn:

```powershell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_USER = "your.address@gmail.com"
$env:SMTP_PASSWORD = "your-16-letter-app-password"
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `psql` or `$psql` path is not found | Check the version folder under `C:\Program Files\PostgreSQL\`. |
| `password authentication failed` | Correct the password in `PGPASSWORD` or `DATABASE_URL`. |
| `python` is not recognised or opens the Microsoft Store | Install Python, reopen the terminal, or use `py -m venv .venv`. |
| `Could not import module "app.main"` | Run uvicorn from the `backend` folder. |
| `npm.ps1 cannot be loaded` | Use `npm.cmd` rather than `npm`. |
| Login or register shows a JSON parsing error | The backend is not running, or `DATABASE_URL` is not set in its terminal. |
| Landing page shows a catalogue error | The backend is not running or cannot reach the database. |
| `Booking service unavailable` | `booking_hold.sql` was not applied. Reset the database. |
| Trainer sign-up shows `Could not send your registration` | Check that the backend is running, then apply the schema update under [Trainer registration](#trainer-registration). |
| No confirmation email arrives | Without `SMTP_HOST` the code is only printed in the backend terminal. With SMTP set, check the spam folder and the backend log for `Could not send the confirmation email`. |
| Login says `Please confirm your email first` | Click **Enter confirmation code**, then **Send a new code**. |
| Sign-up or login says `temporarily unavailable`, and the backend log mentions `email_verified` or `email_verifications` | Apply the schema update under [Trainer registration](#trainer-registration). |
| Port 8000 is in use | Start uvicorn with `--port 8001`, and set `$env:BACKEND_URL = "http://127.0.0.1:8001"` before `npm.cmd run dev`. |

## macOS and Linux

The steps are the same, with these changes:

- Run `psql` directly, without `$psql` and `&`, and use `-o /dev/null` instead of `-o NUL`.
- Create the environment with `python3 -m venv .venv`, and replace `.\.venv\Scripts\python.exe` with `.venv/bin/python`.
- Set variables with `export DATABASE_URL="..."`.
- Use `npm` instead of `npm.cmd`.
