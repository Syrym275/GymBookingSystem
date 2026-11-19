import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import type { BookingView } from '../types';
import { OPEN_HOUR, CLOSE_HOUR, TODAY_DATE } from '../config';
import { getDb } from '../mock/db';
import { dateOf, hourLabel, hourOf, parseLocal, toDate } from '../utils/format';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import { listBookings } from './bookingsApi';
import { api, withQuery } from './http';

export interface HourCount {
  hour: number;
  label: string;
  count: number;
}

const hourBuckets = (counts: Map<number, number>): HourCount[] => {
  const out: HourCount[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) out.push({ hour: h, label: hourLabel(h), count: counts.get(h) ?? 0 });
  return out;
};

const weekOf = (date: string) => {
  const d = parseLocal(date);
  return { from: toDate(startOfWeek(d, { weekStartsOn: 1 })), to: toDate(endOfWeek(d, { weekStartsOn: 1 })) };
};

// ---- trainer ---------------------------------------------------------------

export interface TrainerStats {
  sessions_week: number;
  sessions_month: number;
  unique_students: number;
  completed: number;
  no_show: number;
  hours: HourCount[];
}

/** Trainer's own numbers. Only counts - no member identities leave the "server". */
export async function trainerStats(): Promise<TrainerStats> {
  await delay();
  const viewer = requireUser(['trainer']);
  const mine = getDb().bookings.filter((b) => b.booking_type === 'training' && b.trainer_id === viewer.trainer_id);
  const live = mine.filter((b) => b.status !== 'cancelled' && b.status !== 'expired');
  const w = weekOf(TODAY_DATE);
  const monthFrom = toDate(startOfMonth(parseLocal(TODAY_DATE)));
  const monthTo = toDate(endOfMonth(parseLocal(TODAY_DATE)));
  const hours = new Map<number, number>();
  live.forEach((b) => hours.set(hourOf(b.start_time), (hours.get(hourOf(b.start_time)) ?? 0) + 1));
  return {
    sessions_week: live.filter((b) => dateOf(b.start_time) >= w.from && dateOf(b.start_time) <= w.to).length,
    sessions_month: live.filter((b) => dateOf(b.start_time) >= monthFrom && dateOf(b.start_time) <= monthTo).length,
    unique_students: new Set(live.map((b) => b.member_id)).size,
    completed: mine.filter((b) => b.status === 'completed').length,
    no_show: mine.filter((b) => b.status === 'no_show').length,
    hours: hourBuckets(hours),
  };
}

// ---- admin -----------------------------------------------------------------

export interface Overview {
  bookings_week: number;
  confirmed_week: number;
  pending_week: number;
  revenue_30d: number;
  no_show_rate: number; // 0..1
  busiest_day: string;
  busiest_hour: string;
  by_weekday: { day: string; count: number }[];
  by_hour: HourCount[];
}

/** Admin home numbers: this week, revenue of the last 30 days, no-show rate, busiest day and hour. */
export async function overview(): Promise<Overview> {
  requireUser(['admin']);
  return api<Overview>('/admin/overview', 'Could not load the overview.');
}

export interface TrainerReportRow {
  trainer_id: number;
  trainer_name: string;
  sessions: number; // completed + no_show
  evening: number; // start >= 17:00
  before_17: number;
  no_shows: number;
}

/** Sessions that actually took place (completed or no_show) in the date range. */
export async function popularTrainers(from: string, to: string): Promise<TrainerReportRow[]> {
  requireUser(['admin']);
  return api<TrainerReportRow[]>(withQuery('/admin/reports/trainers', { from, to }), 'Could not load the trainer report.');
}

export async function popularHours(from: string, to: string): Promise<HourCount[]> {
  requireUser(['admin']);
  return api<HourCount[]>(withQuery('/admin/reports/hours', { from, to }), 'Could not load the hours report.');
}

export interface UnpaidGroup {
  member_id: number;
  full_name: string;
  phone: string;
  membership_expires_on: string;
  bookings: BookingView[];
}

/** Pending bookings grouped by member (reception + admin). */
export async function unpaidMembers(): Promise<UnpaidGroup[]> {
  requireUser(['receptionist', 'admin']);
  const pending = await listBookings({ paid: 'unpaid' });
  const groups = new Map<number, UnpaidGroup>();
  pending
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .forEach((booking) => {
      const memberId = booking.member_id ?? booking.member.member_id;
      if (memberId === undefined) return;
      const group = groups.get(memberId) ?? {
        member_id: memberId,
        full_name: booking.member.full_name,
        phone: booking.member.phone ?? '',
        membership_expires_on: booking.member.membership_expires_on ?? '',
        bookings: [],
      };
      group.bookings.push(booking);
      groups.set(memberId, group);
    });
  return clone([...groups.values()].sort((a, b) => b.bookings.length - a.bookings.length || a.full_name.localeCompare(b.full_name)));
}
