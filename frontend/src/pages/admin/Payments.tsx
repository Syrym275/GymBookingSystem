import { useState } from 'react';
import { listPayments } from '../../api/paymentsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { PaymentBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { PaymentMethod, PaymentStatus, PaymentView } from '../../types';
import { fmtDateTime, kzt } from '../../utils/format';

export default function AdminPayments() {
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const { data, error, loading } = useAsync(
    () => listPayments({ status, method, from: from || undefined, to: to || undefined, q }),
    [status, method, from, to, q],
  );

  const columns: Column<PaymentView>[] = [
    { key: 'id', header: 'Payment', sort: (p) => p.payment_id, render: (p) => <span className="font-mono">#{p.payment_id}</span> },
    { key: 'txn', header: 'Provider ref', sort: (p) => p.provider_txn_ref, render: (p) => <span className="font-mono text-xs">{p.provider_txn_ref}</span> },
    { key: 'bk', header: 'Booking', sort: (p) => p.booking_id, render: (p) => <span className="font-mono font-bold">{p.booking_no}</span> },
    { key: 'member', header: 'Member', sort: (p) => p.member_name, render: (p) => p.member_name },
    { key: 'method', header: 'Method', sort: (p) => p.method, render: (p) => <span className="uppercase">{p.method}</span> },
    { key: 'amount', header: 'Amount', sort: (p) => p.amount_kzt, render: (p) => <b>{kzt(p.amount_kzt)}</b> },
    { key: 'status', header: 'Status', sort: (p) => p.payment_status, render: (p) => <PaymentBadge status={p.payment_status} /> },
    { key: 'when', header: 'Created', sort: (p) => p.created_at, render: (p) => fmtDateTime(p.created_at) },
  ];

  return (
    <div>
      <PageHeader title="Payments log" subtitle="Every attempt: approved, declined and refunded." />
      <div className="card-flat mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="p-q">
            Search
          </label>
          <input id="p-q" className="input" placeholder="Txn ref, BK number or member" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="p-status">
            Status
          </label>
          <select id="p-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
            <option value="">All</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-method">
            Method
          </label>
          <select id="p-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">All</option>
            <option value="card">Card</option>
            <option value="nfc">NFC</option>
            <option value="app">App</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="p-from">
              From
            </label>
            <input id="p-from" type="date" className="input px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-to">
              To
            </label>
            <input id="p-to" type="date" className="input px-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>
      {error && <ErrorNote message={error} />}
      {data && (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(p) => p.payment_id}
          initialSort={{ key: 'id', dir: 'desc' }}
          busy={loading}
          empty={<EmptyState title="No payments match" text="Try clearing a filter." />}
        />
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">Loading payments…</p>}
    </div>
  );
}
