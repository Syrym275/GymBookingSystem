import type { BookingView, Payment, PaymentMethod, PaymentStatus, PaymentView } from '../types';
import { getDb } from '../mock/db';
import { bkNumber, dateOf } from '../utils/format';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import {
  getBooking,
  loadSavedBookingDetails,
  type BackendBooking,
} from './bookingsApi';

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
  requireUser(['member', 'admin']);

  const response = await fetch(
    `/api/bookings/${booking_id}/payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method,
        outcome,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status === 404
        ? 'NOT_FOUND'
        : response.status === 409
          ? 'GB003'
          : 'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : 'Payment failed.',
    );
  }

  return {
    payment: data.payment as Payment,
    booking: await loadSavedBookingDetails(
      data.booking as BackendBooking,
    ),
  };
}

/** Client-side owner/role checks; verified backend authorization is still required. */
export async function listPaymentsForBooking(booking_id: number): Promise<Payment[]> {
  const viewer = requireUser(['member', 'admin']);
  if (viewer.role === 'member') {
    const booking = await getBooking(booking_id);
    if (!viewer.member_id || booking.member_id !== viewer.member_id) {
      throw new ApiError('FORBIDDEN', 'This is not your booking.');
    }
  }

  let response: Response;
  try {
    response = await fetch(`/api/bookings/${booking_id}/payments`);
  } catch {
    throw new ApiError('VALIDATION', 'Could not load payment history. Check the backend connection and try again.');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('VALIDATION', 'The payment history service returned an invalid response.');
  }

  if (!response.ok || !Array.isArray(data)) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load payment history.';
    throw new ApiError(response.status === 404 ? 'NOT_FOUND' : 'VALIDATION', detail);
  }

  return data as Payment[];
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
