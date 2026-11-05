import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { popularHours, popularTrainers, unpaidMembers } from '../../api/reportsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { MAX_PENDING } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { TrainerReportRow, UnpaidGroup } from '../../api/reportsApi';
import { bkNumber, kzt } from '../../utils/format';

export default function AdminReports() {
  // Default range = the two past weeks of sample data (12-25 Oct 2026).
  const [from, setFrom] = useState('2026-10-12');
  const [to, setTo] = useState('2026-10-25');
  const trainers = useAsync(() => popularTrainers(from, to), [from, to]);
  const hours = useAsync(() => popularHours(from, to), [from, to]);
  const unpaid = useAsync(unpaidMembers, []);

  const trainerCols: Column<TrainerReportRow>[] = [
    { key: 'name', header: 'Trainer', sort: (r) => r.trainer_name, render: (r) => <b>{r.trainer_name}</b> },
    { key: 'sessions', header: 'Sessions held', sort: (r) => r.sessions, render: (r) => r.sessions },
    { key: 'eve', header: 'Evening (≥ 17:00)', sort: (r) => r.evening, render: (r) => r.evening },
    { key: 'day', header: 'Before 17:00', sort: (r) => r.before_17, render: (r) => r.before_17 },
    { key: 'ns', header: 'No-shows', sort: (r) => r.no_shows, render: (r) => r.no_shows },
  ];

  const unpaidCols: Column<UnpaidGroup>[] = [
    { key: 'name', header: 'Member', sort: (g) => g.full_name, render: (g) => <b>{g.full_name}</b> },
    { key: 'phone', header: 'Phone', render: (g) => g.phone },
    {
      key: 'n',
      header: 'Unpaid',
      sort: (g) => g.bookings.length,
      render: (g) => (
        <span className={g.bookings.length >= MAX_PENDING ? 'font-bold text-berry' : ''}>
          {g.bookings.length} of {MAX_PENDING}
        </span>
      ),
    },
    { key: 'bk', header: 'Bookings', render: (g) => g.bookings.map((b) => bkNumber(b.booking_id)).join(', ') },
    { key: 'sum', header: 'Amount due', sort: (g) => g.bookings.reduce((s, b) => s + b.price_kzt, 0), render: (g) => kzt(g.bookings.reduce((s, b) => s + b.price_kzt, 0)) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" subtitle="Sessions that took place (completed + no-show) in the chosen range." />

      <div className="card-flat flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="r-from">
            From
          </label>
          <input id="r-from" type="date" className="input" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="r-to">
            To
          </label>
          <input id="r-to" type="date" className="input" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">1 · Popular trainers</h2>
        {trainers.error && <ErrorNote message={trainers.error} />}
        {!trainers.data && !trainers.error && <Loading />}
        {trainers.data && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trainers.data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="trainer_name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#FFF0BF' }} />
                    <Legend />
                    <Bar dataKey="before_17" name="Before 17:00" stackId="a" fill="#FFC93C" stroke="#1E2235" />
                    <Bar dataKey="evening" name="Evening" stackId="a" fill="#FF6B35" stroke="#1E2235" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <DataTable rows={trainers.data} columns={trainerCols} rowKey={(r) => r.trainer_id} initialSort={{ key: 'sessions', dir: 'desc' }} empty={<EmptyState title="No sessions in this range" />} />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">2 · Popular start hours</h2>
        {hours.error && <ErrorNote message={hours.error} />}
        {!hours.data && !hours.error && <Loading />}
        {hours.data && (
          <div className="card">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours.data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: '#FFF0BF' }} />
                  <Bar dataKey="count" name="Bookings" fill="#12B5A6" stroke="#1E2235" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">3 · Members with unpaid bookings</h2>
        {unpaid.error && <ErrorNote message={unpaid.error} />}
        {!unpaid.data && !unpaid.error && <Loading />}
        {unpaid.data && <DataTable rows={unpaid.data} columns={unpaidCols} rowKey={(g) => g.member_id} empty={<EmptyState title="Nobody owes anything" />} />}
      </section>
    </div>
  );
}
