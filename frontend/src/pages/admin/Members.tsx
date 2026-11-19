import { useState } from 'react';
import { Search } from 'lucide-react';
import { listAllMembers, type AdminMember } from '../../api/adminApi';
import { extendMembership, updateMemberPlan } from '../../api/membersApi';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { QrCode } from '../../components/QrCode';
import { useToast } from '../../components/Toast';
import { ErrorNote, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { MembershipPlan } from '../../types';
import { PLAN_LABEL, fmtDate } from '../../utils/format';
import { MembershipChip } from './common';

/** Members: search, see everything, change the plan, extend the membership. */
export default function AdminMembers() {
  const { t } = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAsync(() => listAllMembers(q), [q]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data?.find((m) => m.member_id === selectedId) ?? null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(msg(e instanceof Error ? e.message : t('common.saveFailed')));
    }
  };

  const columns: Column<AdminMember>[] = [
    { key: 'name', header: t('adm.bk.member'), sort: (m) => m.full_name, render: (m) => <b>{m.full_name}</b> },
    { key: 'email', header: t('adm.bk.email'), sort: (m) => m.email ?? '', render: (m) => <span className="text-xs">{m.email}</span> },
    { key: 'phone', header: t('adm.bk.phone'), render: (m) => m.phone },
    { key: 'plan', header: t('adm.mem.plan'), sort: (m) => m.membership_plan, render: (m) => PLAN_LABEL[m.membership_plan] },
    { key: 'exp', header: t('adm.mem.validUntil'), sort: (m) => m.membership_expires_on, render: (m) => fmtDate(m.membership_expires_on) },
    { key: 'state', header: t('adm.mem.membership'), render: (m) => <MembershipChip expires={m.membership_expires_on} /> },
    { key: 'bk', header: t('adm.mem.bookings'), sort: (m) => m.bookings, render: (m) => m.bookings },
    {
      key: 'view',
      header: '',
      render: (m) => (
        <button className="btn-ghost btn-sm" onClick={() => setSelectedId(m.member_id)}>
          {t('adm.mem.open')}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('adm.nav.members')} subtitle={t('adm.mem.sub')} />
      <div className="relative max-w-md">
        <label className="sr-only" htmlFor="am-q">
          {t('adm.search')}
        </label>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink/40" />
        <input id="am-q" className="input pl-9" placeholder={t('adm.mem.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorNote message={msg(error)} />}
      {data && <DataTable rows={data} columns={columns} rowKey={(m) => m.member_id} busy={loading} />}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">{t('common.loading')}</p>}
      <p className="text-xs text-ink/60">{t('adm.noDelete')}</p>

      <Modal open={!!selected} title={selected?.full_name ?? ''} onClose={() => setSelectedId(null)} wide>
        {selected && (
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  [t('adm.bk.email'), selected.email ?? '—'],
                  [t('adm.bk.phone'), selected.phone],
                  [t('adm.mem.validUntil'), fmtDate(selected.membership_expires_on)],
                  [t('adm.mem.joined'), selected.created_at ? fmtDate(selected.created_at) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line bg-sun-soft p-3">
                    <dt className="text-xs text-ink/60">{k}</dt>
                    <dd className="break-all font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <label className="label" htmlFor="am-plan">
                  {t('adm.mem.plan')}
                </label>
                <select
                  id="am-plan"
                  className="input max-w-xs"
                  value={selected.membership_plan}
                  onChange={(e) => void run(() => updateMemberPlan(selected.member_id, e.target.value as MembershipPlan), t('adm.mem.planSaved'))}
                >
                  {(Object.keys(PLAN_LABEL) as MembershipPlan[]).map((p) => (
                    <option key={p} value={p}>
                      {PLAN_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="label">{t('adm.mem.extend')}</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 12].map((months) => (
                    <button
                      key={months}
                      className="btn-secondary btn-sm"
                      onClick={() => void run(() => extendMembership(selected.member_id, months), t('adm.mem.extended', { n: months }))}
                    >
                      {t('adm.mem.plusMonths', { n: months })}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink/50">{t('adm.mem.extendNote')}</p>
              </div>
            </div>
            <div className="text-center">
              <div className="rounded-xl border border-line bg-white p-2">
                <QrCode token={selected.qr_code_token ?? ''} size={140} />
              </div>
              <p className="mt-2 font-mono text-[11px] font-bold">{selected.qr_code_token}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
