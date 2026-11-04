import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trainerStats } from '../../api/reportsApi';
import { ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';

export default function TrainerStats() {
  const { data, error } = useAsync(trainerStats, []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const attended = data.completed + data.no_show;
  const showRate = attended ? Math.round((data.completed / attended) * 100) : 0;

  return (
    <div>
      <PageHeader title="My stats" subtitle="Counts only - no personal details about your students." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="brand" label="This week" value={data.sessions_week} hint="Sessions (excl. cancelled)" />
        <KpiCard tone="sun" label="This month" value={data.sessions_month} hint="Sessions (excl. cancelled)" />
        <KpiCard tone="mint" label="Students" value={data.unique_students} hint="Unique people you train" />
        <KpiCard label="Attendance" value={`${showRate}%`} hint={`${data.completed} completed · ${data.no_show} no-show`} />
      </div>

      <div className="card mt-6">
        <h2 className="mb-1 text-lg font-extrabold">Busiest hours</h2>
        <p className="mb-4 text-sm text-ink/60">Sessions by start hour.</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hours}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ fill: '#FFF0BF' }} />
              <Bar dataKey="count" name="Sessions" fill="#FF6B35" radius={[6, 6, 0, 0]} stroke="#1E2235" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
