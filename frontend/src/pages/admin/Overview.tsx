import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { attention } from '../../api/adminApi';
import { overview } from '../../api/reportsApi';
import { ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import { useChartColors } from '../../theme/ThemeContext';
import { kzt } from '../../utils/format';
import { WEEKDAY_KEYS, weekdayName } from './common';

const tooltipStyle = {
  background: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--line))',
  borderRadius: 8,
  color: 'rgb(var(--ink))',
  fontSize: 12,
};

/** Admin home: the week in numbers, a to-do list and two charts. */
export default function AdminOverview() {
  const { t } = useT();
  const colors = useChartColors();
  const ov = useAsync(overview, []);
  const att = useAsync(attention, []);

  if (ov.error) return <ErrorNote message={msg(ov.error)} />;
  if (!ov.data) return <Loading />;

  const d = ov.data;
  const weekdays = d.by_weekday.map((x, i) => ({ ...x, day: weekdayName(i) }));
  const dayIndex = WEEKDAY_KEYS.indexOf(d.busiest_day);
  const axis = { fill: colors.axis, fontSize: 11 };

  const todo = att.data
    ? [
        { to: '/admin/trainers', label: t('adm.ov.pendingTrainers'), value: att.data.pendingTrainers, hot: att.data.pendingTrainers > 0 },
        { to: '/admin/bookings?status=pending', label: t('adm.ov.unpaid'), value: att.data.unpaidBookings, hot: false },
        { to: '/admin/members', label: t('adm.ov.expiring'), value: att.data.expiringMemberships, hot: false },
        { to: '/admin/members', label: t('adm.ov.expired'), value: att.data.expiredMemberships, hot: att.data.expiredMemberships > 0 },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.overview')} subtitle={t('adm.ov.sub')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="brand" label={t('adm.ov.bookingsWeek')} value={d.bookings_week} hint={t('adm.ov.bookingsWeekHint')} />
        <KpiCard tone="mint" label={t('adm.ov.confPend')} value={`${d.confirmed_week} / ${d.pending_week}`} hint={t('adm.ov.confPendHint')} />
        <KpiCard tone="sun" label={t('adm.ov.revenue')} value={kzt(d.revenue_30d)} hint={t('adm.ov.revenueHint')} />
        <KpiCard tone="berry" label={t('adm.ov.noShow')} value={`${(d.no_show_rate * 100).toFixed(1)}%`} hint={t('adm.ov.noShowHint')} />
      </div>

      {todo.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{t('adm.ov.attention')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {todo.map((x) => (
              <Link
                key={x.label}
                to={x.to}
                className={`card-flat flex items-center justify-between gap-3 transition hover:border-brand ${x.hot ? 'border-berry/60' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block font-display text-3xl font-bold">{x.value}</span>
                  <span className="block text-xs text-ink/70">{x.label}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink/40" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label={t('adm.ov.busiestDay')} value={dayIndex >= 0 ? weekdayName(dayIndex) : '—'} hint={t('adm.ov.busiestDayHint')} />
        <KpiCard label={t('adm.ov.busiestHour')} value={d.busiest_hour} hint={t('adm.ov.busiestHourHint')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card min-w-0">
          <h2 className="mb-4 text-lg font-bold">{t('adm.ov.byWeekday')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdays}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                <Bar dataKey="count" name={t('adm.ov.bookings')} fill={colors.secondary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card min-w-0">
          <h2 className="mb-4 text-lg font-bold">{t('adm.ov.byHour')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.by_hour}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} interval={1} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                <Bar dataKey="count" name={t('adm.ov.bookings')} fill={colors.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
