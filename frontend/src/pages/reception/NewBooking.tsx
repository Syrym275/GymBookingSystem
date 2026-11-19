import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { listMembers } from '../../api/membersApi';
import { HallBooking } from '../../components/booking/HallBooking';
import { TrainerBooking } from '../../components/booking/TrainerBooking';
import { BookingSlip } from '../../components/BookingSlip';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView } from '../../types';
import { PLAN_LABEL, bkNumber, fmtDate } from '../../utils/format';
import { MembershipBadge } from './MemberLookup';
import { useT } from '../../i18n';

export default function NewBooking() {
  const { t } = useT();
  const toast = useToast();
  const members = useAsync(() => listMembers(), []);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [kind, setKind] = useState<'training' | 'hall'>('training');
  const [created, setCreated] = useState<BookingView | null>(null);
  const [slip, setSlip] = useState<BookingView | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (members.error) return <ErrorNote message={members.error} />;
  if (!members.data) return <Loading />;
  const member = members.data.find((m) => m.member_id === memberId);

  return (
    <div>
      <PageHeader title={t('rec.newTitle')} subtitle={t('rec.newSub')} />

      <div className="card mb-6 max-w-2xl">
        <label className="label" htmlFor="nb-member">
          {t('rec.step1')}
        </label>
        <select
          id="nb-member"
          className="input"
          value={memberId ?? ''}
          onChange={(e) => {
            setMemberId(e.target.value ? Number(e.target.value) : null);
            setCreated(null);
            setFormKey((k) => k + 1);
          }}
        >
          <option value="">{t('rec.chooseMember')}</option>
          {members.data.map((m) => (
            <option key={m.member_id} value={m.member_id}>
              {m.full_name} · {m.phone}
            </option>
          ))}
        </select>
        {member && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-cream p-3 text-sm">
            <b>{PLAN_LABEL[member.membership_plan]}</b> · {t('rec.validUntilLower', { date: fmtDate(member.membership_expires_on) })}
            <MembershipBadge expires={member.membership_expires_on} />
          </div>
        )}
      </div>

      {created && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-mint-soft p-4 shadow-hard">
          <CheckCircle2 className="h-6 w-6 text-mint-dark" />
          <p className="flex-1 text-sm">
            <b>{bkNumber(created.booking_id)}</b> · <b>{created.member.full_name}</b> — {t('rec.createdWaiting')}
          </p>
          <button className="btn-ghost btn-sm" onClick={() => setSlip(created)}>
            {t('rec.viewSlip')}
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setCreated(null)}>
            {t('rec.another')}
          </button>
        </div>
      )}

      {!member ? (
        <p className="text-sm text-ink/60">{t('rec.selectToStart')}</p>
      ) : (
        <>
          <div className="mb-4 inline-flex rounded-xl border border-line bg-white p-1">
            {(['training', 'hall'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-4 py-1.5 text-sm font-bold ${kind === k ? 'bg-brand text-onaccent' : 'hover:bg-sun-soft'}`}
              >
                {k === 'training' ? t('rec.trainerSession') : t('type.hall')}
              </button>
            ))}
          </div>
          {kind === 'training' ? (
            <TrainerBooking
              key={`t-${formKey}`}
              memberId={member.member_id}
              onBooked={(b) => {
                toast.success(t('rec.created', { id: bkNumber(b.booking_id) }));
                setCreated(b);
                setFormKey((k) => k + 1);
              }}
            />
          ) : (
            <HallBooking
              key={`h-${formKey}`}
              memberId={member.member_id}
              onBooked={(b) => {
                toast.success(t('rec.created', { id: bkNumber(b.booking_id) }));
                setCreated(b);
                setFormKey((k) => k + 1);
              }}
            />
          )}
        </>
      )}
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
