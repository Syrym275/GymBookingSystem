import type { Booking, BookingStatus, BookingType, BookingView } from '../types';
import { CLOSE_HOUR, MAX_PENDING, OPEN_HOUR, TODAY, TODAY_DATE } from '../config';
import { getDb, nextId, saveDb } from '../mock/db';
import {
  addMinutesStr,
  bkNumber,
  dateOf,
  fmtDate,
  isBlocking,
  isPaidStatus,
  minutesBetween,
  mk,
  overlaps,
  timeOf,
} from '../utils/format';
import { ApiError, type Suggestion } from './ApiError';
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

export async function listBookings(f: BookingFilters = {}): Promise<BookingView[]> {
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
  await delay();
  const viewer = requireUser();
  const b = getDb().bookings.find((x) => x.booking_id === id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'member' && b.member_id !== viewer.member_id) throw new ApiError('FORBIDDEN', 'This is not your booking.');
  if (viewer.role === 'trainer' && b.trainer_id !== viewer.trainer_id) throw new ApiError('FORBIDDEN', 'This is not your session.');
  return clone(toView(b, viewer));
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

function freeWindows(
  type: BookingType,
  resourceId: number,
  memberId: number,
  date: string,
  durationMin: number,
  limit = 4,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR && out.length < limit; h++) {
    const start = mk(date, h);
    const end = addMinutesStr(start, durationMin);
    if (dateOf(end) !== date || timeOf(end) > `${CLOSE_HOUR}:00`) break;
    if (start < TODAY) continue;
    if (resourceBusy(type, resourceId, start, end) || memberBusy(memberId, start, end)) continue;
    out.push({ start_time: start, end_time: end });
  }
  return out;
}

// ---- writes ----------------------------------------------------------------

export async function createBooking(input: NewBookingInput): Promise<BookingView> {
  await delay();
  const viewer = requireUser(['member', 'receptionist', 'admin']);
  const db = getDb();

  const memberId = viewer.role === 'member' ? viewer.member_id : input.member_id;
  const member = db.members.find((m) => m.member_id === memberId);
  if (!member) throw new ApiError('NOT_FOUND', 'Please choose a member first.');

  const { booking_type, start_time, end_time } = input;
  const fmt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!fmt.test(start_time) || !fmt.test(end_time)) throw new ApiError('VALIDATION', 'Invalid date or time.');

  // Rule 1: opening hours, one day, end > start
  const date = dateOf(start_time);
  if (dateOf(end_time) !== date) throw new ApiError('VALIDATION', 'A booking must start and end on the same day.');
  const mins = minutesBetween(start_time, end_time);
  if (mins <= 0) throw new ApiError('VALIDATION', 'The end time must be after the start time.');
  if (timeOf(start_time) < `0${OPEN_HOUR}:00` || timeOf(end_time) > `${CLOSE_HOUR}:00`) {
    throw new ApiError('VALIDATION', `We are open ${OPEN_HOUR}:00 - ${CLOSE_HOUR}:00 only.`.replace(' 7:00', ' 07:00'));
  }
  if (start_time < TODAY) throw new ApiError('VALIDATION', 'That time has already passed.');

  let price = 0;
  let trainer_id: number | null = null;
  let hall_id: number | null = null;
  let resourceId = 0;

  if (booking_type === 'training') {
    // Rule 2: exactly 60 min, on the hour
    if (mins !== 60 || !timeOf(start_time).endsWith(':00')) {
      throw new ApiError('VALIDATION', 'A training session is exactly 60 minutes and starts on the hour.');
    }
    const t = db.trainers.find((x) => x.trainer_id === input.trainer_id);
    if (!t) throw new ApiError('NOT_FOUND', 'Trainer not found.');
    if (!t.is_active) throw new ApiError('VALIDATION', 'This trainer is not taking bookings.');
    price = t.session_price_kzt; // Rule 4: price frozen at booking time
    trainer_id = t.trainer_id;
    resourceId = t.trainer_id;
  } else {
    const h = db.halls.find((x) => x.hall_id === input.hall_id);
    if (!h) throw new ApiError('NOT_FOUND', 'Hall not found.');
    if (!h.is_active) throw new ApiError('VALIDATION', 'This hall is not available for rent.');
    price = Math.round((h.hourly_rate_kzt * mins) / 60); // Rule 3
    hall_id = h.hall_id;
    resourceId = h.hall_id;
  }

  // Rule 7: membership valid on the booking date
  if (date > member.membership_expires_on) {
    throw new ApiError(
      'GB002',
      `Membership is not valid on ${fmtDate(date)} (it ends ${fmtDate(member.membership_expires_on)}).`,
    );
  }

  // Rule 6: max 2 unpaid
  const pendingCount = db.bookings.filter((b) => b.member_id === member.member_id && b.status === 'pending').length;
  if (pendingCount >= MAX_PENDING) {
    throw new ApiError('GB001', `There are already ${MAX_PENDING} unpaid bookings. Pay or cancel one before booking another.`);
  }

  // Rule 5: no overlap (trainer / hall / member), half-open ranges
  if (resourceBusy(booking_type, resourceId, start_time, end_time) || memberBusy(member.member_id, start_time, end_time)) {
    throw new ApiError('23P01', 'This slot was just taken', freeWindows(booking_type, resourceId, member.member_id, date, mins));
  }

  const booking: Booking = {
    booking_id: nextId('booking'),
    member_id: member.member_id,
    booking_type,
    trainer_id,
    hall_id,
    start_time,
    end_time,
    status: 'pending',
    price_kzt: price,
    created_at: TODAY,
  };
  db.bookings.push(booking);
  saveDb();
  return clone(toView(booking, viewer));
}

export async function cancelBooking(id: number): Promise<BookingView> {
  await delay();
  const viewer = requireUser(['member', 'receptionist', 'admin']);
  const db = getDb();
  const b = db.bookings.find((x) => x.booking_id === id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'member' && b.member_id !== viewer.member_id) throw new ApiError('FORBIDDEN', 'This is not your booking.');
  if (viewer.role === 'receptionist' && b.status !== 'pending') {
    throw new ApiError('FORBIDDEN', 'Reception can only cancel unpaid (pending) bookings.');
  }
  if (!isBlocking(b.status)) throw new ApiError('VALIDATION', 'Only pending or confirmed bookings can be cancelled.');
  if (b.start_time < TODAY) throw new ApiError('VALIDATION', 'Past bookings cannot be cancelled.');

  if (b.status === 'confirmed') {
    db.payments.forEach((p) => {
      if (p.booking_id === b.booking_id && p.payment_status === 'approved') p.payment_status = 'refunded';
    });
  }
  b.status = 'cancelled';
  saveDb();
  return clone(toView(b, viewer));
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
  await delay();
  const viewer = requireUser(['member', 'admin']);
  const b = getDb().bookings.find((x) => x.booking_id === id);
  if (!b) throw new ApiError('NOT_FOUND', 'Booking not found.');
  if (viewer.role === 'member' && b.member_id !== viewer.member_id) throw new ApiError('FORBIDDEN', 'This is not your booking.');
  if (b.status === 'pending') {
    b.status = 'expired';
    saveDb();
  }
}
