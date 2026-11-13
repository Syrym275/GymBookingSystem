# FastAPI backend

> Historical milestone notes below. For current setup follow the root README.
> The runtime catalogue now requires PostgreSQL (`DATABASE_URL`) and never serves samples.
> Trainer Dashboard/Status read `/trainers/{trainer_id}` for current professional profile data.

This first backend milestone serves fictional trainer and hall records over HTTP.
It matches the existing frontend public catalogue fields. The updated PulseGym landing page loads this public catalogue over HTTP.
Login, booking, payment, and dashboard functions still use the frontend mock API.

Implemented routes:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/` | Service name, docs path, sample-data notice |
| GET | `/health` | API health response |
| GET | `/trainers` | Four active trainers with public prices |
| GET | `/halls` | Three active halls with capacity and hourly rates |
| GET | `/public/catalog` | Trainers and halls together, matching the frontend contract |
| GET | `/docs` | Interactive API documentation |

Sample mode works without PostgreSQL. An optional read-only PostgreSQL catalogue
connection uses the existing trainers and halls tables. Real login, booking
writes, payment processing, and the audit log are later work. Sample records come
from code and match the public rows in sql/task09_reference.sql.
The health check proves only that the server responds. Public endpoints require
no login and expose no member records. CORS permits browser GET requests from
`http://localhost:5173` and `http://127.0.0.1:5173`; it is not an access-control system.

## First setup on Windows

Use the VS Code terminal with PowerShell. Install Python 3.12 or newer from
[python.org](https://www.python.org/downloads/windows/) if `python --version`
and `py --version` are not recognised. Reopen VS Code after installing.
The commands below use `python`; replace the first two `python` commands with
`py` if that is the command available on your computer.

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The `.venv` folder is an isolated Python environment for this project. The
commands use its Python directly, so you do not need to activate it or change
PowerShell's script execution policy. `app.main:app` tells Uvicorn to serve the
FastAPI object named `app` inside `app/main.py`. `--reload` restarts the server
when you save backend code during development.

Wait for `Application startup complete`. Keep this terminal running and open
[the API docs](http://127.0.0.1:8000/docs) in your browser.
Expand `GET /health`, select **Try it out**, then **Execute**.
The response should have status 200 and this JSON:

```json
{"status": "ok", "service": "gym-booking-api"}
```

Next try `/trainers`, `/halls`, and `/public/catalog`. These return JSON data,
not the React website. Press **Ctrl+C** in the terminal to stop the backend.

## Start the backend next time

Setup and installation are only needed once per environment (or when requirements change).

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Open the existing website in a second terminal

The website uses React, so do not install Angular or run `ng serve`.
If `node --version` or `npm --version` is not recognised, install the LTS edition
of [Node.js](https://nodejs.org/en/download), then reopen VS Code.
In a new PowerShell terminal:

```powershell
cd "C:\Users\Alkhaidar\Desktop\BIS\GymBookingSystem\frontend"
node --version
npm.cmd --version
npm.cmd install
npm.cmd run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`.
`npm.cmd` avoids PowerShell blocking the `npm.ps1` script. On later runs,
only the `cd` and `npm.cmd run dev` commands are needed unless dependencies change.
Keep both terminals open to run both servers; stop each with **Ctrl+C**.
The landing page now calls `/api/public/catalog`; Vite forwards that request to
FastAPI at `http://127.0.0.1:8000/public/catalog`. Trainer and hall cards come
from this server. Other signed-in features still use frontend mock data.

To prove the connection, stop FastAPI with Ctrl+C, refresh the homepage, and check
that a catalogue error and Try again button appear. Restart FastAPI and click
Try again. There is no silent fallback to browser sample data.

For a production build, configure `VITE_API_BASE_URL` before building or configure
a hosting reverse proxy for `/api`. The Vite development proxy is not a production
backend deployment. No deployment is included in this step.

## Run the backend checks

Stop the backend first if desired, then run in the `backend` folder:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Expected: nine passing tests. They check service health, public response fields,
inactive-resource filtering, CORS response headers, rejected writes, and API docs.
They also compare sample records with the supplied SQL and check decimal money
validation and the read-only adapter using mocked database connections. They do
not prove a live PostgreSQL connection, booking conflicts, or authentication.

## If something fails

| Message or symptom | Action |
| --- | --- |
| `python` opens the Microsoft Store or is not recognised | Install Python, reopen VS Code, and try `py --version`; use `py -m venv .venv` if available. |
| `.venv\\Scripts\\python.exe` not found | Run the environment creation command in the backend folder first. |
| `No module named uvicorn` | Run the requirements installation with `.venv` Python, not a different interpreter. |
| `Could not import module app.main` | Make sure the terminal is in `GymBookingSystem\\backend`. |
| Port 8000 is already in use | Stop the old server with Ctrl+C, or start with `--port 8001` and open port 8001 in the browser. |
| Browser cannot connect | Keep the server terminal running and check it for errors; use `http://127.0.0.1:8000/docs`. |
| Package installation fails | Check the terminal error and internet connection; share the error before changing project files. |
