import type { Booking, BookingStatus, BookingType, BookingView } from '../types';
import { TODAY_DATE } from '../config';
import { getDb, saveDb } from '../mock/db';
import {
  bkNumber,
  dateOf,
  isBlocking,
  isPaidStatus,
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
  member_name?: string | null;
  member_phone?: string | null;
  member_membership_plan?: BookingView['member']['membership_plan'] | null;
  member_membership_expires_on?: string | null;
  trainer_name?: string | null;
  hall_name?: string | null;
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
      full_name: booking.member_name ?? member?.full_name ?? 'Member',
      phone: booking.member_phone ?? member?.phone,
      membership_plan: booking.member_membership_plan ?? member?.membership_plan,
      membership_expires_on: booking.member_membership_expires_on ?? member?.membership_expires_on,
    },
    trainer_name: booking.trainer_name ?? trainer?.full_name ?? null,
    hall_name: booking.hall_name ?? hall?.hall_name ?? null,
    paid: ['confirmed', 'completed', 'no_show'].includes(booking.status),
  };
}

export async function listBookings(f: BookingFilters = {}): Promise<BookingView[]> {
    const current = requireUser();

  if ((current.role === 'member' && current.member_id) || current.role === 'receptionist') {
    const memberQuery = current.role === 'member' ? `?member_id=${current.member_id}` : '';
    const response = await fetch(`/api/bookings${memberQuery}`);

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

    if (f.trainer_id) rows = rows.filter((booking) => booking.trainer_id === f.trainer_id);
    if (f.hall_id) rows = rows.filter((booking) => booking.hall_id === f.hall_id);
    if (f.member_id) rows = rows.filter((booking) => booking.member_id === f.member_id);
    if (f.q?.trim()) {
      const needle = f.q.trim().toLowerCase();
      rows = rows.filter((booking) =>
        bkNumber(booking.booking_id).toLowerCase().includes(needle) ||
        String(booking.booking_id) === needle ||
        booking.member.full_name.toLowerCase().includes(needle) ||
        (booking.member.phone ?? '').replace(/\s/g, '').includes(needle.replace(/\s/g, '')),
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
export async function getTakenHours(kind: 'trainer' | 'hall', id: number, date: string, memberId?: number): Promise<number[]> {
  const viewer = requireUser();
  const params = new URLSearchParams({
    booking_type: kind === 'trainer' ? 'training' : 'hall_rental',
    resource_id: String(id),
    date,
  });
  const effectiveMemberId = memberId ?? (viewer.role === 'member' ? viewer.member_id : undefined);
  if (effectiveMemberId) params.set('member_id', String(effectiveMemberId));
  let response: Response;
  try {
    response = await fetch(`/api/bookings/availability?${params}`);
  } catch {
    throw new ApiError('VALIDATION', 'Could not load availability. Check the backend connection and try again.');
  }
  let data: { detail?: unknown; taken_hours?: number[] };
  try {
    data = await response.json();
  } catch {
    throw new ApiError('VALIDATION', 'The availability service returned an invalid response.');
  }
  if (!response.ok) {
    throw new ApiError('VALIDATION', typeof data.detail === 'string' ? data.detail : 'Could not load availability.');
  }
  return Array.isArray(data.taken_hours) ? data.taken_hours : [];
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
    const detail = typeof data.detail === 'string' ? data.detail : 'Could not create booking.';
    const normalizedDetail = detail.toLowerCase();
    const code = response.status === 404
      ? 'NOT_FOUND'
      : response.status === 409 && normalizedDetail.includes('unpaid')
        ? 'GB001'
        : response.status === 409 && normalizedDetail.includes('membership')
          ? 'GB002'
          : response.status === 409
            ? '23P01'
            : 'VALIDATION';

    throw new ApiError(code, detail);
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
  const viewer = requireUser(['trainer', 'receptionist', 'admin']);
  if (viewer.role === 'receptionist') {
    const response = await fetch(`/api/bookings/${id}/attendance?status=${status}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(
        response.status === 404 ? 'NOT_FOUND' : 'VALIDATION',
        typeof data.detail === 'string' ? data.detail : 'Could not update attendance.',
      );
    }
    return backendBookingToView(data as BackendBooking);
  }
  await delay();
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
