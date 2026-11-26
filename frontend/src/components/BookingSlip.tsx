import { bookingTypeLabel } from '../utils/bookingKind';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listPaymentsForBooking } from '../api/paymentsApi';
import { useAsync } from '../hooks/useAsync';
import type { BookingView } from '../types';
import { PLAN_LABEL, bkNumber, fmtDate, fmtDateTime, kzt, timeOf } from '../utils/format';
import { Modal } from './Modal';
import { PaidBadge, PaymentBadge, StatusBadge } from './StatusBadge';
import { useT, type Key } from '../i18n';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

function Payments({ bookingId }: { bookingId: number }) {
  const { t } = useT();
  const { data, loading, error } = useAsync(() => listPaymentsForBooking(bookingId), [bookingId]);
  return (
    <div className="mt-4 border-t border-dashed border-ink/20 pt-3">
      <p className="label">{t('slip.attempts')}</p>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {loading && !data && <p className="text-sm text-ink/50">{t('common.loading')}</p>}
      {data && data.length === 0 && <p className="text-sm text-ink/50">{t('slip.noAttempts')}</p>}
      <ul className="space-y-2">
        {data?.map((p) => (
          <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2 text-xs">
            <span className="font-mono">{p.provider_txn_ref}</span>
            <span>{t(`method.${p.method}` as Key)}</span>
            <span className="font-bold">{kzt(p.amount_kzt)}</span>
            <PaymentBadge status={p.payment_status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "booking slip": everything about one booking, fields depend on who is looking. */
export function BookingSlip({ booking, onClose, footer }: { booking: BookingView | null; onClose: () => void; footer?: ReactNode }) {
  const { t } = useT();
  const { user } = useAuth();
  const role = user?.role;
  return (
    <Modal open={!!booking} title={booking ? t('slip.title', { id: bkNumber(booking.booking_id) }) : t('table.booking')} onClose={onClose} footer={footer}>
      {booking && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <StatusBadge status={booking.status} />
            <PaidBadge status={booking.status} />
          </div>
          <div className="rounded-xl border border-line bg-sun-soft/60 px-4 py-2">
            <Row label={t('table.type')}>{booking.booking_type === 'training' ? t('slip.training') : bookingTypeLabel(booking.booking_type)}</Row>
            {booking.hall_name && <Row label={t('table.hall')}>{booking.hall_name}</Row>}
            {booking.trainer_name && <Row label={t('role.trainer')}>{booking.trainer_name}</Row>}
            <Row label={t('slip.date')}>{fmtDate(booking.start_time)}</Row>
            <Row label={t('slip.time')}>
              {timeOf(booking.start_time)} – {timeOf(booking.end_time)}
            </Row>
            <Row label={t('table.price')}>{kzt(booking.price_kzt)}</Row>
            {role !== 'member' && <Row label={t('role.member')}>{booking.member.full_name}</Row>}
            {booking.member.phone && <Row label={t('field.phone')}>{booking.member.phone}</Row>}
            {booking.member.membership_plan && booking.member.membership_expires_on && (
              <Row label={t('slip.membership')}>
                {PLAN_LABEL[booking.member.membership_plan]} · {t('slip.until', { date: fmtDate(booking.member.membership_expires_on) })}
              </Row>
            )}
            {role === 'receptionist' && (
              <>
                <Row label={t('table.payment')}>{booking.payment_status ? t(`payStatus.${booking.payment_status}` as Key) : booking.paid ? t('pay.paid') : t('pay.unpaid')}</Row>
                {booking.paid_at && (
                  <Row label={booking.payment_status === 'refunded' ? t('table.originallyPaid') : t('slip.paidAt')}>
                    {fmtDateTime(booking.paid_at)}
                  </Row>
                )}
                {booking.payment_method && <Row label={t('slip.method')}>{t(`method.${booking.payment_method}` as Key)}</Row>}
              </>
            )}
            {booking.member.email && <Row label={t('field.email')}>{booking.member.email}</Row>}
            <Row label={t('slip.created')}>{fmtDateTime(booking.created_at)}</Row>
          </div>
          {(role === 'member' || role === 'admin') && <Payments key={`${booking.booking_id}-${booking.status}`} bookingId={booking.booking_id} />}
        </div>
      )}
    </Modal>
  );
}
