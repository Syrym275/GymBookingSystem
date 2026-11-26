import { useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { listAudit, type AuditEntry } from '../../api/adminApi';
import { ROLE_LABEL } from '../../auth/RequireRole';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState, ErrorNote, KpiCard, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT, type Key } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { Role } from '../../types';
import { bkNumber, fmtDateTime } from '../../utils/format';
import { downloadCsv } from './common';

/** Filter groups: the value is the action prefix the backend matches. */
const GROUPS: { value: string; label: Key }[] = [
  { value: '', label: 'adm.all' },
  { value: 'auth.login_failed', label: 'adm.au.g.failed' },
  { value: 'auth.', label: 'adm.au.g.auth' },
  { value: 'trainer.', label: 'adm.au.g.trainers' },
  { value: 'hall.', label: 'adm.au.g.halls' },
  { value: 'member.', label: 'adm.au.g.members' },
  { value: 'booking.', label: 'adm.au.g.bookings' },
  { value: 'staff.', label: 'adm.au.g.staff' },
  { value: 'admin.', label: 'adm.au.g.admin' },
];

const KNOWN_ACTIONS = new Set([
  'auth.login', 'auth.login_failed', 'member.registered', 'trainer.registered', 'trainer.auto_approved', 'trainer.approved', 'trainer.rejected',
  'trainer.created', 'trainer.updated', 'trainer.activated', 'trainer.deactivated', 'trainer.deleted',
  'hall.created', 'hall.updated', 'hall.activated', 'hall.deactivated', 'hall.deleted',
  'member.plan_changed', 'member.membership_extended', 'booking.status_changed',
  'staff.created', 'staff.activated', 'staff.deactivated', 'admin.created', 'admin.password_reset',
]);

/** One short line from the details, for example the trainer's name or "confirmed → cancelled". */
function summary(e: AuditEntry): string {
  const d = e.details;
  if (typeof d.from === 'string' && typeof d.to === 'string') return `${d.from} → ${d.to}`;
  const parts = [d.full_name, d.hall_name, d.email, d.role, d.membership_plan, d.specialization]
    .filter((x): x is string => typeof x === 'string');
  if (typeof d.months === 'number') parts.push(`+${d.months} mo → ${String(d.expires_on ?? '')}`);
  return parts.join(' · ');
}

function target(e: AuditEntry): string {
  if (e.target_id === null) return '';
  if (e.target_type === 'booking') return bkNumber(e.target_id);
  return `${e.target_type ?? ''} #${e.target_id}`;
}

/** Audit log: sign-ins, sign-ups and every change made in the admin area. Read-only. */
export default function AdminAudit() {
  const { t } = useT();
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, error, loading } = useAsync(
    () => listAudit({ action, q: q.trim(), from: from || undefined, to: to || undefined }),
    [action, q, from, to],
  );
  const rows = data ?? [];
  const actionLabel = (a: string) => (KNOWN_ACTIONS.has(a) ? t(`adm.au.a.${a}` as Key) : a);
  const roleLabel = (r: string | null) => (r && r in ROLE_LABEL ? ROLE_LABEL[r as Role] : (r ?? ''));

  const exportCsv = () =>
    downloadCsv(
      'audit-log.csv',
      ['When', 'Who', 'Role', 'Action', 'Target', 'Details'],
      rows.map((e) => [e.created_at, e.actor_email ?? '', e.actor_role ?? '', e.action, target(e), JSON.stringify(e.details)]),
    );

  const columns: Column<AuditEntry>[] = [
    { key: 'when', header: t('adm.au.when'), sort: (e) => e.created_at, render: (e) => <span className="whitespace-nowrap">{fmtDateTime(e.created_at)}</span> },
    {
      key: 'who',
      header: t('adm.au.who'),
      sort: (e) => e.actor_email ?? '',
      render: (e) => (
        <span className="block min-w-0">
          <span className="block break-all font-semibold">{e.actor_email ?? '—'}</span>
          <span className="text-xs text-ink/60">{roleLabel(e.actor_role)}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: t('adm.au.action'),
      sort: (e) => e.action,
      render: (e) => (
        <span className={e.action === 'auth.login_failed' ? 'font-semibold text-berry' : 'font-semibold'}>{actionLabel(e.action)}</span>
      ),
    },
    { key: 'target', header: t('adm.au.target'), sort: (e) => target(e), render: (e) => <span className="font-mono text-xs">{target(e)}</span> },
    { key: 'details', header: t('adm.au.details'), render: (e) => <span className="text-xs text-ink/70">{summary(e)}</span> },
  ];

  const failed = rows.filter((e) => e.action === 'auth.login_failed').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.audit')}
        subtitle={t('adm.au.sub')}
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> {t('history.export')}
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label={t('adm.au.shown')} value={rows.length} hint={t('adm.au.shownHint')} />
        <KpiCard tone={failed > 0 ? 'berry' : undefined} label={t('adm.au.failed')} value={failed} hint={t('adm.au.failedHint')} />
      </div>

      <div className="card-flat grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="au-action">
            {t('adm.au.action')}
          </label>
          <select id="au-action" className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="au-q">
            {t('adm.search')}
          </label>
          <input id="au-q" className="input" placeholder={t('adm.au.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <div>
            <label className="label" htmlFor="au-from">
              {t('adm.from')}
            </label>
            <input id="au-from" type="date" className="input px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="au-to">
              {t('adm.to')}
            </label>
            <input id="au-to" type="date" className="input px-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <ErrorNote message={msg(error)} />}
      {data && (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(e) => e.audit_id}
          initialSort={{ key: 'when', dir: 'desc' }}
          busy={loading}
          empty={<EmptyState title={t('adm.au.none')} text={t('adm.au.noneText')} icon={<ShieldAlert className="h-6 w-6" />} />}
        />
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">{t('common.loading')}</p>}
    </div>
  );
}
