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

foreach ($file in "task09_reference", "auth_schema", "booking_hold", "email_verification", "booking_cancellation") {
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

Before saving the account, the backend asks DNS whether the email's domain can receive mail. A made-up domain such as `user@nosuchsite.kz` is refused right away with "The email domain ... does not exist". It cannot tell whether the mailbox itself exists. If DNS does not answer (no internet, router problems), the sign-up is allowed.

#### Email verification

After signing up you see **Check your inbox**. The backend emails a link, `{APP_URL}/verify-email?token=...`, that works once and expires after 24 hours.

- **No mail settings (default):** nothing is sent. The email, including the link, is printed in the backend terminal. Copy the link into the browser.
- **Real emails:** set the variables under [Configuration](#configuration) before starting the backend.

Until the link is opened, the member can log in and look around, and the app shows a **Verify your email** banner. **Creating a booking and paying are refused** with `Please verify your email before booking or paying`. **Send a new link** works up to 3 times an hour, and each new link cancels the previous one. Accounts that existed before email verification was added count as verified.

**The demo accounts and one-click demo buttons on the login page do not work.** Login now checks the PostgreSQL `users` table, which starts empty.

### Trainer registration

Choose **Trainer** on the sign-up page. Trainers get a verification link too. The trainer is saved as inactive and stays off the public list until approved, and trainers cannot sign in yet. There is no admin screen, so approve a trainer in the database:

```powershell
& $psql -U postgres -d gym_booking -c "UPDATE trainers SET is_active = TRUE WHERE trainer_id = 5;"
```

If your database was created before trainer registration or email verification was added, apply the schema updates once. They keep your existing data, and existing accounts are marked as verified:

```powershell
& $psql -U postgres -d gym_booking -v ON_ERROR_STOP=1 -f backend/sql/auth_schema.sql
& $psql -U postgres -d gym_booking -v ON_ERROR_STOP=1 -f backend/sql/email_verification.sql
& $psql -U postgres -d gym_booking -v ON_ERROR_STOP=1 -f backend/sql/booking_cancellation.sql
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

- **Staff cannot sign in.** The backend takes the display name from `members`, so a receptionist account with no member record makes login fail with a 500 error. Trainer logins are refused with a message until a trainer area exists.
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
| `APP_URL` | Backend terminal | Frontend address used in verification links. Defaults to `http://localhost:5173`. |
| `EMAIL_BACKEND` | Backend terminal | `console` prints emails in the terminal, `smtp` sends them. Defaults to `smtp` when `SMTP_HOST` is set, otherwise `console`. |
| `EMAIL_FROM` | Backend terminal | Sender address, e.g. `PulseGym <no-reply@yourdomain.kz>`. Defaults to `SMTP_USER`. |
| `SMTP_HOST`, `SMTP_PORT` | Backend terminal | Mail server. Port `587` (default) uses STARTTLS, `465` uses TLS. |
| `SMTP_USER`, `SMTP_PASSWORD` | Backend terminal | Mail login. For Gmail, use an [app password](https://myaccount.google.com/apppasswords), not your normal password. |

All of them are listed in `backend/.env.example`. The backend does not read `.env` files, so set them in the terminal before starting uvicorn. They last only as long as that terminal window.

### Test emails with Mailtrap (recommended for development)

[Mailtrap](https://mailtrap.io) Email Testing catches every email the app sends and shows it in a web inbox. Nothing reaches a real mailbox, so any sender and recipient address works, and no domain is needed.

1. Sign up at https://mailtrap.io and open https://mailtrap.io/inboxes. Skip any "add a domain" screen: that belongs to Mailtrap's *Email Sending* product, which is not needed here.
2. Open your inbox (**My Inbox** or **My Sandbox**), then **Integration** or **SMTP Settings**, and click **Show credentials**. The host must be `sandbox.smtp.mailtrap.io`. If it says `live.smtp.mailtrap.io`, you are in the sending product.
3. Set these before starting uvicorn:

```powershell
$env:SMTP_HOST = "sandbox.smtp.mailtrap.io"
$env:SMTP_PORT = "2525"
$env:SMTP_USER = "YOUR_MAILTRAP_USERNAME"
$env:SMTP_PASSWORD = "YOUR_MAILTRAP_PASSWORD"
$env:EMAIL_FROM = "PulseGym <no-reply@pulsegym.kz>"
```

Sign up, then open the **Verify your PulseGym email** message in the Mailtrap inbox and click **Verify my email**.

To check the settings without signing up, run this from `backend`. It should print `sent`, and the email appears in Mailtrap:

```powershell
.\.venv\Scripts\python.exe -c "from app.mailer import send_email, OutgoingEmail; send_email(OutgoingEmail('test@example.kz', 'PulseGym test', 'It works.', '<p>It works.</p>')); print('sent')"
```

### Start script for your own settings

To avoid retyping the variables in every new window, create `backend/start-dev.ps1` with your own values. It is listed in `.gitignore`, so your passwords stay on your computer:

```powershell
$env:DATABASE_URL  = "postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/gym_booking"
$env:SMTP_HOST     = "sandbox.smtp.mailtrap.io"
$env:SMTP_PORT     = "2525"
$env:SMTP_USER     = "YOUR_MAILTRAP_USERNAME"
$env:SMTP_PASSWORD = "YOUR_MAILTRAP_PASSWORD"
$env:EMAIL_FROM    = "PulseGym <no-reply@pulsegym.kz>"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Then start the backend from the `backend` folder with `.\start-dev.ps1`. If PowerShell says running scripts is disabled, use `powershell -ExecutionPolicy Bypass -File .\start-dev.ps1`.

### Send real emails through Gmail

Mailtrap's testing inbox never delivers to real addresses. To send to real inboxes without your own domain, use a Gmail account:

1. Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/twosv) for the Gmail account.
2. Create an [app password](https://myaccount.google.com/apppasswords) while logged in as that account, and copy the 16 letters without spaces. Your normal Google password is always rejected with `535 Username and Password not accepted`.
3. Set these before starting uvicorn. `EMAIL_FROM` must be the same Gmail address:

```powershell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "your.address@gmail.com"
$env:SMTP_PASSWORD = "your16letterapppassword"
$env:EMAIL_FROM = "PulseGym <your.address@gmail.com>"
```

Gmail allows about 500 emails a day. For a public launch, use your own domain with a sending provider (Mailtrap Sending, SendGrid, Resend, Amazon SES), add the SPF and DKIM DNS records they give you, and put their SMTP details in the same variables.

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
| No verification email arrives | Without `SMTP_HOST` the email is only printed in the backend terminal. With SMTP set, check the spam folder and the backend log for `Could not send the verification email`. |
| Backend log shows `535 Username and Password not accepted` | Wrong SMTP login. For Gmail, `SMTP_USER` must be the account the app password was made in. |
| Sign-up says `Registration is temporarily unavailable`, and the backend log mentions `email_verification_tokens` | Apply `email_verification.sql` as shown under [Trainer registration](#trainer-registration). |
| Port 8000 is in use | Start uvicorn with `--port 8001`, and set `$env:BACKEND_URL = "http://127.0.0.1:8001"` before `npm.cmd run dev`. |

## macOS and Linux

The steps are the same, with these changes:

- Run `psql` directly, without `$psql` and `&`, and use `-o /dev/null` instead of `-o NUL`.
- Create the environment with `python3 -m venv .venv`, and replace `.\.venv\Scripts\python.exe` with `.venv/bin/python`.
- Set variables with `export DATABASE_URL="..."`.
- Use `npm` instead of `npm.cmd`.
