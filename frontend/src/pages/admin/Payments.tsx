import { useState } from 'react';
import { Download } from 'lucide-react';
import { listPayments } from '../../api/paymentsApi';
import { DataTable, type Column } from '../../components/DataTable';
import { PaymentBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, KpiCard, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { PaymentMethod, PaymentStatus, PaymentView } from '../../types';
import { fmtDateTime, kzt } from '../../utils/format';
import { downloadCsv } from './common';

/** Every payment attempt (approved, declined, refunded) with filters and totals. */
export default function AdminPayments() {
  const { t } = useT();
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const { data, error, loading } = useAsync(
    () => listPayments({ status, method, from: from || undefined, to: to || undefined, q }),
    [status, method, from, to, q],
  );

  const rows = data ?? [];
  const sum = (s: PaymentStatus) => rows.filter((p) => p.payment_status === s).reduce((acc, p) => acc + p.amount_kzt, 0);
  const count = (s: PaymentStatus) => rows.filter((p) => p.payment_status === s).length;

  const exportCsv = () =>
    downloadCsv(
      'payments.csv',
      ['Payment', 'Provider ref', 'Booking', 'Member', 'Method', 'Amount KZT', 'Status', 'Created'],
      rows.map((p) => [p.payment_id, p.provider_txn_ref, p.booking_no, p.member_name, p.method, p.amount_kzt, p.payment_status, p.created_at]),
    );

  const columns: Column<PaymentView>[] = [
    { key: 'id', header: t('adm.pay.payment'), sort: (p) => p.payment_id, render: (p) => <span className="font-mono">#{p.payment_id}</span> },
    { key: 'txn', header: t('adm.pay.ref'), sort: (p) => p.provider_txn_ref, render: (p) => <span className="font-mono text-xs">{p.provider_txn_ref}</span> },
    { key: 'bk', header: t('adm.bk.booking'), sort: (p) => p.booking_id, render: (p) => <span className="font-mono font-bold">{p.booking_no}</span> },
    { key: 'member', header: t('adm.bk.member'), sort: (p) => p.member_name, render: (p) => p.member_name },
    { key: 'method', header: t('adm.pay.method'), sort: (p) => p.method, render: (p) => <span className="uppercase">{p.method}</span> },
    { key: 'amount', header: t('adm.pay.amount'), sort: (p) => p.amount_kzt, render: (p) => <b>{kzt(p.amount_kzt)}</b> },
    { key: 'status', header: t('adm.bk.status'), sort: (p) => p.payment_status, render: (p) => <PaymentBadge status={p.payment_status} /> },
    { key: 'when', header: t('adm.pay.created'), sort: (p) => p.created_at, render: (p) => fmtDateTime(p.created_at) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.payments')}
        subtitle={t('adm.pay.sub')}
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> {t('history.export')}
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tone="mint" label={t('adm.pay.approvedTotal')} value={kzt(sum('approved'))} hint={t('adm.pay.attempts', { n: count('approved') })} />
        <KpiCard tone="berry" label={t('adm.pay.declined')} value={count('declined')} hint={kzt(sum('declined'))} />
        <KpiCard tone="sun" label={t('adm.pay.refunded')} value={kzt(sum('refunded'))} hint={t('adm.pay.attempts', { n: count('refunded') })} />
        <KpiCard label={t('adm.pay.shown')} value={rows.length} hint={t('adm.pay.shownHint')} />
      </div>

      <div className="card-flat grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="ap-q">
            {t('adm.search')}
          </label>
          <input id="ap-q" className="input" placeholder={t('adm.pay.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ap-status">
            {t('adm.bk.status')}
          </label>
          <select id="ap-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | '')}>
            <option value="">{t('adm.all')}</option>
            <option value="approved">{t('adm.pay.s.approved')}</option>
            <option value="declined">{t('adm.pay.s.declined')}</option>
            <option value="refunded">{t('adm.pay.s.refunded')}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ap-method">
            {t('adm.pay.method')}
          </label>
          <select id="ap-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}>
            <option value="">{t('adm.all')}</option>
            <option value="card">{t('pay.method.card')}</option>
            <option value="nfc">{t('pay.method.nfc')}</option>
            <option value="app">{t('pay.method.app')}</option>
            <option value="cash">{t('adm.pay.cash')}</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="ap-from">
              {t('adm.from')}
            </label>
            <input id="ap-from" type="date" className="input px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ap-to">
              {t('adm.to')}
            </label>
            <input id="ap-to" type="date" className="input px-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <ErrorNote message={msg(error)} />}
      {data && (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(p) => p.payment_id}
          initialSort={{ key: 'id', dir: 'desc' }}
          busy={loading}
          empty={<EmptyState title={t('adm.pay.none')} text={t('adm.pay.noneText')} />}
        />
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">{t('common.loading')}</p>}
    </div>
  );
}
