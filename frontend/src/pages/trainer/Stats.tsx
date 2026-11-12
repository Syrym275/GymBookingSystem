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

/** "Graphic": charts about the trainer's work for a chosen period. */
export default function TrainerStats() {
  const colors = useChartColors();
  const { data, error } = useAsync(() => listBookings(), []);
  const [period, setPeriod] = useState<PeriodKey>('30d');

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const p = PERIODS.find((x) => x.key === period)!;
  const range = lastDays(p.days);
  const cur = summarize(data, range);
  const prev = summarize(data, before(range, p.days));
  const unit = `${p.days} days`;

  const series = p.days <= 30 ? dailyBuckets(data, range) : weeklyBuckets(data, range);
  const hours = hourBuckets(data, range);
  const trend = weeklyTrend(data, 8);
  const pie = [
    { name: 'Attended', value: cur.attended, color: colors.primary },
    { name: 'No-show', value: cur.noShows, color: NO_SHOW_COLOR },
    { name: 'Cancelled', value: cur.cancelled, color: colors.tertiary },
  ].filter((x) => x.value > 0);
  const axis = { fill: colors.axis, fontSize: 11 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistics"
        subtitle="The work you did in the chosen period, compared with the period before it."
        actions={
          <div className="inline-flex rounded-md border border-line bg-white p-1" role="group" aria-label="Period">
            {PERIODS.map((x) => (
              <button
                key={x.key}
                onClick={() => setPeriod(x.key)}
                aria-pressed={period === x.key}
                className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${period === x.key ? 'bg-brand text-onaccent' : 'text-ink/70 hover:bg-sun-soft'}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard tone="brand" label="Sessions held" value={cur.held} hint={deltaText(cur.held, prev.held, unit)} />
        <KpiCard tone="mint" label="Attendance" value={pct(cur.rate)} hint={`was ${pct(prev.rate)} before`} />
        <KpiCard tone="berry" label="No-shows" value={cur.noShows} hint={deltaText(cur.noShows, prev.noShows, unit)} />
        <KpiCard tone="sun" label="Clients" value={cur.clients} hint={deltaText(cur.clients, prev.clients, unit)} />
        <KpiCard label="Session value" value={kzt(cur.earned)} hint="Attended sessions" />
      </div>

      {cur.held === 0 && cur.cancelled === 0 ? (
        <EmptyState title="No sessions in this period" text="Try a longer period to see more of your work." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card lg:col-span-2">
            <h2 className="text-lg font-bold">Sessions {p.days <= 30 ? 'per day' : 'per week'}</h2>
            <p className="mb-3 text-sm text-ink/60">Attended and no-show sessions that took place.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="attended" name="Attended" stackId="a" fill={colors.primary} />
                  <Bar dataKey="noShows" name="No-show" stackId="a" fill={NO_SHOW_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">Outcome</h2>
            <p className="mb-3 text-sm text-ink/60">How the booked sessions ended.</p>
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
                <p className="text-xs text-ink/60">attended</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-bold">Busiest hours</h2>
            <p className="mb-3 text-sm text-ink/60">Sessions by start hour.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip cursor={{ fill: colors.cursor }} contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Sessions" fill={colors.secondary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card lg:col-span-2">
            <h2 className="text-lg font-bold">8-week trend</h2>
            <p className="mb-3 text-sm text-ink/60">Sessions held each week, whatever period is selected above. The last point is the current week so far.</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={axis} />
                  <YAxis allowDecimals={false} tick={axis} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="total" name="Held" stroke={colors.primary} strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="attended" name="Attended" stroke={colors.secondary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
