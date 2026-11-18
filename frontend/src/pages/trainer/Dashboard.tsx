import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BarChart3, CalendarDays, History, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { listBookings } from '../../api/bookingsApi';
import { getMyAvailability, getMyTrainerProfile } from '../../api/trainersApi';
import { AttendanceButtons } from '../../components/AttendanceButtons';
import { BookingSlip } from '../../components/BookingSlip';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { TODAY, TODAY_DATE } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { useChartColors } from '../../theme/ThemeContext';
import type { BookingView } from '../../types';
import { dateOf, fmtDate, fmtDay, kzt, timeOf } from '../../utils/format';
import { before, dailyBuckets, deltaText, holdsSlot, isLive, lastDays, liveStatus, pct, summarize } from './analytics';
import { AvailabilityChip, LiveStatusLine, NO_SHOW_COLOR, initials, tooltipStyle } from './common';
import { useT, type Key } from '../../i18n';
import { specializationLabel } from '../../data/gymData';

const LINKS: { to: string; label: Key; text: Key; icon: JSX.Element }[] = [
  { to: '/trainer/schedule', label: 'nav.schedule', text: 'tdash.link.schedule', icon: <CalendarDays className="h-5 w-5" /> },
  { to: '/trainer/stats', label: 'nav.stats', text: 'tdash.link.stats', icon: <BarChart3 className="h-5 w-5" /> },
  { to: '/trainer/clients', label: 'nav.clients', text: 'tdash.link.clients', icon: <Users className="h-5 w-5" /> },
  { to: '/trainer/history', label: 'nav.history', text: 'tdash.link.history', icon: <History className="h-5 w-5" /> },
  { to: '/trainer/status', label: 'nav.status', text: 'tdash.link.status', icon: <Activity className="h-5 w-5" /> },
];

/** Trainer home: profile, what is happening now, the key numbers, today's sessions. */
export default function TrainerDashboard() {
  const { t, tp } = useT();
  const colors = useChartColors();
  const bookings = useAsync(() => listBookings(), []);
  const profile = useAsync(getMyTrainerProfile, []);
  const availability = useAsync(getMyAvailability, []);
  const [slip, setSlip] = useState<BookingView | null>(null);

  if (bookings.error) return <ErrorNote message={bookings.error} />;
  if (profile.error) return <ErrorNote message={profile.error} />;
  if (availability.error) return <ErrorNote message={availability.error} />;
  if (!bookings.data || !profile.data || !availability.data) return <Loading />;

  const all = bookings.data;
  const me = profile.data;
  const w7 = lastDays(7);
  const s7 = summarize(all, w7);
  const s7prev = summarize(all, before(w7, 7));
  const s30 = summarize(all, lastDays(30));
  const live = liveStatus(all);
  const avail = availability.data;

  const todays = all.filter((b) => isLive(b) && dateOf(b.start_time) === TODAY_DATE);
  const coming = all.filter((b) => holdsSlot(b) && dateOf(b.start_time) > TODAY_DATE).slice(0, 5);
  const daily = dailyBuckets(all, w7);

  const refresh = () => {
    setSlip(null);
    bookings.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('tdash.hi', { name: me.full_name.split(' ')[0] })} subtitle={`${fmtDate(TODAY_DATE)} · ${t('tdash.sub')}`} />

      {/* Profile + what is happening now */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand font-display text-2xl font-bold text-onaccent">
            {initials(me.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-bold uppercase">{me.full_name}</p>
            <p className="text-sm text-ink/70">{specializationLabel(me.specialization)}</p>
            <p className="mt-1 text-sm">
              <b>{kzt(me.session_price_kzt)}</b> <span className="text-ink/60">{t('tdash.perSession')}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`chip ${me.is_active ? 'border-mint/60 bg-mint-soft text-mint-dark' : 'border-line bg-sun-soft text-ink/70'}`}>
                {me.is_active ? t('tdash.active') : t('tdash.pending')}
              </span>
              <AvailabilityChip state={avail.state} />
            </div>
          </div>
        </div>
        <div className="card">
          <p className="label">{t('tdash.now')}</p>
          <LiveStatusLine live={live} />
          <Link to="/trainer/status" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline">
            {t('tdash.openStatus')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Key numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="brand" label={t('tdash.kpi.sessions7')} value={s7.held} hint={deltaText(s7.held, s7prev.held, 7)} />
        <KpiCard tone="mint" label={t('tdash.kpi.attendance30')} value={pct(s30.rate)} hint={t('tdash.kpi.attendedHint', { a: s30.attended, n: s30.noShows })} />
        <KpiCard tone="sun" label={t('tdash.kpi.clients30')} value={s30.clients} hint={t('tdash.kpi.clientsHint')} />
        <KpiCard label={t('tdash.kpi.value30')} value={kzt(s30.earned)} hint={t('tdash.kpi.valueHint')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Today */}
        <section className="card min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('nav.today')}</h2>
            <span className="text-xs text-ink/60">{tp('unit.sessions', todays.length)}</span>
          </div>
          {todays.length === 0 ? (
            <EmptyState title={t('tdash.noToday')} text={t('tdash.noTodayText')} />
          ) : (
            <ul className="space-y-2">
              {todays.map((b) => (
                <li key={b.booking_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                  <span className="whitespace-nowrap font-display text-lg font-bold">
                    {timeOf(b.start_time)}–{timeOf(b.end_time)}
                  </span>
                  <button className="min-w-[8rem] flex-1 truncate text-left font-semibold hover:underline" onClick={() => setSlip(b)}>
                    {b.member.full_name}
                  </button>
                  <StatusBadge status={b.status} />
                  <AttendanceButtons booking={b} onDone={refresh} />
                </li>
              ))}
            </ul>
          )}
          {coming.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-bold text-ink/70">{t('tdash.coming')}</h3>
              <ul className="space-y-1.5 text-sm">
                {coming.map((b) => (
                  <li key={b.booking_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-24 whitespace-nowrap text-ink/60">{fmtDay(b.start_time)}</span>
                    <span className="whitespace-nowrap font-semibold">{timeOf(b.start_time)}–{timeOf(b.end_time)}</span>
                    <span className="min-w-[7rem] flex-1 truncate">{b.member.full_name}</span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Last 7 days chart */}
        <section className="card min-w-0">
          <h2 className="text-lg font-bold">{t('period.7d')}</h2>
          <p className="mb-3 text-sm text-ink/60">{t('tdash.perDay')} <Link to="/trainer/stats" className="font-semibold text-brand-dark hover:underline">{t('tdash.moreCharts')}</Link></p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: colors.axis, fontSize: 11 }} />
                <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                <Bar dataKey="attended" name={t('attend.attended')} stackId="a" fill={colors.primary} />
                <Bar dataKey="noShows" name={t('status.no_show')} stackId="a" fill={NO_SHOW_COLOR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink/50">{t('tdash.nowTime', { time: TODAY.replace('T', ' ') })}</p>
        </section>
      </div>

      {/* Shortcuts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="card-flat flex items-center gap-3 transition hover:border-brand">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sun-soft text-brand-dark">{l.icon}</span>
            <span className="min-w-0">
              <span className="block font-display text-base font-bold uppercase">{t(l.label)}</span>
              <span className="block truncate text-xs text-ink/60">{t(l.text)}</span>
            </span>
          </Link>
        ))}
      </div>

      <BookingSlip booking={slip} onClose={() => setSlip(null)} footer={slip && <AttendanceButtons booking={slip} onDone={refresh} />} />
    </div>
  );
}
