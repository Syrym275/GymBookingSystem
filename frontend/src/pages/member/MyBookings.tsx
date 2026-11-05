import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelBooking, listBookings } from '../../api/bookingsApi';
import { BookingSlip } from '../../components/BookingSlip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PaidBadge, StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { TODAY } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus, BookingView } from '../../types';
import { ALL_STATUSES, STATUS_LABEL, bkNumber, fmtRange, kzt } from '../../utils/format';

export default function MyBookings() {
  const toast = useToast();
  const { data, error, reload } = useAsync(() => listBookings(), []);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [slip, setSlip] = useState<BookingView | null>(null);
  const [toCancel, setToCancel] = useState<BookingView | null>(null);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const rows = data
    .filter((b) => (tab === 'upcoming' ? b.start_time >= TODAY : b.start_time < TODAY))
    .filter((b) => !status || b.status === status)
    .sort((a, b) => (tab === 'upcoming' ? a.start_time.localeCompare(b.start_time) : b.start_time.localeCompare(a.start_time)));

  const canCancel = (b: BookingView) => b.start_time >= TODAY && (b.status === 'pending' || b.status === 'confirmed');

  return (
    <div>
      <PageHeader title="My bookings" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-white p-1">
          {(['upcoming', 'past'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold capitalize ${tab === t ? 'bg-brand text-onaccent' : 'hover:bg-sun-soft'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="mb-status">
          Filter by status
        </label>
        <select id="mb-status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`No ${tab} bookings${status ? ` with status “${STATUS_LABEL[status]}”` : ''}`}
          action={
            tab === 'upcoming' ? (
              <Link to="/member/trainers" className="btn-primary">
                Book a session
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <div key={b.booking_id} className="card-flat flex flex-wrap items-center gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setSlip(b)}>
                <p className="font-bold">
                  <span className="mr-2 font-mono text-sm text-ink/50">{bkNumber(b.booking_id)}</span>
                  {b.trainer_name ?? b.hall_name}
                  <span className="ml-2 text-xs font-normal text-ink/50">{b.booking_type === 'training' ? 'Training' : 'Hall rental'}</span>
                </p>
                <p className="text-sm text-ink/60">{fmtRange(b.start_time, b.end_time)}</p>
              </button>
              <span className="text-sm font-bold">{kzt(b.price_kzt)}</span>
              <PaidBadge status={b.status} />
              <StatusBadge status={b.status} />
              <div className="flex gap-2">
                {b.status === 'pending' && b.start_time >= TODAY && (
                  <Link to={`/member/pay/${b.booking_id}`} className="btn-primary btn-sm">
                    Pay
                  </Link>
                )}
                {canCancel(b) && (
                  <button className="btn-danger btn-sm" onClick={() => setToCancel(b)}>
                    Cancel
                  </button>
                )}
                <button className="btn-ghost btn-sm" onClick={() => setSlip(b)}>
                  Slip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
      <ConfirmDialog
        open={!!toCancel}
        danger
        title={toCancel ? `Cancel ${bkNumber(toCancel.booking_id)}?` : ''}
        message={
          toCancel?.status === 'confirmed'
            ? 'This booking is paid. Cancelling will release the slot and mark your payment as refunded.'
            : 'The slot will be released for other members.'
        }
        confirmLabel="Cancel booking"
        onCancel={() => setToCancel(null)}
        onConfirm={async () => {
          if (!toCancel) return;
          try {
            await cancelBooking(toCancel.booking_id);
            toast.success(`${bkNumber(toCancel.booking_id)} cancelled.`);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not cancel.');
          }
          setToCancel(null);
        }}
      />
    </div>
  );
}
