import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../auth/RequireRole';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { PageHeader } from '../components/ui';
import { useT } from '../i18n';

/** Profile page for trainers, reception and the admin. Members have their own (pages/member/Profile.tsx). */
export default function Account() {
  const { t } = useT();
  const { user } = useAuth();
  if (!user) return null;

  const rows: [string, string][] = [
    [t('field.fullName'), user.full_name],
    [t('field.email'), user.email],
    [t('field.role'), ROLE_LABEL[user.role]],
  ];

  return (
    <div>
      <PageHeader title={t('profile.title')} subtitle={t('profile.staffSub')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="card">
          <dl className="divide-y divide-ink/10">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-ink/60">{k}</dt>
                <dd className="break-all text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ChangePasswordCard />
      </div>
    </div>
  );
}
