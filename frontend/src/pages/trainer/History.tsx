import { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { BookingSlip } from '../../components/BookingSlip';
import { DataTable, type Column } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus, BookingView } from '../../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, dateOf, fmtDay, kzt, timeOf } from '../../utils/format';

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Every past session, with filters and a CSV export. */
export default function TrainerHistory() {
  const toast = useToast();
  const { data, error } = useAsync(() => listBookings(), []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState<BookingStatus[]>([]);
  const [slip, setSlip] = useState<BookingView | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.filter((b) => {
      if (b.end_time > TODAY) return false; // history = sessions that are over
      if (from && dateOf(b.start_time) < from) return false;
      if (to && dateOf(b.start_time) > to) return false;
      if (statuses.length && !statuses.includes(b.status)) return false;
      if (needle && !b.member.full_name.toLowerCase().includes(needle) && !bkNumber(b.booking_id).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, from, to, q, statuses]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const toggle = (s: BookingStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const filtered = !!(from || to || q || statuses.length);
  const attendedValue = rows.filter((b) => b.status === 'completed').reduce((sum, b) => sum + b.price_kzt, 0);

  const exportCsv = () => {
    const head = ['Booking', 'Date', 'Start', 'End', 'Client', 'Status', 'Price KZT'];
    const lines = rows.map((b) =>
      [bkNumber(b.booking_id), dateOf(b.start_time), timeOf(b.start_time), timeOf(b.end_time), b.member.full_name, STATUS_LABEL[b.status], b.price_kzt].map(csvCell).join(','),
    );
    const blob = new Blob([`﻿${[head.map(csvCell).join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-session-history.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} session${rows.length === 1 ? '' : 's'}.`);
  };

  const columns: Column<BookingView>[] = [
    { key: 'when', header: 'Date', sort: (b) => b.start_time, render: (b) => fmtDay(b.start_time) },
    { key: 'time', header: 'Time', render: (b) => `${timeOf(b.start_time)}–${timeOf(b.end_time)}` },
    { key: 'client', header: 'Client', sort: (b) => b.member.full_name, render: (b) => <span className="font-semibold">{b.member.full_name}</span> },
    { key: 'id', header: 'Booking', render: (b) => <span className="font-mono text-xs">{bkNumber(b.booking_id)}</span> },
    { key: 'price', header: 'Price', sort: (b) => b.price_kzt, render: (b) => kzt(b.price_kzt) },
    { key: 'status', header: 'Result', sort: (b) => b.status, render: (b) => <StatusBadge status={b.status} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="History"
        subtitle="Sessions that are over. Click a row for the booking slip."
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <div className="card-flat space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="h-from">
              From
            </label>
            <input id="h-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="h-to">
              To
            </label>
            <input id="h-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="h-q">
              Client or booking
            </label>
            <input id="h-q" className="input" placeholder="Name or BK number" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label mb-0 mr-1">Result</span>
          {ALL_STATUSES.filter((s) => s !== 'pending').map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              aria-pressed={statuses.includes(s)}
              className={`chip ${statuses.includes(s) ? 'border-brand bg-brand text-onaccent' : 'border-line text-ink/70 hover:border-ink/40'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          {filtered && (
            <button
              className="btn-ghost btn-sm ml-auto"
              onClick={() => {
                setFrom('');
                setTo('');
                setQ('');
                setStatuses([]);
              }}
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-ink/60">
        {rows.length} session{rows.length === 1 ? '' : 's'} · attended session value <b className="text-ink">{kzt(attendedValue)}</b>
      </p>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(b) => b.booking_id}
        pageSize={12}
        initialSort={{ key: 'when', dir: 'desc' }}
        onRowClick={setSlip}
        empty={<EmptyState title="No past sessions match" text="Try removing a filter or widening the dates." />}
      />
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
