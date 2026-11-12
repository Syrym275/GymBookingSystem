import { useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, KpiCard, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { fmtDate, fmtDay, kzt, timeOf } from '../../utils/format';
import { groupClients, pct, type ClientLabel, type ClientRow } from './analytics';
import { ClientChip, initials } from './common';

const LABELS: ClientLabel[] = ['Regular', 'New', 'Active', 'At risk', 'Inactive'];

/** The people the trainer works with. Only names are shown: contact details belong to reception. */
export default function TrainerClients() {
  const { data, error } = useAsync(() => listBookings(), []);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState<ClientLabel | ''>('');
  const [selected, setSelected] = useState<string | null>(null);

  const clients = useMemo(() => (data ? groupClients(data) : []), [data]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const rows = clients.filter((c) => (!q || c.name.toLowerCase().includes(q.trim().toLowerCase())) && (!label || c.label === label));
  const count = (l: ClientLabel) => clients.filter((c) => c.label === l).length;
  const current = clients.find((c) => c.name === selected) ?? null;

  const columns: Column<ClientRow>[] = [
    {
      key: 'name',
      header: 'Client',
      sort: (c) => c.name,
      render: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun font-display text-sm font-bold">{initials(c.name)}</span>
          <span className="font-semibold">{c.name}</span>
        </div>
      ),
    },
    { key: 'label', header: 'Status', sort: (c) => c.label, render: (c) => <ClientChip label={c.label} /> },
    { key: 'held', header: 'Sessions', sort: (c) => c.held, render: (c) => c.held },
    { key: 'rate', header: 'Attendance', sort: (c) => c.rate ?? -1, render: (c) => pct(c.rate) },
    { key: 'no', header: 'No-shows', sort: (c) => c.noShows, render: (c) => c.noShows },
    { key: 'last', header: 'Last session', sort: (c) => c.last ?? '', render: (c) => (c.last ? fmtDay(c.last) : '—') },
    { key: 'next', header: 'Next', sort: (c) => c.next ?? 'z', render: (c) => (c.next ? `${fmtDay(c.next)}, ${timeOf(c.next)}` : '—') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" subtitle="Everyone you have trained or have booked with you." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="brand" label="Clients" value={clients.length} hint="Different people, all time" />
        <KpiCard tone="mint" label="Regular" value={count('Regular')} hint="3+ sessions in 30 days" />
        <KpiCard tone="sun" label="New" value={count('New')} hint="First session in 30 days" />
        <KpiCard tone="berry" label="At risk" value={count('At risk')} hint="30%+ no-shows" />
      </div>

      <div className="card-flat flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <label className="label" htmlFor="cl-q">
            Search
          </label>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-ink/40" />
          <input id="cl-q" className="input pl-9" placeholder="Client name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`chip ${label === '' ? 'border-brand bg-brand text-onaccent' : 'border-line hover:border-ink/40'}`} onClick={() => setLabel('')} aria-pressed={label === ''}>
            All
          </button>
          {LABELS.map((l) => (
            <button
              key={l}
              className={`chip ${label === l ? 'border-brand bg-brand text-onaccent' : 'border-line hover:border-ink/40'}`}
              onClick={() => setLabel(label === l ? '' : l)}
              aria-pressed={label === l}
            >
              {l} · {count(l)}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.name}
        initialSort={{ key: 'held', dir: 'desc' }}
        onRowClick={(c) => setSelected(c.name)}
        empty={<EmptyState title="No clients found" text="Change the search or the status filter." />}
      />

      <p className="flex items-start gap-2 text-xs text-ink/60">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Phone numbers, emails and QR codes are not shown here on purpose. Trainers only see a client&apos;s name and the sessions with you; reception holds the contact details.
      </p>

      <Modal open={!!current} title={current?.name ?? ''} onClose={() => setSelected(null)} wide>
        {current && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ClientChip label={current.label} />
              <span className="text-sm text-ink/60">
                {current.first ? `Training with you since ${fmtDate(current.first)}` : 'No session held yet'}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ['Sessions', String(current.held)],
                ['Attendance', pct(current.rate)],
                ['No-shows', String(current.noShows)],
                ['Session value', kzt(current.earned)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line bg-sun-soft p-3">
                  <dt className="text-xs text-ink/60">{k}</dt>
                  <dd className="font-display text-xl font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="mb-2 text-sm font-bold">Sessions with you</h3>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
                {current.sessions.map((b) => (
                  <li key={b.booking_id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                    <span className="w-28 text-ink/70">{fmtDay(b.start_time)}</span>
                    <span className="flex-1 font-semibold">
                      {timeOf(b.start_time)}–{timeOf(b.end_time)}
                    </span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
