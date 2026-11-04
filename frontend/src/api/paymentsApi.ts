import type { BookingView, Payment, PaymentMethod, PaymentStatus, PaymentView } from '../types';
import { TODAY } from '../config';
import { getDb, nextId, saveDb } from '../mock/db';
import { bkNumber, dateOf, pad } from '../utils/format';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import { toView } from './views';

export interface PaymentFilters {
  status?: PaymentStatus | '';
  method?: PaymentMethod | '';
  from?: string;
  to?: string;
  q?: string; // txn ref, BK number, member name
}

export interface PayResult {
  payment: Payment;
  booking: BookingView;
}

/**
 * Pay a pending booking. Approved: one approved payment is created AND the booking
 * goes pending -> confirmed together. Declined: only a declined attempt is stored.
 * If the booking is no longer pending -> GB003 and nothing is saved.
 */
export async function payBooking(
  booking_id: number,
  method: PaymentMethod,
  outcome: 'approve' | 'decline',
): Promise<PayResult> {
  await delay();
  const viewer = requireUser(['member', 'admin']);
  const db = getDb();
  const b = db.bookings.find((x) => x.booking_id === booking_id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'member' && b.member_id !== viewer.member_id) throw new ApiError('FORBIDDEN', 'This is not your booking.');
  if (method === 'cash') throw new ApiError('VALIDATION', 'Online payment supports card, NFC or app.');
  if (b.status !== 'pending') throw new ApiError('GB003', 'This booking is no longer waiting for payment.');
  // Rule 9: at most one approved payment per booking
  if (db.payments.some((p) => p.booking_id === b.booking_id && p.payment_status === 'approved')) {
    throw new ApiError('GB003', 'This booking has already been paid.');
  }

  const id = nextId('payment');
  const payment: Payment = {
    payment_id: id,
    booking_id: b.booking_id,
    amount_kzt: b.price_kzt,
    method,
    payment_status: outcome === 'approve' ? 'approved' : 'declined',
    provider_txn_ref: `TXN-${dateOf(TODAY).replace(/-/g, '')}-${pad(id, 4)}`,
    created_at: TODAY,
  };
  db.payments.push(payment);
  if (outcome === 'approve') b.status = 'confirmed';
  saveDb();
  return clone({ payment, booking: toView(b, viewer) });
}

/** Payment attempts for one booking: the owner (member) and admin only. Never reception/trainer. */
export async function listPaymentsForBooking(booking_id: number): Promise<Payment[]> {
  await delay();
  const viewer = requireUser(['member', 'admin']);
  const db = getDb();
  const b = db.bookings.find((x) => x.booking_id === booking_id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'member' && b.member_id !== viewer.member_id) throw new ApiError('FORBIDDEN', 'This is not your booking.');
  return clone(db.payments.filter((p) => p.booking_id === booking_id));
}

/** Full payments log: admin only (reception has no access to payments). */
export async function listPayments(f: PaymentFilters = {}): Promise<PaymentView[]> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  const q = (f.q ?? '').trim().toLowerCase();
  const rows: PaymentView[] = [];
  for (const p of db.payments) {
    const b = db.bookings.find((x) => x.booking_id === p.booking_id)!;
    const m = db.members.find((x) => x.member_id === b.member_id)!;
    if (f.status && p.payment_status !== f.status) continue;
    if (f.method && p.method !== f.method) continue;
    if (f.from && dateOf(p.created_at) < f.from) continue;
    if (f.to && dateOf(p.created_at) > f.to) continue;
    if (
      q &&
      !(
        p.provider_txn_ref.toLowerCase().includes(q) ||
        bkNumber(b.booking_id).toLowerCase().includes(q) ||
        m.full_name.toLowerCase().includes(q)
      )
    ) {
      continue;
    }
    rows.push({ ...p, booking_no: bkNumber(b.booking_id), member_name: m.full_name });
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.payment_id - a.payment_id);
  return clone(rows);
}
