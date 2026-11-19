import type { Hall, MemberView, Payment, Trainer, TrainerApplication } from '../types';
import { TODAY_DATE } from '../config';
import { addDaysStr } from '../utils/format';
import { api, withQuery } from './http';
import { requireUser } from './session';

/**
 * ADMIN DATA LAYER. Every call goes to the backend /admin routes (backend/app/admin.py), which only the
 * single admin account may use. Mutations of trainers, halls, members, staff, bookings and the payment and
 * report queries live in their own api/* modules and call /admin routes the same way.
 */

/** Every trainer, active or deactivated. Sign-ups waiting for approval come from listApplications(). */
export async function listAllTrainers(): Promise<Trainer[]> {
  requireUser(['admin']);
  return api<Trainer[]>('/admin/trainers', 'Could not load trainers.');
}

export async function listAllHalls(): Promise<Hall[]> {
  requireUser(['admin']);
  return api<Hall[]>('/admin/halls', 'Could not load halls.');
}

export interface AdminMember extends MemberView {
  bookings: number; // all bookings ever made by this member
}

/** Member directory with everything an admin may see (email and QR token included). */
export async function listAllMembers(q = ''): Promise<AdminMember[]> {
  requireUser(['admin']);
  return api<AdminMember[]>(withQuery('/admin/members', { q: q.trim() }), 'Could not load members.');
}

/** Payment attempts of one booking, newest last. */
export async function listPaymentsOf(bookingId: number): Promise<Payment[]> {
  requireUser(['admin']);
  const rows = await api<Payment[]>(`/bookings/${bookingId}/payments`, 'Could not load payment history.');
  return [...rows].sort((a, b) => a.payment_id - b.payment_id);
}

export interface Attention {
  pendingTrainers: number; // trainer applications waiting for approval
  unpaidBookings: number; // pending bookings that hold a slot
  expiringMemberships: number; // ends within 7 days
  expiredMemberships: number;
}

/** The small to-do list at the top of the overview. */
export async function attention(): Promise<Attention> {
  requireUser(['admin']);
  return api<Attention>('/admin/attention', 'Could not load the to-do list.');
}

export interface ResourceCounts {
  trainers: Record<number, number>; // sessions that took place (completed + no-show)
  halls: Record<number, number>;
  /** Bookings of any status per trainer / hall. A resource with none can be deleted. */
  booked: { trainers: Record<number, number>; halls: Record<number, number> };
}

/** Held sessions / rentals per trainer and per hall (for the management tables). */
export async function sessionCounts(): Promise<ResourceCounts> {
  requireUser(['admin']);
  return api<ResourceCounts>('/admin/resource-counts', 'Could not load session counts.');
}

/** Default report window: the 30 days up to and including today. */
export const defaultReportRange = () => ({ from: addDaysStr(TODAY_DATE, -29), to: TODAY_DATE });

/**
 * Deletes a trainer that was never booked (for example a record added by mistake). A trainer with any
 * booking can only be deactivated, so old bookings and payment reports stay correct. Its login goes with it.
 */
export async function deleteTrainer(id: number): Promise<void> {
  requireUser(['admin']);
  await api<void>(`/admin/trainers/${id}`, 'Could not delete the trainer.', { method: 'DELETE' });
}

/** Deletes a hall that was never booked. A hall with any booking can only be deactivated. */
export async function deleteHall(id: number): Promise<void> {
  requireUser(['admin']);
  await api<void>(`/admin/halls/${id}`, 'Could not delete the hall.', { method: 'DELETE' });
}

// ---- trainer applications ---------------------------------------------------
// A trainer sign-up (POST /auth/register/trainer) creates an INACTIVE trainer plus its login.
// Approve = the trainer becomes active and bookable. Reject = the never-booked trainer and its login are removed.

/** Applications waiting for a decision, newest first. application_id is the pending trainer's trainer_id. */
export async function listApplications(): Promise<TrainerApplication[]> {
  requireUser(['admin']);
  return api<TrainerApplication[]>('/admin/trainer-applications', 'Could not load trainer applications.');
}

/** Approves an application: the applicant becomes an active trainer and can sign in with their own password. */
export async function approveApplication(id: number): Promise<Trainer> {
  requireUser(['admin']);
  return api<Trainer>(`/admin/trainer-applications/${id}/approve`, 'Could not approve the trainer.', { method: 'POST' });
}

/** Rejects an application: the sign-up is removed and no trainer is created. */
export async function rejectApplication(id: number): Promise<void> {
  requireUser(['admin']);
  await api<void>(`/admin/trainer-applications/${id}/reject`, 'Could not reject the application.', { method: 'POST' });
}

// ---- audit log ----------------------------------------------------------------

export interface AuditEntry {
  audit_id: number;
  actor_user_id: number | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditFilters {
  action?: string; // prefix, e.g. "trainer." or "auth.login_failed"
  q?: string; // actor email or any detail text
  from?: string;
  to?: string;
}

/** Who did what and when, newest first (at most 500 rows). */
export async function listAudit(f: AuditFilters = {}): Promise<AuditEntry[]> {
  requireUser(['admin']);
  return api<AuditEntry[]>(withQuery('/admin/audit', { ...f, limit: 500 }), 'Could not load the audit log.');
}
