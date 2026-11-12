import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Hourglass } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { getMyTrainerProfile } from '../../api/trainersApi';
import { useAuth } from '../../auth/AuthContext';
import { AttendanceButtons, canMarkAttendance } from '../../components/AttendanceButtons';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus } from '../../types';
import { STATUS_LABEL, bkNumber, fmtDay, kzt, timeOf, toLocal } from '../../utils/format';
import { holdsSlot, liveStatus, statusCounts } from './analytics';
import {
  AVAILABILITY_HINT,
  AVAILABILITY_LABEL,
  readAvailability,
  writeAvailability,
  type Availability,
  type AvailabilityState,
} from './availability';
import { AvailabilityChip, LiveStatusLine } from './common';

const BAR: Record<BookingStatus, string> = {
  pending: 'bg-ink/30',
  confirmed: 'bg-brand',
  completed: 'bg-mint',
  no_show: 'bg-berry',
  cancelled: 'bg-ink/20',
  expired: 'bg-ink/10',
};

/**
 * "Status": where the trainer stands right now.
 *  1. live status from the schedule, 2. own availability, 3. profile approval, 4. a board of booking statuses,
 *  5. the to-do list of sessions still waiting for attendance.
 */
export default function TrainerStatus() {
  const { user } = useAuth();
  const toast = useToast();
  const bookings = useAsync(() => listBookings(), []);
  const profile = useAsync(getMyTrainerProfile, []);
  const [avail, setAvail] = useState<AvailabilityState>(() => readAvailability(user?.trainer_id));

  if (bookings.error) return <ErrorNote message={bookings.error} />;
  if (profile.error) return <ErrorNote message={profile.error} />;
  if (!bookings.data || !profile.data) return <Loading />;

  const all = bookings.data;
  const me = profile.data;
  const live = liveStatus(all);
  const counts = statusCounts(all);
  const total = all.length || 1;
  const waiting = all.filter(canMarkAttendance).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const unpaidAhead = all.filter((b) => b.status === 'pending' && holdsSlot(b)).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const choose = (state: Availability) => setAvail((a) => ({ ...a, state }));
  const save = () => {
    const next = { ...avail, updatedAt: toLocal(new Date()) };
    writeAvailability(user?.trainer_id, next);
    setAvail(next);
    toast.success(`Status saved: ${AVAILABILITY_LABEL[next.state]}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Status" subtitle="Where you stand right now: schedule, availability, profile and open tasks." />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. live */}
        <section className="card">
          <p className="label">Right now</p>
          <LiveStatusLine live={live} />
          <p className="mt-3 text-xs text-ink/50">Based on your schedule and the clock of this page.</p>
        </section>

        {/* 3. profile approval */}
        <section className="card">
          <p className="label">Profile</p>
          <p className="flex items-center gap-2 font-display text-xl font-bold uppercase">
            {me.is_active ? <BadgeCheck className="h-5 w-5 text-mint-dark" /> : <Hourglass className="h-5 w-5 text-ink/60" />}
            {me.is_active ? 'Active' : 'Pending approval'}
          </p>
          <p className="mt-1 text-sm text-ink/70">
            {me.is_active ? 'Members can find and book you.' : 'Your profile is not public yet. Management approves new trainers.'}
          </p>
          <p className="mt-3 text-sm">
            {me.specialization} · <b>{kzt(me.session_price_kzt)}</b> / session
          </p>
        </section>

        {/* open work */}
        <section className="card">
          <p className="label">Open tasks</p>
          <p className="font-display text-4xl font-bold">{waiting.length}</p>
          <p className="text-sm text-ink/70">session{waiting.length === 1 ? '' : 's'} waiting for attendance</p>
          <p className="mt-3 text-sm text-ink/70">
            {unpaidAhead.length} upcoming session{unpaidAhead.length === 1 ? '' : 's'} not paid yet
          </p>
        </section>
      </div>

      {/* 2. availability */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">My availability</h2>
          <AvailabilityChip state={avail.state} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Availability">
          {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={avail.state === s}
              onClick={() => choose(s)}
              className={`rounded-lg border p-4 text-left transition ${avail.state === s ? 'border-brand bg-brand-soft' : 'border-line hover:border-ink/40'}`}
            >
              <span className="block font-display text-base font-bold uppercase">{AVAILABILITY_LABEL[s]}</span>
              <span className="mt-1 block text-xs text-ink/70">{AVAILABILITY_HINT[s]}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="st-note">
              Note for reception (optional)
            </label>
            <input
              id="st-note"
              className="input"
              maxLength={120}
              placeholder="e.g. back at 15:00"
              value={avail.note}
              onChange={(e) => setAvail((a) => ({ ...a, note: e.target.value }))}
            />
          </div>
          <button className="btn-primary" onClick={save}>
            Save status
          </button>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          {avail.updatedAt ? `Last saved ${fmtDay(avail.updatedAt)}, ${timeOf(avail.updatedAt)}. ` : ''}
          Demo: for now this is stored in this browser only. The backend has no availability field yet.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 4. board */}
        <section className="card">
          <h2 className="text-lg font-bold">Session status board</h2>
          <p className="mb-4 text-sm text-ink/60">All your bookings, by where they are in their life.</p>
          <ul className="space-y-3">
            {(Object.keys(STATUS_LABEL) as BookingStatus[]).map((s) => (
              <li key={s}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <StatusBadge status={s} />
                  <span className="font-bold">
                    {counts[s]} <span className="font-normal text-ink/50">· {Math.round((counts[s] / total) * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sun-soft">
                  <div className={`h-full rounded-full ${BAR[s]}`} style={{ width: `${(counts[s] / total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. to-do */}
        <section className="card">
          <h2 className="text-lg font-bold">Needs your attention</h2>
          <p className="mb-4 text-sm text-ink/60">
            Paid sessions from today or earlier that you have not marked yet. Open the <Link to="/trainer/history" className="font-semibold text-brand-dark hover:underline">history</Link> for finished ones.
          </p>
          {waiting.length === 0 ? (
            <EmptyState title="All caught up" text="Every finished session is marked." />
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {waiting.map((b) => (
                <li key={b.booking_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{b.member.full_name}</p>
                    <p className="text-xs text-ink/60">
                      {fmtDay(b.start_time)} · {timeOf(b.start_time)}–{timeOf(b.end_time)} ·{' '}
                      <span className="font-mono">{bkNumber(b.booking_id)}</span>
                    </p>
                  </div>
                  <AttendanceButtons booking={b} onDone={bookings.reload} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
