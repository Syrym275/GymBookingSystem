# Gym Booking System — front end

A bright, mobile-friendly front end for a gym where members book a **60-minute personal training session** or **rent a hall/studio**, pay, and get a confirmation. Its core promise: *one trainer or one hall is never booked twice for the same time.*

Week 10 update: the latest PulseGym design is imported from frontend branch commit
`b9fd75d59fb4b1e8c72e4c63c5ddababc494fd8b`. The landing page now fetches its trainers
and halls from FastAPI via `/api/public/catalog`. Run the backend on port 8000 and
the frontend in a separate terminal. Other flows still use the mock API.
See `../backend/README.md` for the current beginner setup and scope.

This folder is the **front end**; the backend lives next to it in `../backend/`. Except for the public catalogue, data comes from a mock API layer (`src/api` + `src/mock`) that mirrors the real PostgreSQL schema, so it can later be swapped for real HTTP calls.

**Stack:** React 18 · TypeScript (strict) · Vite · React Router 6 · Tailwind CSS · lucide-react · date-fns · recharts

## Run it locally

Requires **Node 18+**. Run these inside `frontend/`.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Demo accounts

Password for every account: **`demo123`**. The login page has one-click buttons for the four roles.

| Role | Email | Notes |
|---|---|---|
| Member | `aruzhan.bekova@example.kz` | Annual plan |
| Receptionist | `reception@gym.kz` | |

Handy extras (all members use `demo123`):
- `yerassyl.omarov@example.kz` — already has **2 unpaid bookings** → try booking a third (error `GB001`).
- `timur.abenov@example.kz` — membership **expired** 2026-10-31 → booking is refused (error `GB002`).
- `madina.rakhimova@example.kz` — membership ends in 4 days → warning banner.

In development (`npm run dev`) the top bar shows a **DEV role switcher** and a **Reset demo data** button. Neither exists in a production build.

> The app treats **2 Nov 2026, 08:00** as "now" (`src/config.ts → TODAY`) so the sample data always looks right.

## Roles and pages

**Public** — Landing (`/`): hero, features, how it works, live list of active trainers and halls with prices (`getPublicCatalog()` in `src/api/publicApi.ts`, no sign-in needed), membership plans linking to `/register?plan=…`. Signed-in users are redirected to their dashboard. · Login (`/login`) · Register (`/register`): member self sign-up (name, email, KZ phone, password, plan). Creates the member + login account, sets the expiry from the plan (1 / 3 / 12 months from today) and signs the new member in. Email and phone must be unique.

**Member** (`/member`) — Dashboard (plan, expiry warning, "X of 2 unpaid") · Book a trainer · Rent a hall · Payment (15-min hold countdown, card/NFC/app, simulate a declined payment) · Confirmation · My bookings (upcoming/past, status filter, booking slip, cancel) · Profile with QR

**Trainer** and **Admin / Manager** areas are hidden for now: their pages were removed and those accounts cannot sign in (`ENABLED_ROLES` in `src/auth/mockUsers.ts`).

**Receptionist** (`/reception`) — Today (timeline, check-in, next 2 hours) · All bookings (multi-filter, search, sort, pagination, filters in the URL) · Unpaid bookings (grouped by member, limit highlighted, cancel) · Member lookup · New booking for a member

## Business rules enforced in the mock API

Opening hours 07:00–22:00, one day per booking · training = exactly 60 min on the hour · hall price = hourly rate × hours · training price frozen at booking time · **no overlap** for the same trainer, hall *or* member (half-open `[start, end)`, so back-to-back is fine) → `23P01` *"This slot was just taken"* with suggested free slots · max **2 unpaid** bookings → `GB001` · membership must be valid on the booking date → `GB002` · paying creates an approved payment **and** confirms the booking together, otherwise `GB003` · one approved payment per booking · inactive trainers/halls are hidden from booking · nothing is ever deleted, only deactivated.

Only `pending` and `confirmed` bookings block a slot. Paid/unpaid is derived from status.

## Access rules (enforced in `src/api`, not just hidden in the UI)

- **Trainer** — only their own sessions; sees the member's *name* only (never phone, email or QR token).
- **Receptionist** — name, phone, plan/expiry; **no** email, **no** QR token, **no** access to payments.
- **Member** — only their own data.
- **Admin** — everything.

## Project structure

```
src/
  api/         async mock API (200–400 ms delay) + ApiError   ← replace with real calls
  auth/        AuthContext, RequireRole guard, mock users       ← replace login
  components/  StatusBadge, BookingSlip, SlotPicker, DataTable, Modal, ConfirmDialog, Toast, KpiCard …
  hooks/       useAsync
  layouts/     AppLayout (role-based sidebar + top bar)
  mock/        seed data + in-memory db persisted to localStorage ← delete when the backend exists
  pages/       member/ reception/ Login.tsx
  types/       types mirroring the DB tables
  utils/       BK number, KZT, dates, overlap check
  config.ts · router.tsx · main.tsx · App.tsx
```

Pages never import mock data directly — they only call functions in `src/api/`.

## Connecting the real backend

1. **`src/api/*.ts`** — keep the function names, parameters and return types; replace each body with a `fetch`/axios call. Map backend errors to `new ApiError(code, message)` using the same codes (`23P01`, `GB001`, `GB002`, `GB003`, `NOT_FOUND`, `FORBIDDEN`). Drop the `delay()` calls.
2. **`src/api/session.ts`** — delete it. The real API identifies the caller from the token/cookie and applies the role-based field filtering server-side.
3. **`src/auth/AuthContext.tsx`** — read the comment block at the top. Replace the `authenticate(...)` call with the real login request and `registerMember(...)` with the real sign-up request; the `useAuth()` contract (`user`, `login`, `register`, `logout`) stays the same.
4. Delete **`src/mock/`** and **`src/auth/mockUsers.ts`** (also remove the demo-account buttons from `Login.tsx` and the DEV switcher in `AppLayout.tsx`).
5. Datetimes are plain local strings `"YYYY-MM-DDTHH:mm"` (gym local time) — keep them as-is, do not convert time zones.

## Assumptions

- Attendance (attended / no-show) can be marked for **confirmed** bookings whose date is **today or earlier**.
- The 15-minute payment hold countdown restarts when the payment page is opened (demo simplification); at 0 the booking becomes `expired` and the slot is released.
- Cancelling a *confirmed* booking releases the slot and marks its approved payment `refunded`.
- Reception can cancel only **pending** bookings; members can cancel pending/confirmed future ones; admins can change any status.
- "Sessions held" in reports = completed + no-show. "Revenue" = approved payments in the last 30 days.
- The QR code is a visual placeholder derived from the token — swap in a real QR library when needed.
