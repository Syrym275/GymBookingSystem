import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartColors } from '../../theme/ThemeContext';
import { overview } from '../../api/reportsApi';
import { ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { kzt } from '../../utils/format';

export default function AdminOverview() {
  const cc = useChartColors();
  const { data, error } = useAsync(overview, []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Overview" subtitle="The week of the demo date at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="brand" label="Bookings this week" value={data.bookings_week} hint="Excl. cancelled & expired" />
        <KpiCard
          tone="mint"
          label="Confirmed vs pending"
          value={`${data.confirmed_week} / ${data.pending_week}`}
          hint="Paid / waiting for payment"
        />
        <KpiCard tone="sun" label="Revenue (30 days)" value={kzt(data.revenue_30d)} hint="Approved payments only" />
        <KpiCard tone="berry" label="No-show rate" value={`${(data.no_show_rate * 100).toFixed(1)}%`} hint="Of completed + no-show sessions" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <KpiCard label="Busiest day" value={data.busiest_day} hint="Most paid bookings" />
        <KpiCard label="Busiest hour" value={data.busiest_hour} hint="Most popular start time" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-extrabold">Bookings by weekday</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_weekday}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cc.grid} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: cc.axis }} stroke={cc.grid} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cc.axis }} stroke={cc.grid} />
                <Tooltip cursor={{ fill: cc.cursor }} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--ink))' }} />
                <Bar dataKey="count" name="Bookings" fill={cc.secondary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2 className="mb-4 text-lg font-extrabold">Bookings by start hour</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_hour}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cc.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: cc.axis }} stroke={cc.grid} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: cc.axis }} stroke={cc.grid} />
                <Tooltip cursor={{ fill: cc.cursor }} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--ink))' }} />
                <Bar dataKey="count" name="Bookings" fill={cc.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
