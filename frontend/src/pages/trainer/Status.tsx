import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Hourglass } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { getMyAvailability, getMyTrainerProfile, updateMyAvailability } from '../../api/trainersApi';
import { AttendanceButtons, canMarkAttendance } from '../../components/AttendanceButtons';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus } from '../../types';
import { STATUS_LABEL, bkNumber, fmtDay, kzt, timeOf } from '../../utils/format';
import { holdsSlot, liveStatus, statusCounts } from './analytics';
import {
  AVAILABILITY_HINT,
  AVAILABILITY_LABEL,
  type Availability,
  type AvailabilityState,
} from './availability';
import { AvailabilityChip, LiveStatusLine } from './common';
import { useT } from '../../i18n';
import { specializationLabel } from '../../data/gymData';

const BAR: Record<BookingStatus, string> = {
  pending: 'bg-ink/30',
  confirmed: 'bg-brand',
  completed: 'bg-mint',
  no_show: 'bg-berry',
  cancelled: 'bg-ink/20',
  expired: 'bg-ink/10',
};

function localDateTimeInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * "Status": where the trainer stands right now.
 *  1. live status from the schedule, 2. own availability, 3. profile approval, 4. a board of booking statuses,
 *  5. the to-do list of sessions still waiting for attendance.
 */
export default function TrainerStatus() {
  const { t, tp } = useT();
  const toast = useToast();
  const bookings = useAsync(() => listBookings(), []);
  const profile = useAsync(getMyTrainerProfile, []);
  const availability = useAsync(getMyAvailability, []);
  const [avail, setAvail] = useState<AvailabilityState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (availability.data) setAvail(availability.data);
  }, [availability.data]);

  if (bookings.error) return <ErrorNote message={bookings.error} />;
  if (profile.error) return <ErrorNote message={profile.error} />;
  if (availability.error) return <ErrorNote message={availability.error} />;
  if (!bookings.data || !profile.data || !availability.data) return <Loading />;
  if (!avail) return <Loading />;

  const all = bookings.data;
  const me = profile.data;
  const live = liveStatus(all);
  const counts = statusCounts(all);
  const total = all.length || 1;
  const waiting = all.filter(canMarkAttendance).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const unpaidAhead = all.filter((b) => b.status === 'pending' && holdsSlot(b)).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const choose = (state: Availability) => setAvail((a) => (a ? { ...a, state } : a));
  const save = async () => {
    if (!avail) return;
    setSaving(true);
    try {
      const saved = await updateMyAvailability({
        state: avail.state,
        note: avail.note,
        breakUntil: avail.state === 'break' ? avail.breakUntil : null,
      });
      setAvail(saved);
      toast.success(t('status.saved', { state: AVAILABILITY_LABEL[saved.state] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('status.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.status')} subtitle={t('status.sub')} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. live */}
        <section className="card">
          <p className="label">{t('tdash.now')}</p>
          <LiveStatusLine live={live} />
          <p className="mt-3 text-xs text-ink/50">{t('status.based')}</p>
        </section>

        {/* 3. profile approval */}
        <section className="card">
          <p className="label">{t('profile.title')}</p>
          <p className="flex items-center gap-2 font-display text-xl font-bold uppercase">
            {me.is_active ? <BadgeCheck className="h-5 w-5 text-mint-dark" /> : <Hourglass className="h-5 w-5 text-ink/60" />}
            {me.is_active ? t('profile.active') : t('tdash.pending')}
          </p>
          <p className="mt-1 text-sm text-ink/70">
            {me.is_active ? t('status.public') : t('status.notPublic')}
          </p>
          <p className="mt-3 text-sm">
            {specializationLabel(me.specialization)} · <b>{kzt(me.session_price_kzt)}</b> {t('landing.perSession')}
          </p>
        </section>

        {/* open work */}
        <section className="card">
          <p className="label">{t('status.open')}</p>
          <p className="font-display text-4xl font-bold">{waiting.length}</p>
          <p className="text-sm text-ink/70">{t('status.waiting')}</p>
          <p className="mt-3 text-sm text-ink/70">
            {t('status.unpaidAhead', { sessions: tp('unit.sessions', unpaidAhead.length) })}
          </p>
        </section>
      </div>

      {/* 2. availability */}
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t('status.mine')}</h2>
          <AvailabilityChip state={avail.state} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('hb.availability')}>
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
        {avail.state === 'break' && (
          <div className="mt-4 max-w-sm">
            <label className="label" htmlFor="st-break-until">
              {t('status.breakUntil')}
            </label>
            <input
              id="st-break-until"
              className="input"
              type="datetime-local"
              min={localDateTimeInputValue()}
              value={avail.breakUntil ? avail.breakUntil.slice(0, 16) : ''}
              onChange={(e) => setAvail((a) => (a ? { ...a, breakUntil: e.target.value || null } : a))}
              required
            />
            <p className="mt-1 text-xs text-ink/50">{t('status.breakNote')}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="st-note">
              {t('status.note')}
            </label>
            <input
              id="st-note"
              className="input"
              maxLength={120}
              placeholder={t('status.notePh')}
              value={avail.note}
              onChange={(e) => setAvail((a) => (a ? { ...a, note: e.target.value } : a))}
            />
          </div>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? t('common.saving') : t('status.save')}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink/50">
          {avail.updatedAt ? `${t('status.lastSaved', { when: `${fmtDay(avail.updatedAt)}, ${timeOf(avail.updatedAt)}` })} ` : ''}
          {t('status.savedDb')}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 4. board */}
        <section className="card">
          <h2 className="text-lg font-bold">{t('status.board')}</h2>
          <p className="mb-4 text-sm text-ink/60">{t('status.boardText')}</p>
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
          <h2 className="text-lg font-bold">{t('status.attention')}</h2>
          <p className="mb-4 text-sm text-ink/60">
            {t('status.attention1')} <Link to="/trainer/history" className="font-semibold text-brand-dark hover:underline">{t('status.attentionLink')}</Link>{t('status.attention2')}
          </p>
          {waiting.length === 0 ? (
            <EmptyState title={t('status.caughtUp')} text={t('status.caughtUpText')} />
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
