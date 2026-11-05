# Gym Booking System

Members book a **60-minute personal training session** or **rent a hall/studio**, pay, and get a confirmation — and one trainer or hall is never booked twice for the same time.

## Repository layout

```
GymBookingSystem/
  frontend/   React + TypeScript + Vite app (public catalogue uses FastAPI; other flows use mocks)  → see frontend/README.md
  backend/    FastAPI public catalogue (sample mode or read-only Task 9 PostgreSQL)
  docs/       project description
```

## Quick start (front end)

Requires **Node 18+**.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Demo accounts, roles, business rules and how to connect the backend are described in [`frontend/README.md`](frontend/README.md).

## Backend first step

The FastAPI server provides `/health`, `/trainers`, `/halls`, and `/public/catalog`,
with interactive documentation at `http://127.0.0.1:8000/docs` when running.
The updated PulseGym landing page loads trainers and halls from FastAPI through
the Vite `/api` proxy. Sample mode needs no database; setting `DATABASE_URL` enables
read-only access to the Task 9 PostgreSQL trainers/halls tables. Signed-in booking,
login, payments, and reports remain frontend mocks. The SQL reference is never run
automatically.

<!-- See [`backend/README.md`](backend/README.md) for beginner Windows setup, startup
commands for both servers, tests, limitations, and the next Task 10 contribution. -->
