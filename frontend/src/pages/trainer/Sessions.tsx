import { useState } from 'react';
import { listBookings } from '../../api/bookingsApi';
import { AttendanceButtons } from '../../components/AttendanceButtons';
import { BookingSlip } from '../../components/BookingSlip';
import { DataTable, type Column } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus, BookingView } from '../../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, fmtDay, timeOf } from '../../utils/format';

export default function TrainerSessions() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [slip, setSlip] = useState<BookingView | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => listBookings({ from: from || undefined, to: to || undefined, statuses: status ? [status] : [] }),
    [from, to, status],
  );

  const columns: Column<BookingView>[] = [
    { key: 'when', header: 'Date', sort: (b) => b.start_time, render: (b) => fmtDay(b.start_time) },
    { key: 'time', header: 'Time', render: (b) => `${timeOf(b.start_time)}–${timeOf(b.end_time)}` },
    { key: 'member', header: 'Student', sort: (b) => b.member.full_name, render: (b) => <span className="font-bold">{b.member.full_name}</span> },
    { key: 'id', header: 'Booking', render: (b) => <span className="font-mono text-xs">{bkNumber(b.booking_id)}</span> },
    { key: 'status', header: 'Status', sort: (b) => b.status, render: (b) => <StatusBadge status={b.status} /> },
    {
      key: 'act',
      header: 'Attendance',
      render: (b) => (
        <div onClick={(e) => e.stopPropagation()}>
          <AttendanceButtons booking={b} onDone={reload} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Filter your sessions and record attendance for confirmed ones." />
      <div className="card-flat mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="s-from">
            From
          </label>
          <input id="s-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-to">
            To
          </label>
          <input id="s-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-status">
            Status
          </label>
          <select id="s-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <ErrorNote message={error} />}
      {data && (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(b) => b.booking_id}
          initialSort={{ key: 'when', dir: 'desc' }}
          onRowClick={setSlip}
          busy={loading}
          empty={<EmptyState title="No sessions match" text="Change the dates or status filter." />}
        />
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">Loading sessions…</p>}
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
