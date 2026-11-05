import { useState } from 'react';
import { Phone } from 'lucide-react';
import { cancelBooking } from '../../api/bookingsApi';
import { unpaidMembers } from '../../api/reportsApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { MAX_PENDING } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView } from '../../types';
import { bkNumber, fmtRange, kzt } from '../../utils/format';

export default function ReceptionUnpaid() {
  const toast = useToast();
  const { data, error, reload } = useAsync(unpaidMembers, []);
  const [target, setTarget] = useState<BookingView | null>(null);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const total = data.reduce((s, g) => s + g.bookings.length, 0);

  return (
    <div>
      <PageHeader title="Unpaid bookings" subtitle={`${total} pending booking${total === 1 ? '' : 's'} across ${data.length} member${data.length === 1 ? '' : 's'}. Pending bookings hold the slot.`} />
      {data.length === 0 ? (
        <EmptyState title="Everything is paid 🎉" text="No pending bookings right now." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((g) => {
            const atLimit = g.bookings.length >= MAX_PENDING;
            return (
              <div key={g.member_id} className={`card ${atLimit ? 'bg-berry-soft/60' : ''}`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-extrabold">{g.full_name}</p>
                    <a href={`tel:${g.phone}`} className="inline-flex items-center gap-1 text-sm text-ink/70 hover:underline">
                      <Phone className="h-3 w-3" /> {g.phone}
                    </a>
                  </div>
                  <span className={`chip ${atLimit ? 'border-line bg-berry text-onaccent' : 'border-ink/20 bg-white'}`}>
                    {g.bookings.length} of {MAX_PENDING} unpaid{atLimit ? ' · at limit' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.bookings.map((b) => (
                    <div key={b.booking_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/15 bg-white p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          <span className="mr-2 font-mono text-xs text-ink/50">{bkNumber(b.booking_id)}</span>
                          {b.trainer_name ?? b.hall_name}
                        </p>
                        <p className="text-xs text-ink/60">{fmtRange(b.start_time, b.end_time)}</p>
                      </div>
                      <span className="font-bold">{kzt(b.price_kzt)}</span>
                      <button className="btn-danger btn-sm" onClick={() => setTarget(b)}>
                        Cancel booking
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!target}
        danger
        title={target ? `Cancel ${bkNumber(target.booking_id)}?` : ''}
        message={target ? `This releases the slot and frees one of ${target.member.full_name}'s ${MAX_PENDING} unpaid places.` : ''}
        confirmLabel="Cancel booking"
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return;
          try {
            await cancelBooking(target.booking_id);
            toast.success(`${bkNumber(target.booking_id)} cancelled.`);
            reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not cancel.');
          }
          setTarget(null);
        }}
      />
    </div>
  );
}
