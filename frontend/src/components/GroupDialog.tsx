import { useState, type FormEvent } from 'react';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { getGroup, inviteToGroup, removeFromGroup, type GroupDetails } from '../api/groupsApi';
import { useAsync } from '../hooks/useAsync';
import { useT } from '../i18n';
import type { BookingView } from '../types';
import { bkNumber, fmtRange } from '../utils/format';
import { bookingWhat } from '../utils/bookingKind';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { ErrorNote, Loading } from './ui';

/** The owner of a booking sees who is in the group, invites members by email and removes them. */
export function GroupDialog({ booking, onClose }: { booking: BookingView | null; onClose: () => void }) {
  const { t } = useT();
  if (!booking) return null;
  return (
    <Modal open title={t('group.manageTitle', { id: bkNumber(booking.booking_id) })} onClose={onClose}>
      <GroupEditor booking={booking} />
    </Modal>
  );
}

function GroupEditor({ booking }: { booking: BookingView }) {
  const { t } = useT();
  const toast = useToast();
  const loaded = useAsync(() => getGroup(booking.booking_id), [booking.booking_id]);
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const current = group ?? loaded.data;
  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!current) return <Loading />;

  const open = current.participants.filter((p) => p.status === 'invited' || p.status === 'accepted');
  const full = 1 + open.length >= current.max_size;
  const editable = booking.status === 'pending' || booking.status === 'confirmed';

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy('invite');
    try {
      setGroup(await inviteToGroup(booking.booking_id, address));
      setEmail('');
      toast.success(t('group.invited', { email: address }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('group.closed'));
    }
    setBusy(null);
  };

  const remove = async (memberId: number, name: string) => {
    setBusy(`remove-${memberId}`);
    try {
      setGroup(await removeFromGroup(booking.booking_id, memberId));
      toast.success(t('group.removed', { name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('group.closed'));
    }
    setBusy(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sun-soft p-3 text-sm">
        <p className="font-bold">{bookingWhat(booking)}</p>
        <p className="text-ink/60">{fmtRange(booking.start_time, booking.end_time)}</p>
        <p className="mt-2 flex items-center gap-1.5 font-bold">
          <Users className="h-4 w-4" /> {t('group.people', { n: current.size, max: current.max_size })}
        </p>
      </div>
      <p className="text-sm text-ink/60">{t('group.free', { max: current.max_size })}</p>

      <ul className="divide-y divide-ink/10 rounded-xl border border-line">
        <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="font-bold">{t('group.you')}</span>
          <span className="chip">{t('group.status.accepted')}</span>
        </li>
        {open.map((p) => (
          <li key={p.member_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{p.full_name}</span>
              {p.email && <span className="block break-all text-xs text-ink/50">{p.email}</span>}
            </span>
            <span className="chip">{t(p.status === 'accepted' ? 'group.status.accepted' : 'group.status.invited')}</span>
            {editable && (
              <button
                className="btn-ghost btn-sm"
                disabled={busy !== null}
                onClick={() => remove(p.member_id, p.full_name)}
              >
                {busy === `remove-${p.member_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t(p.status === 'accepted' ? 'group.remove' : 'group.takeBack')}
              </button>
            )}
          </li>
        ))}
        {open.length === 0 && <li className="px-3 py-2 text-sm text-ink/50">{t('group.empty')}</li>}
      </ul>

      {!editable ? (
        <p className="text-sm text-ink/60">{t('group.closed')}</p>
      ) : full ? (
        <p className="text-sm font-bold">{t('group.full')}</p>
      ) : (
        <form onSubmit={invite} className="space-y-2">
          <label htmlFor="group-email" className="text-sm font-bold">
            {t('group.inviteLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="group-email"
              type="email"
              required
              autoComplete="off"
              className="input flex-1"
              placeholder="friend@example.kz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={busy !== null || !email.trim()}>
              {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {t('group.invite')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
