import { useState, type ReactNode } from 'react';
import { Mail, Users } from 'lucide-react';
import {
  acceptInvitation,
  declineInvitation,
  listMyInvitations,
  removeFromGroup,
  type GroupInvitation,
} from '../../api/groupsApi';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { bookingTypeLabel, bookingWhat } from '../../utils/bookingKind';
import { bkNumber, fmtRange } from '../../utils/format';

const MAX = 5;

export default function Groups() {
  const { t } = useT();
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, reload } = useAsync(listMyInvitations, []);
  const [busy, setBusy] = useState<number | null>(null);
  const [toLeave, setToLeave] = useState<GroupInvitation | null>(null);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const invitations = data.filter((g) => g.status === 'invited');
  const joined = data
    .filter((g) => g.status === 'accepted')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const answer = async (g: GroupInvitation, accept: boolean) => {
    setBusy(g.booking_id);
    try {
      if (accept) await acceptInvitation(g.booking_id);
      else await declineInvitation(g.booking_id);
      toast.success(t(accept ? 'group.accepted' : 'group.declined'));
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('group.closed'));
    }
    setBusy(null);
  };

  const row = (g: GroupInvitation, actions: ReactNode) => (
    <div key={g.booking_id} className="card-flat flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="font-bold">
          <span className="mr-2 font-mono text-sm text-ink/50">{bkNumber(g.booking_id)}</span>
          {bookingWhat(g)}
          <span className="ml-2 text-xs font-normal text-ink/50">{bookingTypeLabel(g.booking_type)}</span>
        </p>
        <p className="text-sm text-ink/60">{fmtRange(g.start_time, g.end_time)}</p>
        <p className="text-sm text-ink/60">
          {t(g.status === 'invited' ? 'group.invitedBy' : 'group.hostedBy', { name: g.owner_name })} ·{' '}
          {t('group.people', { n: g.size, max: MAX })}
        </p>
      </div>
      {g.status === 'accepted' && <StatusBadge status={g.booking_status} />}
      <div className="flex gap-2">{actions}</div>
    </div>
  );

  return (
    <div>
      <PageHeader title={t('group.title')} subtitle={t('group.sub')} />

      <h2 className="mb-3 text-xl font-extrabold">{t('group.invitations')}</h2>
      {invitations.length === 0 ? (
        <EmptyState icon={<Mail className="h-6 w-6" />} title={t('group.noInvites')} />
      ) : (
        <div className="space-y-3">
          {invitations.map((g) =>
            row(
              g,
              <>
                <button className="btn-primary btn-sm" disabled={busy !== null} onClick={() => answer(g, true)}>
                  {t('group.accept')}
                </button>
                <button className="btn-ghost btn-sm" disabled={busy !== null} onClick={() => answer(g, false)}>
                  {t('group.decline')}
                </button>
              </>,
            ),
          )}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-xl font-extrabold">{t('group.joined')}</h2>
      {joined.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title={t('group.noJoined')} />
      ) : (
        <div className="space-y-3">
          {joined.map((g) =>
            row(
              g,
              g.start_time >= TODAY && (g.booking_status === 'pending' || g.booking_status === 'confirmed') ? (
                <button className="btn-danger btn-sm" onClick={() => setToLeave(g)}>
                  {t('group.leave')}
                </button>
              ) : null,
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toLeave}
        danger
        title={t('group.leaveQ')}
        message={t('group.leaveText')}
        confirmLabel={t('group.leave')}
        onCancel={() => setToLeave(null)}
        onConfirm={async () => {
          if (!toLeave || !user?.member_id) return;
          try {
            await removeFromGroup(toLeave.booking_id, user.member_id);
            toast.success(t('group.left'));
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('group.closed'));
          }
          setToLeave(null);
        }}
      />
    </div>
  );
}
