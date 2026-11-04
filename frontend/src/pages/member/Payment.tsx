import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CreditCard, Smartphone, Timer, Wifi } from 'lucide-react';
import { cancelBooking, expireBooking, getBooking } from '../../api/bookingsApi';
import { payBooking } from '../../api/paymentsApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { HOLD_MINUTES } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { PaymentMethod } from '../../types';
import { bkNumber, fmtDate, kzt, pad, timeOf } from '../../utils/format';

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: JSX.Element }[] = [
  { id: 'card', label: 'Bank card', hint: 'Visa / Mastercard', icon: <CreditCard className="h-5 w-5" /> },
  { id: 'nfc', label: 'NFC', hint: 'Tap at the terminal', icon: <Wifi className="h-5 w-5" /> },
  { id: 'app', label: 'Mobile app', hint: 'Pay in your bank app', icon: <Smartphone className="h-5 w-5" /> },
];

export default function Payment() {
  const { bookingId } = useParams();
  const id = Number(bookingId);
  const navigate = useNavigate();
  const toast = useToast();
  const booking = useAsync(() => getBooking(id), [id]);

  const [method, setMethod] = useState<PaymentMethod>('card');
  const [simulateDecline, setSimulateDecline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Hold countdown. (Demo: starts at 15:00 whenever this page opens.)
  const [secondsLeft, setSecondsLeft] = useState(HOLD_MINUTES * 60);

  const pending = booking.data?.status === 'pending';

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [pending]);

  useEffect(() => {
    if (pending && secondsLeft === 0) {
      void expireBooking(id).then(booking.reload);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, pending, id]);

  if (booking.error) return <ErrorNote message={booking.error} />;
  if (!booking.data) return <Loading />;
  const b = booking.data;

  if (!pending) {
    return (
      <div>
        <PageHeader title={`Payment for ${bkNumber(b.booking_id)}`} />
        <EmptyState
          title={b.status === 'expired' ? 'The payment hold ran out' : b.paid ? 'This booking is already paid' : `This booking is ${b.status}`}
          text={b.status === 'expired' ? 'The slot was released. You can book it again if it is still free.' : undefined}
          action={
            <Link className="btn-primary" to={b.paid ? `/member/confirmation/${b.booking_id}` : '/member/bookings'}>
              {b.paid ? 'View confirmation' : 'Go to my bookings'}
            </Link>
          }
        />
      </div>
    );
  }

  const pay = async () => {
    setBusy(true);
    setError(null);
    setDeclined(null);
    try {
      const res = await payBooking(id, method, simulateDecline ? 'decline' : 'approve');
      if (res.payment.payment_status === 'declined') {
        setDeclined(res.payment.provider_txn_ref);
      } else {
        toast.success('Payment approved - booking confirmed!');
        navigate(`/member/confirmation/${id}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.');
      booking.reload();
    } finally {
      setBusy(false);
    }
  };

  const mm = pad(Math.floor(secondsLeft / 60));
  const ss = pad(secondsLeft % 60);

  return (
    <div>
      <PageHeader title="Complete your payment" subtitle="Your slot is held while you pay." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="card space-y-5">
          <div className={`flex items-center gap-3 rounded-xl border-2 border-ink p-3 ${secondsLeft < 120 ? 'bg-berry-soft' : 'bg-sun-soft'}`}>
            <Timer className="h-6 w-6" />
            <div>
              <p className="font-display text-2xl font-extrabold tabular-nums">
                {mm}:{ss}
              </p>
              <p className="text-xs text-ink/70">left to pay before the slot is released</p>
            </div>
          </div>

          <div>
            <p className="label">Payment method</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  aria-pressed={method === m.id}
                  className={`rounded-xl border-2 p-3 text-left transition ${
                    method === m.id ? 'border-ink bg-mint-soft shadow-hard-sm' : 'border-ink/20 bg-white hover:border-ink'
                  }`}
                >
                  {m.icon}
                  <span className="mt-1 block text-sm font-bold">{m.label}</span>
                  <span className="block text-xs text-ink/60">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream p-3 text-sm">
            <input type="checkbox" checked={simulateDecline} onChange={(e) => setSimulateDecline(e.target.checked)} className="h-4 w-4 accent-brand" />
            <span>
              <b>Demo:</b> simulate a declined payment
            </span>
          </label>

          {declined && (
            <ErrorNote message={`Payment declined by the bank (ref ${declined}). Nothing was charged - try again or change the method.`} />
          )}
          {error && <ErrorNote message={error} />}

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={pay} disabled={busy}>
              {busy ? 'Processing…' : `Pay ${kzt(b.price_kzt)}`}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
              Cancel booking
            </button>
          </div>
        </div>

        <div className="card h-fit bg-sun-soft/60">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{bkNumber(b.booking_id)}</h2>
            <StatusBadge status={b.status} />
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">{b.booking_type === 'training' ? 'Trainer' : 'Hall'}</dt>
              <dd className="font-bold">{b.trainer_name ?? b.hall_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Date</dt>
              <dd className="font-bold">{fmtDate(b.start_time)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Time</dt>
              <dd className="font-bold">
                {timeOf(b.start_time)} – {timeOf(b.end_time)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t-2 border-dashed border-ink/20 pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-xl font-extrabold text-brand-dark">{kzt(b.price_kzt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        danger
        title="Cancel this booking?"
        message="The slot will be released for other members."
        confirmLabel="Cancel booking"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          try {
            await cancelBooking(id);
            toast.success('Booking cancelled.');
            navigate('/member/bookings', { replace: true });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not cancel.');
            setConfirmCancel(false);
          }
        }}
      />
    </div>
  );
}
