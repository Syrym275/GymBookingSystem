# Gym Booking System (PulseGym)

Members book personal training sessions or rent halls, pay, and get a confirmation.

- `frontend/`: React + Vite, runs at http://localhost:5173
- `backend/`: FastAPI, runs at http://127.0.0.1:8000 (API docs at `/docs`)
- Database: PostgreSQL on Azure

**You need:** Node.js 18+, Python 3.12+, and the database connection string (ask the team).

Commands are for Windows PowerShell, starting in the project folder.

## 1. Database connection string

```
postgresql://ADMIN_USER:PASSWORD@YOURSERVER.postgres.database.azure.com:5432/pulsegym?sslmode=require
```

- Your PC's IP must be added in Azure → server → **Networking** → **Add current client IP address** → **Save**.
- Never commit this string. It contains the password.

**Setting up a new Azure server?** In **Server parameters**, add `BTREE_GIST` to `azure.extensions`. In **Networking**, add your IP. Under **Databases**, create `pulsegym`.

## 2. First-time setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"
.\.venv\Scripts\python.exe -m scripts.migrate
```

```powershell
cd ..\frontend
npm.cmd install
```

The `migrate` command creates or updates the tables. It never deletes data. **Run it again after every `git pull`.** On the shared database, one person running it is enough. Until someone does, sign-in fails with `column u.full_name does not exist`.

## 3. Run the app

**Terminal 1 (backend):**

```powershell
cd backend
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 (frontend):**

```powershell
cd frontend
npm.cmd run dev
```

Open http://localhost:5173. To check that the backend works, open http://127.0.0.1:8000/trainers. It should list trainers.

**Tip:** to stop retyping `DATABASE_URL`, create `backend/start-dev.ps1` with the `$env:DATABASE_URL = ...` and `uvicorn` lines from terminal 1, then start the backend with `.\start-dev.ps1`. Git ignores that file, so your password stays private.

## 4. Use the app

1. **Register** at http://localhost:5173/register. Use a real email domain, a phone like `+77011234567`, and a password like `Secret12!` (8+ characters, 1 capital, 1 symbol).
2. **Verify your email.** Without mail settings, the link is printed in terminal 1. Copy it into the browser. You can't book until the email is verified.
3. **Log in, book and pay.**

The demo login buttons don't work. Create a real account.

## 5. The admin account

There is exactly **one** admin login. The database enforces this, so a second admin can't be created. Because everyone shares the Azure database, the admin is created **once**, by one person, and the team signs in with that same account.

Check whether it already exists (this changes nothing):

```powershell
cd backend
$env:DATABASE_URL = "YOUR_CONNECTION_STRING"
.\.venv\Scripts\python.exe -m scripts.create_admin --show
```

- **It already exists:** ask the teammate who created it for the email and password.
- **There is none yet:** run `.\.venv\Scripts\python.exe -m scripts.create_admin`. It asks for an email, a name and a password (8+ characters, 1 capital, 1 symbol). If an admin already exists, it stops and changes nothing.
- **Password lost:** run `.\.venv\Scripts\python.exe -m scripts.create_admin --reset-password`.

Sign in at http://localhost:5173/login with the admin email. The admin area covers everything:

| Page | What the admin does there |
| --- | --- |
| Overview | This week's bookings, revenue, no-show rate, and a to-do list (pending trainers, unpaid bookings, expiring memberships) |
| Trainers | **Approve or reject trainer sign-ups** (no more pgAdmin queries), add, edit, deactivate, delete never-booked trainers |
| Halls | Add, edit, deactivate, delete never-booked halls |
| Members | All member data, change a plan, extend a membership |
| Bookings, Payments | Every booking and payment attempt, change a booking's status (cancelling a paid booking refunds it) |
| Reports | Popular trainers and hours, unpaid bookings |
| Staff accounts | Create receptionist logins (and logins for trainer profiles) with a first password, deactivate accounts |
| Audit log | Who did what and when: sign-ins, failed sign-ins, sign-ups, every admin change |

A trainer who signs up stays hidden from members until the admin approves them on the **Trainers** page.

## Sending real emails (optional)

Set these in terminal 1 before starting uvicorn. For Gmail, use an [app password](https://myaccount.google.com/apppasswords), not your normal password:

```powershell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "your.address@gmail.com"
$env:SMTP_PASSWORD = "your16letterapppassword"
$env:EMAIL_FROM = "PulseGym <your.address@gmail.com>"
```

All settings are listed in `backend/.env.example`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `/trainers` says `catalogue is temporarily unavailable` | The backend can't reach the database. Check the errors below. |
| `timeout expired` | Add your IP in Azure → **Networking**. |
| `database "..." does not exist` | Wrong database name at the end of `DATABASE_URL`. |
| `password authentication failed` | Wrong password. If it contains `@ : / # ?`, URL-encode them (`@` becomes `%40`). |
| `column ... does not exist` or `relation ... does not exist` | Run `.\.venv\Scripts\python.exe -m scripts.migrate`. |
| `btree_gist is not allow-listed` | Azure → **Server parameters** → `azure.extensions` → tick `BTREE_GIST`, then run migrate again. |
| Login shows a JSON error | The backend isn't running, or `DATABASE_URL` isn't set in its terminal. |
| `npm.ps1 cannot be loaded` | Use `npm.cmd` instead of `npm`. |

To see the exact database error, run this in the backend terminal:

```powershell
.\.venv\Scripts\python.exe -c "import os, psycopg; print(psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=15).execute('SELECT count(*) FROM trainers').fetchone())"
```

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests
```
