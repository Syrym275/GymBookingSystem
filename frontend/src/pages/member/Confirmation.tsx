import { Link, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getBooking } from '../../api/bookingsApi';
import { listPaymentsForBooking } from '../../api/paymentsApi';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, Loading } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { bkNumber, fmtDate, kzt, timeOf } from '../../utils/format';

export default function Confirmation() {
  const id = Number(useParams().bookingId);
  const booking = useAsync(() => getBooking(id), [id]);
  const payments = useAsync(() => listPaymentsForBooking(id), [id]);

  if (booking.error) return <ErrorNote message={booking.error} />;
  if (payments.error) return <ErrorNote message={payments.error} />;
  if (!booking.data) return <Loading />;
  const b = booking.data;
  const paid = payments.data?.find((p) => p.payment_status === 'approved');

  if (!b.paid) {
    return (
      <EmptyState
        title="This booking is not paid yet"
        action={
          <Link className="btn-primary" to={`/member/pay/${b.booking_id}`}>
            Go to payment
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-line bg-mint text-onaccent shadow-hard">
          <CheckCircle2 className="h-9 w-9" />
        </span>
        <h1 className="text-3xl font-extrabold">You are booked!</h1>
        <p className="mt-1 text-sm text-ink/60">Show this slip at the front desk if asked.</p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between bg-brand px-5 py-3 text-onaccent">
          <span className="font-display text-2xl font-extrabold">{bkNumber(b.booking_id)}</span>
          <StatusBadge status={b.status} />
        </div>
        <dl className="space-y-2 px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink/60">{b.booking_type === 'training' ? 'Trainer' : 'Hall'}</dt>
            <dd className="font-bold">{b.trainer_name ?? b.hall_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/60">Date</dt>
            <dd className="font-bold">{fmtDate(b.start_time)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/60">Time</dt>
            <dd className="font-bold">
              {timeOf(b.start_time)} – {timeOf(b.end_time)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink/60">Paid</dt>
            <dd className="font-bold">
              {kzt(b.price_kzt)} {paid && <span className="uppercase text-ink/50">· {paid.method}</span>}
            </dd>
          </div>
          {paid && (
            <div className="flex justify-between">
              <dt className="text-ink/60">Transaction</dt>
              <dd className="font-mono text-xs font-bold">{paid.provider_txn_ref}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/member/bookings" className="btn-primary">
          My bookings
        </Link>
        <Link to="/member" className="btn-ghost">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
