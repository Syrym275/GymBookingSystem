import type { Booking, BookingStatus, BookingType, BookingView } from '../types';
import { CLOSE_HOUR, OPEN_HOUR, TODAY_DATE } from '../config';
import { getDb, saveDb } from '../mock/db';
import {
  bkNumber,
  dateOf,
  isBlocking,
  isPaidStatus,
  mk,
  overlaps,
} from '../utils/format';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import { toView } from './views';

export interface BookingFilters {
  from?: string; // date
  to?: string; // date
  statuses?: BookingStatus[];
  paid?: 'paid' | 'unpaid' | '';
  type?: BookingType | '';
  trainer_id?: number;
  hall_id?: number;
  member_id?: number;
  q?: string; // member name, phone or BK number
}

export interface NewBookingInput {
  booking_type: BookingType;
  member_id?: number; // receptionist / admin only; members always book for themselves
  trainer_id?: number;
  hall_id?: number;
  start_time: string;
  end_time: string;
}

export interface BackendBooking extends Booking {
  payment_expires_at: string | null;
}

export function backendBookingToView(booking: BackendBooking): BookingView {
  const db = getDb();
  const member = db.members.find(
    (item) => item.member_id === booking.member_id,
  );
  const trainer = db.trainers.find(
    (item) => item.trainer_id === booking.trainer_id,
  );
  const hall = db.halls.find(
    (item) => item.hall_id === booking.hall_id,
  );

  return {
    ...booking,
    member_id: booking.member_id,
    member: {
      member_id: booking.member_id,
      full_name: member?.full_name ?? 'Member',
    },
    trainer_name: trainer?.full_name ?? null,
    hall_name: hall?.hall_name ?? null,
    paid: ['confirmed', 'completed', 'no_show'].includes(booking.status),
  };
}

export async function listBookings(f: BookingFilters = {}): Promise<BookingView[]> {
    const current = requireUser();

  if (current.role === 'member' && current.member_id) {
    const response = await fetch(
      `/api/bookings?member_id=${current.member_id}`,
    );

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        'VALIDATION',
        typeof data.detail === 'string'
          ? data.detail
          : 'Could not load bookings.',
      );
    }

    let rows = (data as BackendBooking[]).map(backendBookingToView);

    if (f.from) {
      rows = rows.filter((booking) => dateOf(booking.start_time) >= f.from!);
    }

    if (f.to) {
      rows = rows.filter((booking) => dateOf(booking.start_time) <= f.to!);
    }

    if (f.statuses?.length) {
      rows = rows.filter((booking) =>
        f.statuses!.includes(booking.status),
      );
    }

    if (f.type) {
      rows = rows.filter(
        (booking) => booking.booking_type === f.type,
      );
    }

    if (f.paid === 'paid') {
      rows = rows.filter((booking) => booking.paid);
    }

    if (f.paid === 'unpaid') {
      rows = rows.filter((booking) => booking.status === 'pending');
    }

    rows.sort(
      (a, b) =>
        a.start_time.localeCompare(b.start_time) ||
        a.booking_id - b.booking_id,
    );

    return rows;
  }
  await delay();
  const viewer = requireUser();
  const db = getDb();
  const canSeePhone = viewer.role === 'receptionist' || viewer.role === 'admin';
  const q = (f.q ?? '').trim().toLowerCase();

  const rows = db.bookings.filter((b) => {
    if (viewer.role === 'member' && b.member_id !== viewer.member_id) return false;
    if (viewer.role === 'trainer' && !(b.booking_type === 'training' && b.trainer_id === viewer.trainer_id)) return false;
    if (f.from && dateOf(b.start_time) < f.from) return false;
    if (f.to && dateOf(b.start_time) > f.to) return false;
    if (f.statuses && f.statuses.length && !f.statuses.includes(b.status)) return false;
    if (f.paid === 'paid' && !isPaidStatus(b.status)) return false;
    if (f.paid === 'unpaid' && b.status !== 'pending') return false;
    if (f.type && b.booking_type !== f.type) return false;
    if (f.trainer_id && b.trainer_id !== f.trainer_id) return false;
    if (f.hall_id && b.hall_id !== f.hall_id) return false;
    if (f.member_id && viewer.role !== 'trainer' && b.member_id !== f.member_id) return false;
    if (q) {
      const m = db.members.find((x) => x.member_id === b.member_id)!;
      const hit =
        bkNumber(b.booking_id).toLowerCase().includes(q) ||
        String(b.booking_id) === q ||
        m.full_name.toLowerCase().includes(q) ||
        (canSeePhone && m.phone.includes(q.replace(/\s/g, '')));
      if (!hit) return false;
    }
    return true;
  });

  rows.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.booking_id - b.booking_id);
  return clone(rows.map((b) => toView(b, viewer)));
}

export async function getBooking(id: number): Promise<BookingView> {
  const response = await fetch(`/api/bookings/${id}`);
  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? 'NOT_FOUND' : 'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : 'Could not load booking.',
    );
  }

  return backendBookingToView(data as BackendBooking);
}

/** Hours (07..21) whose [h, h+1) window is blocked for a trainer or hall on a date. */
export async function getTakenHours(kind: 'trainer' | 'hall', id: number, date: string): Promise<number[]> {
  await delay();
  requireUser();
  const db = getDb();
  const taken: number[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const s = mk(date, h);
    const e = mk(date, h + 1);
    const busy = db.bookings.some(
      (b) =>
        isBlocking(b.status) &&
        (kind === 'trainer' ? b.trainer_id === id : b.hall_id === id) &&
        overlaps(b.start_time, b.end_time, s, e),
    );
    if (busy) taken.push(h);
  }
  return taken;
}

// ---- internal helpers ------------------------------------------------------

function resourceBusy(
  type: BookingType,
  resourceId: number,
  start: string,
  end: string,
  ignoreId?: number,
): boolean {
  return getDb().bookings.some(
    (b) =>
      b.booking_id !== ignoreId &&
      isBlocking(b.status) &&
      (type === 'training' ? b.trainer_id === resourceId : b.hall_id === resourceId) &&
      overlaps(b.start_time, b.end_time, start, end),
  );
}

function memberBusy(memberId: number, start: string, end: string, ignoreId?: number): boolean {
  return getDb().bookings.some(
    (b) =>
      b.booking_id !== ignoreId &&
      b.member_id === memberId &&
      isBlocking(b.status) &&
      overlaps(b.start_time, b.end_time, start, end),
  );
}

// ---- writes ----------------------------------------------------------------

export async function createBooking(
  input: NewBookingInput,
): Promise<BookingView> {
  const viewer = requireUser(['member', 'receptionist', 'admin']);

  const memberId =
    viewer.role === 'member'
      ? viewer.member_id
      : input.member_id;

  if (!memberId) {
    throw new ApiError('VALIDATION', 'Please choose a member first.');
  }

  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      member_id: memberId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const code =
      response.status === 409
        ? '23P01'
        : response.status === 404
          ? 'NOT_FOUND'
          : 'VALIDATION';

    throw new ApiError(
      code,
      typeof data.detail === 'string'
        ? data.detail
        : 'Could not create booking.',
    );
  }

  return backendBookingToView(data as BackendBooking);
}


export async function cancelBooking(id: number): Promise<BookingView> {
  const response = await fetch(`/api/bookings/${id}/cancel`, {
    method: 'POST',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? 'NOT_FOUND' : 'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : 'Could not cancel booking.',
    );
  }

  return backendBookingToView(data as BackendBooking);
}
  

export async function markAttendance(id: number, status: 'completed' | 'no_show'): Promise<BookingView> {
  await delay();
  const viewer = requireUser(['trainer', 'receptionist', 'admin']);
  const b = getDb().bookings.find((x) => x.booking_id === id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'trainer' && b.trainer_id !== viewer.trainer_id) throw new ApiError('FORBIDDEN', 'This is not your session.');
  if (b.status !== 'confirmed') throw new ApiError('VALIDATION', 'Only paid (confirmed) bookings can be checked in.');
  if (dateOf(b.start_time) > TODAY_DATE) throw new ApiError('VALIDATION', 'Attendance can only be marked for sessions today or earlier.');
  b.status = status;
  saveDb();
  return clone(toView(b, viewer));
}

/** Admin override of a booking status. Re-activating a booking re-checks overlaps. */
export async function setBookingStatus(id: number, status: BookingStatus): Promise<BookingView> {
  await delay();
  const viewer = requireUser(['admin']);
  const db = getDb();
  const b = db.bookings.find((x) => x.booking_id === id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (isBlocking(status) && !isBlocking(b.status)) {
    const type = b.booking_type;
    const rid = (type === 'training' ? b.trainer_id : b.hall_id) as number;
    if (resourceBusy(type, rid, b.start_time, b.end_time, b.booking_id) || memberBusy(b.member_id, b.start_time, b.end_time, b.booking_id)) {
      throw new ApiError('23P01', 'This slot was just taken');
    }
  }
  if (status === 'cancelled' && b.status === 'confirmed') {
    db.payments.forEach((p) => {
      if (p.booking_id === b.booking_id && p.payment_status === 'approved') p.payment_status = 'refunded';
    });
  }
  b.status = status;
  saveDb();
  return clone(toView(b, viewer));
}

/** Called when the 15-minute payment hold runs out: releases the slot. */
export async function expireBooking(id: number): Promise<void> {
  const response = await fetch(`/api/bookings/${id}/expire`, {
    method: 'POST',
  });

  if (!response.ok) {
    const data = await response.json();

    throw new ApiError(
      'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : 'Could not expire booking.',
    );
  }
}
