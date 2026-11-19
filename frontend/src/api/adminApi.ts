import type { Hall, MemberView, Payment, Trainer } from '../types';
import { TODAY_DATE } from '../config';
import { getDb, saveDb } from '../mock/db';
import { addDaysStr, membershipState } from '../utils/format';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import { memberViewFor } from './views';

/**
 * ADMIN DATA LAYER (demo data).
 *
 * The backend has no admin routes yet, so every admin screen runs on the in-browser demo data
 * (src/mock). Mutations (create/edit trainers and halls, change a plan, extend a membership, staff accounts,
 * booking status) live in trainersApi / hallsApi / membersApi / staffApi / bookingsApi, and the report and
 * payment-log queries in reportsApi / paymentsApi: those are already demo-data functions limited to admins.
 *
 * This file holds the admin reads that the shared modules send to the backend for other roles
 * (the public trainer / hall lists, the member directory, per-booking payment history), so the admin
 * screens keep working without a backend. When admin routes exist, replace the bodies here with real calls:
 *   GET /admin/trainers  GET /admin/halls  GET /admin/members  GET /admin/bookings/{id}/payments
 *   GET /admin/attention
 */

/** Every trainer, including inactive ones (new registrations wait there for approval). */
export async function listAllTrainers(): Promise<Trainer[]> {
  await delay();
  requireUser(['admin']);
  return clone([...getDb().trainers].sort((a, b) => a.trainer_id - b.trainer_id));
}

export async function listAllHalls(): Promise<Hall[]> {
  await delay();
  requireUser(['admin']);
  return clone([...getDb().halls].sort((a, b) => a.hall_id - b.hall_id));
}

export interface AdminMember extends MemberView {
  bookings: number; // all bookings ever made by this member
}

/** Member directory with everything an admin may see (email and QR token included). */
export async function listAllMembers(q = ''): Promise<AdminMember[]> {
  await delay();
  const viewer = requireUser(['admin']);
  const db = getDb();
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/[\s()-]/g, '');
  const rows = db.members
    .filter(
      (m) =>
        !needle ||
        m.full_name.toLowerCase().includes(needle) ||
        m.email.toLowerCase().includes(needle) ||
        (digits.length >= 3 && m.phone.replace(/\s/g, '').includes(digits)),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((m) => ({ ...memberViewFor(m, viewer), bookings: db.bookings.filter((b) => b.member_id === m.member_id).length }));
  return clone(rows);
}

/** Payment attempts of one booking, newest last. */
export async function listPaymentsOf(bookingId: number): Promise<Payment[]> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  if (!db.bookings.some((b) => b.booking_id === bookingId)) throw new ApiError('NOT_FOUND', 'Booking not found.');
  return clone(db.payments.filter((p) => p.booking_id === bookingId).sort((a, b) => a.payment_id - b.payment_id));
}

export interface Attention {
  pendingTrainers: number; // inactive trainers: waiting for approval
  unpaidBookings: number; // pending bookings that hold a slot
  expiringMemberships: number; // ends within 7 days
  expiredMemberships: number;
}

/** The small to-do list at the top of the overview. */
export async function attention(): Promise<Attention> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  const states = db.members.map((m) => membershipState(m.membership_expires_on).state);
  return {
    pendingTrainers: db.trainers.filter((t) => !t.is_active).length,
    unpaidBookings: db.bookings.filter((b) => b.status === 'pending' && b.start_time.slice(0, 10) >= TODAY_DATE).length,
    expiringMemberships: states.filter((s) => s === 'expiring').length,
    expiredMemberships: states.filter((s) => s === 'expired').length,
  };
}

export interface ResourceCounts {
  trainers: Record<number, number>; // sessions that took place (completed + no-show)
  halls: Record<number, number>;
  /** Bookings of any status per trainer / hall. A resource with none can be deleted. */
  booked: { trainers: Record<number, number>; halls: Record<number, number> };
}

/** Held sessions / rentals per trainer and per hall (for the management tables). */
export async function sessionCounts(): Promise<ResourceCounts> {
  await delay();
  requireUser(['admin']);
  const out: ResourceCounts = { trainers: {}, halls: {}, booked: { trainers: {}, halls: {} } };
  for (const b of getDb().bookings) {
    if (b.trainer_id !== null) out.booked.trainers[b.trainer_id] = (out.booked.trainers[b.trainer_id] ?? 0) + 1;
    if (b.hall_id !== null) out.booked.halls[b.hall_id] = (out.booked.halls[b.hall_id] ?? 0) + 1;
    if (b.status !== 'completed' && b.status !== 'no_show') continue;
    if (b.trainer_id !== null) out.trainers[b.trainer_id] = (out.trainers[b.trainer_id] ?? 0) + 1;
    if (b.hall_id !== null) out.halls[b.hall_id] = (out.halls[b.hall_id] ?? 0) + 1;
  }
  return out;
}

/** Default report window: the 30 days up to and including today. */
export const defaultReportRange = () => ({ from: addDaysStr(TODAY_DATE, -29), to: TODAY_DATE });

/**
 * Deletes a trainer that was never booked (for example a registration that is rejected, or a record added by
 * mistake). A trainer with any booking can only be deactivated, so old bookings and payment reports stay correct.
 * The trainer's login accounts go with it. The real database enforces the same rule with its foreign keys.
 */
export async function deleteTrainer(id: number): Promise<void> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  if (!db.trainers.some((t) => t.trainer_id === id)) throw new ApiError('NOT_FOUND', 'Trainer not found.');
  if (db.bookings.some((b) => b.trainer_id === id)) {
    throw new ApiError('VALIDATION', 'This trainer has bookings, so it can only be deactivated.');
  }
  db.trainers = db.trainers.filter((t) => t.trainer_id !== id);
  db.users = db.users.filter((u) => u.trainer_id !== id);
  saveDb();
}

/** Deletes a hall that was never booked. A hall with any booking can only be deactivated. */
export async function deleteHall(id: number): Promise<void> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  if (!db.halls.some((h) => h.hall_id === id)) throw new ApiError('NOT_FOUND', 'Hall not found.');
  if (db.bookings.some((b) => b.hall_id === id)) {
    throw new ApiError('VALIDATION', 'This hall has bookings, so it can only be deactivated.');
  }
  db.halls = db.halls.filter((h) => h.hall_id !== id);
  saveDb();
}
