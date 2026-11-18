import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { listBookings } from '../../api/bookingsApi';
import { EmptyState, ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useChartColors } from '../../theme/ThemeContext';
import { kzt } from '../../utils/format';
import {
  PERIODS,
  before,
  dailyBuckets,
  deltaText,
  hourBuckets,
  lastDays,
  pct,
  summarize,
  weeklyBuckets,
  weeklyTrend,
  type PeriodKey,
} from './analytics';
import { NO_SHOW_COLOR, tooltipStyle } from './common';
import { useT, type Key } from '../../i18n';

/** "Graphic": charts about the trainer's work for a chosen period. */
export default function TrainerStats() {
  const { t } = useT();
  const colors = useChartColors();
  const { data, error } = useAsync(() => listBookings(), []);
  const [period, setPeriod] = useState<PeriodKey>('30d');

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const p = PERIODS.find((x) => x.key === period)!;
  const range = lastDays(p.days);
  const cur = summarize(data, range);
  const prev = summarize(data, before(range, p.days));
  const unit = p.days;

  const series = p.days <= 30 ? dailyBuckets(data, range) : weeklyBuckets(data, range);
  const hours = hourBuckets(data, range);
  const trend = weeklyTrend(data, 8);
  const pie = [
    { name: t('attend.attended'), value: cur.attended, color: colors.primary },
    { name: t('status.no_show'), value: cur.noShows, color: NO_SHOW_COLOR },
    { name: t('status.cancelled'), value: cur.cancelled, color: colors.tertiary },
  ].filter((x) => x.value > 0);
  const axis = { fill: colors.axis, fontSize: 11 };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.stats')}
        subtitle={t('stats.sub')}
        actions={
          <div className="inline-flex rounded-md border border-line bg-white p-1" role="group" aria-label={t('stats.period')}>
            {PERIODS.map((x) => (
              <button
                key={x.key}
                onClick={() => setPeriod(x.key)}
                aria-pressed={period === x.key}
                className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${period === x.key ? 'bg-brand text-onaccent' : 'text-ink/70 hover:bg-sun-soft'}`}
              >
                {t(`period.${x.key}` as Key)}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard tone="brand" label={t('stats.held')} value={cur.held} hint={deltaText(cur.held, prev.held, unit)} />
        <KpiCard tone="mint" label={t('stats.attendance')} value={pct(cur.rate)} hint={t('stats.was', { v: pct(prev.rate) })} />
        <KpiCard tone="berry" label={t('stats.noShows')} value={cur.noShows} hint={deltaText(cur.noShows, prev.noShows, unit)} />
        <KpiCard tone="sun" label={t('nav.clients')} value={cur.clients} hint={deltaText(cur.clients, prev.clients, unit)} />
        <KpiCard label={t('stats.value')} value={kzt(cur.earned)} hint={t('stats.valueHint')} />
      </div>

      {cur.held === 0 && cur.cancelled === 0 ? (
        <EmptyState title={t('stats.none')} text={t('stats.noneText')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card lg:col-span-2">
            <h2 className="text-lg font-bold">{p.days <= 30 ? t('stats.perDay') : t('stats.perWeek')}</h2>
            <p className="mb-3 text-sm text-ink/60">{t('stats.perDayText')}</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="attended" name={t('attend.attended')} stackId="a" fill={colors.primary} />
                  <Bar dataKey="noShows" name={t('status.no_show')} stackId="a" fill={NO_SHOW_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">{t('stats.outcome')}</h2>
            <p className="mb-3 text-sm text-ink/60">{t('stats.outcomeText')}</p>
            <div className="relative h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
                    {pie.map((x) => (
                      <Cell key={x.name} fill={x.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
                <p className="font-display text-3xl font-bold">{pct(cur.rate)}</p>
                <p className="text-xs text-ink/60">{t('stats.attendedLower')}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">{t('stats.busiest')}</h2>
            <p className="mb-3 text-sm text-ink/60">{t('stats.busiestText')}</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name={t('stats.sessions')} fill={colors.secondary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card lg:col-span-2">
            <h2 className="text-lg font-bold">{t('stats.trend')}</h2>
            <p className="mb-3 text-sm text-ink/60">{t('stats.trendText')}</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name={t('stats.heldShort')} stroke={colors.primary} strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="attended" name={t('attend.attended')} stroke={colors.secondary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
