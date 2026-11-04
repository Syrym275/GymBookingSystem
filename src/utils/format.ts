import { addDays, addMinutes, differenceInCalendarDays, format } from 'date-fns';
import { TODAY_DATE } from '../config';
import type { BookingStatus, MembershipPlan } from '../types';

// All datetimes are plain local strings "YYYY-MM-DDTHH:mm" - never converted between zones.

export const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const bkNumber = (id: number) => `BK-${pad(id, 4)}`;

export const kzt = (n: number) =>
  `${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`;

export const dateOf = (s: string) => s.slice(0, 10);
export const timeOf = (s: string) => s.slice(11, 16);
export const hourOf = (s: string) => parseInt(s.slice(11, 13), 10);
export const mk = (date: string, hour: number) => `${date}T${pad(hour)}:00`;

export const parseLocal = (s: string) => new Date(s.length === 10 ? `${s}T00:00` : s);
export const toLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
export const toDate = (d: Date) => format(d, 'yyyy-MM-dd');

export const fmtDate = (s: string) => format(parseLocal(s), 'EEE, d MMM yyyy');
export const fmtDay = (s: string) => format(parseLocal(s), 'EEE d MMM');
export const fmtRange = (start: string, end: string) =>
  `${fmtDay(start)} · ${timeOf(start)}–${timeOf(end)}`;
export const fmtDateTime = (s: string) => `${fmtDay(s)}, ${timeOf(s)}`;

export const addDaysStr = (date: string, n: number) => toDate(addDays(parseLocal(date), n));
export const addMinutesStr = (dt: string, n: number) => toLocal(addMinutes(parseLocal(dt), n));
export const minutesBetween = (a: string, b: string) =>
  Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 60000);

/** Half-open [start, end) overlap: existing.start < new.end AND new.start < existing.end. */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd && bStart < aEnd;

export const hourLabel = (h: number) => `${pad(h)}:00`;

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
export const ALL_STATUSES = Object.keys(STATUS_LABEL) as BookingStatus[];

export const PLAN_LABEL: Record<MembershipPlan, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

/** Only pending + confirmed bookings block a slot. */
export const isBlocking = (s: BookingStatus) => s === 'pending' || s === 'confirmed';
/** Paid = confirmed and everything that followed a confirmation. */
export const isPaidStatus = (s: BookingStatus) =>
  s === 'confirmed' || s === 'completed' || s === 'no_show';

export interface MembershipState {
  state: 'active' | 'expiring' | 'expired';
  daysLeft: number;
}
export function membershipState(expiresOn: string): MembershipState {
  const daysLeft = differenceInCalendarDays(parseLocal(expiresOn), parseLocal(TODAY_DATE));
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= 7) return { state: 'expiring', daysLeft };
  return { state: 'active', daysLeft };
}
