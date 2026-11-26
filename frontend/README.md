# Gym Booking System — front end

A bright, mobile-friendly front end for a gym where members book a **60-minute personal training session** or **rent a hall/studio**, pay, and get a confirmation. Its core promise: *one trainer or one hall is never booked twice for the same time.*

Week 10 update: the latest PulseGym design is imported from frontend branch commit
`b9fd75d59fb4b1e8c72e4c63c5ddababc494fd8b`. The landing page and account flows
use FastAPI via the Vite proxy. Run the backend on port 8000 and the frontend in
a separate terminal. Some dashboard reports still use local mock data.
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

## Accounts

Create member or trainer accounts through the registration page, or provision
staff accounts directly in PostgreSQL. Login uses the backend's HttpOnly session
cookie; the browser does not use demo credentials or a client-side role switcher.

> The app treats **2 Nov 2026, 08:00** as "now" (`src/config.ts → TODAY`) so the sample data always looks right.

## Roles and pages

**Public** — Landing (`/`): hero, features, how it works, live list of active trainers and halls with prices (`getPublicCatalog()` in `src/api/publicApi.ts`, no sign-in needed), membership plans linking to `/register?plan=…`. Signed-in users are redirected to their dashboard. · Login (`/login`) · Register (`/register`): member self sign-up (name, email, KZ phone, password, plan). Creates the member + login account, sets the expiry from the plan (1 / 3 / 12 months from today) and signs the new member in. Email and phone must be unique.

**Member** (`/member`) — **hidden for now.** Set `MEMBER_AREA_ENABLED = true` in `src/config.ts` to bring back its pages and member sign-up/sign-in UI. — Dashboard (plan, expiry warning, "X of 2 unpaid") · **Book a session** (`/member/book`: a trainer, a hall, or **both together**, see below) · Payment (15-min hold countdown, card/NFC/app, simulate a declined payment) · Confirmation · My bookings (upcoming/past, status filter, booking slip, cancel) · Profile with QR

**Hall + trainer ("3-way connection": member, hall, trainer).** One booking can hold a hall *and* a trainer for the same hours. `/member/book` offers three choices: *Trainer* (a 60-minute session), *Hall* (any whole hours), *Hall + trainer*. In *Hall + trainer* the member picks a hall, a date and a time range, and then only trainers who are free for that whole time can be chosen (busy, day-off and on-a-break trainers are shown but disabled). Price = (hall rate + trainer price) × hours. The trainer sees it on their schedule; the hall and the trainer are blocked for everyone else, and cancelling frees both. Reception books it from *New booking → Hall + trainer*; the admin bookings list has a *Hall + trainer* type filter. Code: `src/components/booking/CombinedBooking.tsx`, `src/pages/member/BookSession.tsx`. Backend: booking type `combined` (`backend/sql/combined_booking.sql`, run by `python -m scripts.migrate`).

**Trainer** (`/trainer`) — six pages in `src/pages/trainer/`:

| Page | Route | What it shows |
|---|---|---|
| Overview ("page for trainer") | `/trainer` | Profile, live status, KPIs (sessions, attendance, clients, session value), today's sessions with attendance buttons, coming up, last-7-days chart |
| Schedule | `/trainer/schedule` | Week calendar + day list, click a session for the booking slip and attendance |
| Statistics ("graphic") | `/trainer/stats` | Period picker (7 / 30 / 90 days), KPIs compared with the previous period, sessions per day or week, outcome donut, busiest hours, 8-week trend |
| Clients | `/trainer/clients` | Clients grouped by name with derived labels (Regular, New, Active, At risk, Inactive), search, per-client history |
| History | `/trainer/history` | Sessions that are over, filters (dates, client, result), sortable table, CSV export |
| Status | `/trainer/status` | Live status from the schedule, own availability (Available / On a break / Day off + note), profile approval state, session status board, "needs your attention" list for unmarked sessions |

Privacy: a trainer only ever sees a client's **name** (no phone, email, QR or member id) and only their **own** sessions. All numbers are computed in `src/pages/trainer/analytics.ts` from the trainer's own bookings (`listBookings()`).

Trainer limits for now: some trainer reports still run on mock data. The backend
authenticates trainer sessions, applies trainer-scoped booking access, and stores
the trainer's availability status in PostgreSQL. The availability note is
private to the trainer area and is not exposed to members.

**Admin / Manager** (`/admin`) — eight pages in `src/pages/admin/`:

| Page | Route | What it does |
|---|---|---|
| Overview | `/admin` | KPIs (bookings this week, confirmed/pending, revenue 30 days, no-show rate), a "needs attention" list (trainers awaiting approval, unpaid bookings, memberships ending or expired), busiest day/hour, two charts |
| Bookings | `/admin/bookings` | Every booking, filters kept in the URL, status change straight from the table, payment info, details with payment attempts, CSV export |
| Payments log | `/admin/payments` | Every payment attempt (approved, declined, refunded) with totals, filters, search, CSV export |
| Trainers | `/admin/trainers` | Add, edit price and specialization, **trainer applications** (people who signed up as a trainer wait here: **Approve** creates the active trainer + login, **Reject** removes the request), activate / deactivate, **delete** (only if never booked) |
| Halls | `/admin/halls` | Add, edit capacity and hourly rate, activate / deactivate, **delete** (only if never booked) |
| Members | `/admin/members` | Search, see all details, change the plan, extend the membership |
| Reports | `/admin/reports` | Popular trainers, popular start hours, members with unpaid bookings (date range, CSV export) |
| Staff accounts | `/admin/staff` | Receptionist / trainer / admin logins: add, deactivate |

Trainers and halls that have bookings can only be **deactivated** (the Delete button is disabled), so old bookings and payment reports stay correct. A trainer or hall that was never booked (a rejected registration, a record added by mistake) can be **deleted**. Members and staff accounts are never deleted, only deactivated.

**Trainer sign-up → approval.** `/register` → "Offer training sessions" files an *application*; it is not a trainer yet. It shows up under *Admin → Trainers → Trainer applications* (and in the Overview "needs attention" list). In the real backend this is a `trainers` row with `is_active = FALSE`; the admin API only needs *list applications / approve / reject*. When no backend answers (dev mode only), `api/demoSignup.ts` stores the application in the mock database so the whole flow can be shown with just `npm run dev`.

**How to see the admin area without a backend or database.** The backend has no admin routes yet, so the admin area runs on the in-browser **demo data** (`src/mock`, extended by `src/api/adminApi.ts`) and shows a "Demo data" banner. Run only the frontend:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5173/login and click **Open the admin area (demo data)**. That button exists only in `npm run dev`, never in a production build. Changes you make stay in your browser (`localStorage`); clear site data to start from the generated demo data again. The demo data is generated relative to today (eight weeks back, ten days ahead), so revenue, reports and the payments log always have recent activity.

**Connecting the real backend later:** replace the bodies in `src/api/adminApi.ts` and the admin functions in `trainersApi`, `hallsApi`, `membersApi`, `staffApi`, `paymentsApi.listPayments`, `reportsApi` and `bookingsApi.setBookingStatus` with calls to admin-only routes (for example `GET /admin/trainers`, `PATCH /admin/trainers/{id}`, `GET /admin/payments`, `GET /admin/reports/...`), and remove the demo button (`demoLogin` in `src/auth/AuthContext.tsx`). A real admin account has to be created in the database first (there is no admin sign-up).

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
3. **`src/auth/AuthContext.tsx`** — the `useAuth()` contract (`user`, `login`, `register`, `logout`) is backed by the FastAPI session endpoints.
4. Delete **`src/mock/`** and **`src/auth/mockUsers.ts`** (also remove the demo-account buttons from `Login.tsx` and the DEV switcher in `AppLayout.tsx`).
5. Datetimes are plain local strings `"YYYY-MM-DDTHH:mm"` (gym local time) — keep them as-is, do not convert time zones.

## Assumptions

- Attendance (attended / no-show) can be marked for **confirmed** bookings whose date is **today or earlier**.
- The 15-minute payment hold countdown restarts when the payment page is opened (demo simplification); at 0 the booking becomes `expired` and the slot is released.
- Cancelling a *confirmed* booking releases the slot and marks its approved payment `refunded`.
- Reception can cancel only **pending** bookings; members can cancel pending/confirmed future ones; admins can change any status.
- "Sessions held" in reports = completed + no-show. "Revenue" = approved payments in the last 30 days.
- The QR code is a visual placeholder derived from the token — swap in a real QR library when needed.

## Languages (RU / KZ / EN)

The switch in every page header changes the language of the whole site; the choice is remembered in the browser. The first visit uses the browser language (Russian if it is not RU/KZ/EN).

- Texts live in `src/i18n/en.ts`, `ru.ts` and `kz.ts`. All three have the same keys; TypeScript reports a missing key.
- In a component: `const { t } = useT();` then `t('landing.bookSession')` or `t('slip.title', { id })`. Counts: `tp('unit.days', n)` picks the right plural form.
- Messages that the backend sends in English are translated in `src/i18n/messages.ts`. Add a line there when the backend gets a new message.
- Trainer cards on the landing page show drawn portraits (`src/components/TrainerPortrait.tsx`). To use real photos, put them in `public/trainers/` and list them in `TRAINER_PHOTOS`.
