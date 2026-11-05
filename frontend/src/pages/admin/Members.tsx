import { useState } from 'react';
import { Search } from 'lucide-react';
import { extendMembership, listMembers, updateMemberPlan } from '../../api/membersApi';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { QrCode } from '../../components/QrCode';
import { useToast } from '../../components/Toast';
import { ErrorNote, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { MemberView, MembershipPlan } from '../../types';
import { PLAN_LABEL, fmtDate } from '../../utils/format';
import { MembershipBadge } from '../reception/MemberLookup';

export default function AdminMembers() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAsync(() => listMembers(q), [q]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data?.find((m) => m.member_id === selectedId) ?? null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const columns: Column<MemberView>[] = [
    { key: 'name', header: 'Member', sort: (m) => m.full_name, render: (m) => <b>{m.full_name}</b> },
    { key: 'email', header: 'Email', sort: (m) => m.email ?? '', render: (m) => <span className="text-xs">{m.email}</span> },
    { key: 'phone', header: 'Phone', render: (m) => m.phone },
    { key: 'plan', header: 'Plan', sort: (m) => m.membership_plan, render: (m) => PLAN_LABEL[m.membership_plan] },
    { key: 'exp', header: 'Valid until', sort: (m) => m.membership_expires_on, render: (m) => fmtDate(m.membership_expires_on) },
    { key: 'state', header: 'Membership', render: (m) => <MembershipBadge expires={m.membership_expires_on} /> },
    {
      key: 'view',
      header: '',
      render: (m) => (
        <button className="btn-ghost btn-sm" onClick={() => setSelectedId(m.member_id)}>
          View / edit
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Members" subtitle="Members are never deleted. Change a plan or extend the membership." />
      <div className="relative mb-4 max-w-md">
        <label className="sr-only" htmlFor="am-q">
          Search members
        </label>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink/40" />
        <input id="am-q" className="input pl-9" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <ErrorNote message={error} />}
      {data && <DataTable rows={data} columns={columns} rowKey={(m) => m.member_id} busy={loading} />}
      {!data && !error && <p className="py-8 text-center text-sm text-ink/50">Loading members…</p>}

      <Modal open={!!selected} title={selected?.full_name ?? ''} onClose={() => setSelectedId(null)} wide>
        {selected && (
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-cream p-3">
                  <dt className="text-xs text-ink/60">Email</dt>
                  <dd className="break-all font-bold">{selected.email}</dd>
                </div>
                <div className="rounded-xl bg-cream p-3">
                  <dt className="text-xs text-ink/60">Phone</dt>
                  <dd className="font-bold">{selected.phone}</dd>
                </div>
                <div className="rounded-xl bg-cream p-3">
                  <dt className="text-xs text-ink/60">Valid until</dt>
                  <dd className="font-bold">{fmtDate(selected.membership_expires_on)}</dd>
                </div>
                <div className="rounded-xl bg-cream p-3">
                  <dt className="text-xs text-ink/60">Joined</dt>
                  <dd className="font-bold">{selected.created_at ? fmtDate(selected.created_at) : '—'}</dd>
                </div>
              </dl>
              <div>
                <label className="label" htmlFor="am-plan">
                  Membership plan
                </label>
                <select
                  id="am-plan"
                  className="input max-w-xs"
                  value={selected.membership_plan}
                  onChange={(e) => run(() => updateMemberPlan(selected.member_id, e.target.value as MembershipPlan), 'Plan updated.')}
                >
                  {(Object.keys(PLAN_LABEL) as MembershipPlan[]).map((p) => (
                    <option key={p} value={p}>
                      {PLAN_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="label">Extend membership</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 12].map((m) => (
                    <button key={m} className="btn-secondary btn-sm" onClick={() => run(() => extendMembership(selected.member_id, m), `Extended by ${m} month${m > 1 ? 's' : ''}.`)}>
                      +{m} month{m > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink/50">Counted from the current end date (or from today if already expired).</p>
              </div>
            </div>
            <div className="text-center">
              <div className="rounded-2xl border-2 border-ink bg-white p-2">
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
