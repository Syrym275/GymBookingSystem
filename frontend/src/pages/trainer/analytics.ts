import { addDays, eachDayOfInterval, format, startOfWeek } from 'date-fns';
import { CLOSE_HOUR, OPEN_HOUR, TODAY, TODAY_DATE } from '../../config';
import type { BookingStatus, BookingView } from '../../types';
import { addDaysStr, dateOf, hourLabel, hourOf, parseLocal, toDate } from '../../utils/format';

// Pure functions that turn the trainer's own bookings into numbers for the dashboards.
// Nothing here talks to the API, so the same code keeps working when the real backend replaces the mock.

/** A session that really took place (the trainer marked it attended or no-show). */
export const isHeld = (b: BookingView) => b.status === 'completed' || b.status === 'no_show';
/** Everything except cancelled / expired bookings. */
export const isLive = (b: BookingView) => b.status !== 'cancelled' && b.status !== 'expired';
/** Pending + confirmed bookings hold the slot. */
export const holdsSlot = (b: BookingView) => b.status === 'pending' || b.status === 'confirmed';

export interface DateRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string;
}

export const PERIODS = [
  { key: '7d', label: 'Past 7 days', days: 7 },
  { key: '30d', label: 'Past 30 days', days: 30 },
  { key: '90d', label: 'Past 90 days', days: 90 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

/** The last `days` days including today. */
export const lastDays = (days: number): DateRange => ({ from: addDaysStr(TODAY_DATE, -(days - 1)), to: TODAY_DATE });
/** The `days` days right before `range`, for "vs previous period" comparisons. */
export const before = (range: DateRange, days: number): DateRange => ({
  from: addDaysStr(range.from, -days),
  to: addDaysStr(range.from, -1),
});
export const within = (b: BookingView, r: DateRange) => {
  const d = dateOf(b.start_time);
  return d >= r.from && d <= r.to;
};

// ---- period summary --------------------------------------------------------

export interface Summary {
  held: number;
  attended: number;
  noShows: number;
  cancelled: number;
  rate: number | null; // attended / held, null when nothing was held
  clients: number;
  earned: number; // sum of session prices for attended sessions
}

export function summarize(all: BookingView[], r: DateRange): Summary {
  const inRange = all.filter((b) => within(b, r));
  const held = inRange.filter(isHeld);
  const attended = held.filter((b) => b.status === 'completed');
  return {
    held: held.length,
    attended: attended.length,
    noShows: held.length - attended.length,
    cancelled: inRange.filter((b) => b.status === 'cancelled').length,
    rate: held.length ? attended.length / held.length : null,
    clients: new Set(held.map((b) => b.member.full_name)).size,
    earned: attended.reduce((sum, b) => sum + b.price_kzt, 0),
  };
}

export const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

/** "+3 vs previous 7 days", "same as ...", "−2 ..." */
export function deltaText(current: number, previous: number, unit: string): string {
  const d = current - previous;
  if (d === 0) return `same as previous ${unit}`;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} vs previous ${unit}`;
}

// ---- chart series ----------------------------------------------------------

export interface Bucket {
  key: string;
  label: string;
  attended: number;
  noShows: number;
  total: number;
}

/** One bucket per day in the range. */
export function dailyBuckets(all: BookingView[], r: DateRange): Bucket[] {
  const days = eachDayOfInterval({ start: parseLocal(r.from), end: parseLocal(r.to) });
  const short = days.length <= 8;
  const map = new Map<string, Bucket>();
  for (const d of days) {
    const key = toDate(d);
    map.set(key, { key, label: format(d, short ? 'EEE d' : 'd MMM'), attended: 0, noShows: 0, total: 0 });
  }
  for (const b of all) {
    if (!isHeld(b)) continue;
    const x = map.get(dateOf(b.start_time));
    if (!x) continue;
    if (b.status === 'completed') x.attended += 1;
    else x.noShows += 1;
    x.total += 1;
  }
  return [...map.values()];
}

/** One bucket per Monday-start week that touches the range. */
export function weeklyBuckets(all: BookingView[], r: DateRange): Bucket[] {
  const first = startOfWeek(parseLocal(r.from), { weekStartsOn: 1 });
  const last = startOfWeek(parseLocal(r.to), { weekStartsOn: 1 });
  const out: Bucket[] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) {
    const from = toDate(d);
    const to = toDate(addDays(d, 6));
    const inWeek = all.filter((b) => isHeld(b) && within(b, r) && dateOf(b.start_time) >= from && dateOf(b.start_time) <= to);
    const attended = inWeek.filter((b) => b.status === 'completed').length;
    out.push({ key: from, label: format(d, 'd MMM'), attended, noShows: inWeek.length - attended, total: inWeek.length });
  }
  return out;
}

/** The last `weeks` weeks ending with the current one (for the trend line). */
export function weeklyTrend(all: BookingView[], weeks = 8): Bucket[] {
  const lastStart = startOfWeek(parseLocal(TODAY_DATE), { weekStartsOn: 1 });
  const firstStart = addDays(lastStart, -7 * (weeks - 1));
  return weeklyBuckets(all, { from: toDate(firstStart), to: toDate(addDays(lastStart, 6)) });
}

export interface HourBucket {
  hour: number;
  label: string;
  count: number;
}

export function hourBuckets(all: BookingView[], r: DateRange): HourBucket[] {
  const counts = new Map<number, number>();
  for (const b of all) if (isHeld(b) && within(b, r)) counts.set(hourOf(b.start_time), (counts.get(hourOf(b.start_time)) ?? 0) + 1);
  const out: HourBucket[] = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) out.push({ hour: h, label: hourLabel(h), count: counts.get(h) ?? 0 });
  return out;
}

export function statusCounts(all: BookingView[]): Record<BookingStatus, number> {
  const out: Record<BookingStatus, number> = { pending: 0, confirmed: 0, completed: 0, no_show: 0, cancelled: 0, expired: 0 };
  for (const b of all) out[b.status] += 1;
  return out;
}

// ---- clients ---------------------------------------------------------------

export type ClientLabel = 'At risk' | 'Regular' | 'New' | 'Active' | 'Inactive';

export interface ClientRow {
  name: string;
  held: number;
  attended: number;
  noShows: number;
  rate: number | null;
  first: string | null; // first held session
  last: string | null; // latest held session
  next: string | null; // next upcoming booking
  earned: number;
  label: ClientLabel;
  sessions: BookingView[]; // every live booking with this client, newest first
}

/**
 * Groups the trainer's bookings by client. The API deliberately gives a trainer only the member's full name
 * (no id, phone or email), so the name is the grouping key. Two clients with the same name would be merged:
 * a real backend should send an opaque client id for this.
 *
 * Labels: At risk = 3+ sessions and 30%+ no-shows; Regular = 3+ sessions in the last 30 days;
 * New = at most 2 sessions and the first one in the last 30 days (or none held yet);
 * Inactive = nothing in 30 days and nothing booked; otherwise Active.
 */
export function groupClients(all: BookingView[]): ClientRow[] {
  const by = new Map<string, BookingView[]>();
  for (const b of all) {
    if (!isLive(b)) continue;
    const key = b.member.full_name;
    by.set(key, [...(by.get(key) ?? []), b]);
  }
  const recent = lastDays(30);
  const rows: ClientRow[] = [];
  for (const [name, sessions] of by) {
    sessions.sort((a, b) => b.start_time.localeCompare(a.start_time));
    const held = sessions.filter(isHeld);
    const attended = held.filter((b) => b.status === 'completed');
    const upcoming = sessions.filter((b) => holdsSlot(b) && b.start_time >= TODAY).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const recentHeld = held.filter((b) => within(b, recent)).length;
    const noShows = held.length - attended.length;
    const firstHeld = held.length ? held[held.length - 1] : null;

    let label: ClientLabel = 'Active';
    if (held.length >= 3 && noShows / held.length >= 0.3) label = 'At risk';
    else if (recentHeld >= 3) label = 'Regular';
    else if (held.length <= 2 && (!firstHeld || within(firstHeld, recent))) label = 'New';
    else if (recentHeld === 0 && upcoming.length === 0) label = 'Inactive';

    rows.push({
      name,
      held: held.length,
      attended: attended.length,
      noShows,
      rate: held.length ? attended.length / held.length : null,
      first: firstHeld ? firstHeld.start_time : null,
      last: held.length ? held[0].start_time : null,
      next: upcoming.length ? upcoming[0].start_time : null,
      earned: attended.reduce((sum, b) => sum + b.price_kzt, 0),
      label,
      sessions,
    });
  }
  return rows.sort((a, b) => b.held - a.held || a.name.localeCompare(b.name));
}

// ---- live status -----------------------------------------------------------

export interface LiveStatus {
  current: BookingView | null; // a session running right now
  next: BookingView | null; // the next one that holds a slot
  todayLeft: number; // sessions still to come today
}

export function liveStatus(all: BookingView[]): LiveStatus {
  const active = all.filter(holdsSlot).sort((a, b) => a.start_time.localeCompare(b.start_time));
  return {
    current: active.find((b) => b.start_time <= TODAY && TODAY < b.end_time) ?? null,
    next: active.find((b) => b.start_time > TODAY) ?? null,
    todayLeft: active.filter((b) => dateOf(b.start_time) === TODAY_DATE && b.start_time > TODAY).length,
  };
}
