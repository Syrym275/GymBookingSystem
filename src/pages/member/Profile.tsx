import { getMyProfile } from '../../api/membersApi';
import { QrCode } from '../../components/QrCode';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { PLAN_LABEL, fmtDate, membershipState } from '../../utils/format';

export default function Profile() {
  const { data, error } = useAsync(getMyProfile, []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;
  const ms = membershipState(data.membership_expires_on);

  const rows: [string, string][] = [
    ['Full name', data.full_name],
    ['Email', data.email ?? '—'],
    ['Phone', data.phone],
    ['Plan', PLAN_LABEL[data.membership_plan]],
    ['Valid until', fmtDate(data.membership_expires_on)],
  ];

  return (
    <div>
      <PageHeader title="Profile" subtitle="Contact details are managed by reception." />
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="card">
          <dl className="divide-y divide-ink/10">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-ink/60">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-ink/60">Membership</dt>
              <dd>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    ms.state === 'expired'
                      ? 'border-berry bg-berry-soft text-rose-700'
                      : ms.state === 'expiring'
                        ? 'border-sun bg-sun-soft text-amber-800'
                        : 'border-mint bg-mint-soft text-mint-dark'
                  }`}
                >
                  {ms.state === 'expired' ? 'Expired' : ms.state === 'expiring' ? `Ends in ${ms.daysLeft} d` : 'Active'}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        <div className="card flex flex-col items-center bg-sun-soft/60 text-center">
          <h2 className="mb-3 text-lg font-extrabold">Your check-in QR</h2>
          <div className="rounded-2xl border-2 border-ink bg-white p-3 shadow-hard-sm">
            <QrCode token={data.qr_code_token ?? data.member_id.toString()} size={210} />
          </div>
          <p className="mt-3 font-mono text-xs font-bold">{data.qr_code_token}</p>
          <p className="mt-1 text-xs text-ink/60">Scan at the entrance. Placeholder pattern - generated from your token.</p>
        </div>
      </div>
    </div>
  );
}
