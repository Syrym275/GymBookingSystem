import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listPaymentsForBooking } from '../api/paymentsApi';
import { useAsync } from '../hooks/useAsync';
import type { BookingView } from '../types';
import { PLAN_LABEL, bkNumber, fmtDate, fmtDateTime, kzt, timeOf } from '../utils/format';
import { Modal } from './Modal';
import { PaidBadge, PaymentBadge, StatusBadge } from './StatusBadge';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

function Payments({ bookingId }: { bookingId: number }) {
  const { data, loading } = useAsync(() => listPaymentsForBooking(bookingId), [bookingId]);
  return (
    <div className="mt-4 border-t border-dashed border-ink/20 pt-3">
      <p className="label">Payment attempts</p>
      {loading && !data && <p className="text-sm text-ink/50">Loading…</p>}
      {data && data.length === 0 && <p className="text-sm text-ink/50">No payment attempts yet.</p>}
      <ul className="space-y-2">
        {data?.map((p) => (
          <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2 text-xs">
            <span className="font-mono">{p.provider_txn_ref}</span>
            <span className="uppercase">{p.method}</span>
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
  const { user } = useAuth();
  const role = user?.role;
  return (
    <Modal open={!!booking} title={booking ? `Booking ${bkNumber(booking.booking_id)}` : 'Booking'} onClose={onClose} footer={footer}>
      {booking && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <StatusBadge status={booking.status} />
            <PaidBadge status={booking.status} />
          </div>
          <div className="rounded-xl border border-line bg-sun-soft/60 px-4 py-2">
            <Row label="Type">{booking.booking_type === 'training' ? 'Personal training (60 min)' : 'Hall rental'}</Row>
            <Row label={booking.booking_type === 'training' ? 'Trainer' : 'Hall'}>
              {booking.trainer_name ?? booking.hall_name}
            </Row>
            <Row label="Date">{fmtDate(booking.start_time)}</Row>
            <Row label="Time">
              {timeOf(booking.start_time)} – {timeOf(booking.end_time)}
            </Row>
            <Row label="Price">{kzt(booking.price_kzt)}</Row>
            {role !== 'member' && <Row label="Member">{booking.member.full_name}</Row>}
            {booking.member.phone && <Row label="Phone">{booking.member.phone}</Row>}
            {booking.member.membership_plan && booking.member.membership_expires_on && (
              <Row label="Membership">
                {PLAN_LABEL[booking.member.membership_plan]} · until {fmtDate(booking.member.membership_expires_on)}
              </Row>
            )}
            {role === 'receptionist' && (
              <>
                <Row label="Payment">{booking.payment_status ?? (booking.paid ? 'paid' : 'unpaid')}</Row>
                {booking.paid_at && (
                  <Row label={booking.payment_status === 'refunded' ? 'Originally paid' : 'Paid at'}>
                    {fmtDateTime(booking.paid_at)}
                  </Row>
                )}
                {booking.payment_method && <Row label="Method">{booking.payment_method}</Row>}
              </>
            )}
            {booking.member.email && <Row label="Email">{booking.member.email}</Row>}
            <Row label="Created">{fmtDateTime(booking.created_at)}</Row>
          </div>
          {(role === 'member' || role === 'admin') && <Payments key={`${booking.booking_id}-${booking.status}`} bookingId={booking.booking_id} />}
        </div>
      )}
    </Modal>
  );
}
