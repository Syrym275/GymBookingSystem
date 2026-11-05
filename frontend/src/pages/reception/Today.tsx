import { useState } from 'react';
import { Clock } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { AttendanceButtons } from '../../components/AttendanceButtons';
import { BookingSlip } from '../../components/BookingSlip';
import { PaidBadge, StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { CLOSE_HOUR, OPEN_HOUR, TODAY, TODAY_DATE } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView } from '../../types';
import { addMinutesStr, bkNumber, fmtDate, hourLabel, hourOf, timeOf } from '../../utils/format';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

function Item({ b, onOpen, onDone }: { b: BookingView; onOpen: () => void; onDone: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/15 bg-white p-3">
      <span className={`h-10 w-1.5 rounded-full ${b.booking_type === 'training' ? 'bg-brand' : 'bg-mint'}`} />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="font-bold">
          {b.member.full_name} <span className="font-mono text-xs font-normal text-ink/50">{bkNumber(b.booking_id)}</span>
        </p>
        <p className="text-sm text-ink/60">
          {b.trainer_name ?? b.hall_name} · {timeOf(b.start_time)}–{timeOf(b.end_time)} · {b.member.phone}
        </p>
      </button>
      <PaidBadge status={b.status} />
      <StatusBadge status={b.status} />
      <AttendanceButtons booking={b} onDone={onDone} />
    </div>
  );
}

export default function ReceptionToday() {
  const { data, error, reload } = useAsync(() => listBookings({ from: TODAY_DATE, to: TODAY_DATE }), []);
  const [slip, setSlip] = useState<BookingView | null>(null);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const limit = addMinutesStr(TODAY, 120);
  const soon = data.filter((b) => b.start_time >= TODAY && b.start_time < limit && (b.status === 'pending' || b.status === 'confirmed'));
  const refresh = () => {
    setSlip(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Today" subtitle={`${fmtDate(TODAY_DATE)} · ${data.length} booking${data.length === 1 ? '' : 's'}`} />

      <div className="card mb-6 bg-sun-soft/60">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <Clock className="h-5 w-5" /> Starting in the next 2 hours
        </h2>
        {soon.length === 0 ? (
          <p className="text-sm text-ink/60">Nothing starts between {timeOf(TODAY)} and {timeOf(limit)}.</p>
        ) : (
          <div className="space-y-2">
            {soon.map((b) => (
              <Item key={b.booking_id} b={b} onOpen={() => setSlip(b)} onDone={refresh} />
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-xl font-extrabold">Timeline</h2>
      {data.length === 0 ? (
        <EmptyState title="No bookings today" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-hard">
          {HOURS.map((h) => {
            const here = data.filter((b) => hourOf(b.start_time) === h);
            return (
              <div key={h} className="flex gap-3 border-t border-ink/10 px-3 py-2 first:border-t-0">
                <div className="w-14 shrink-0 pt-3 text-right text-xs font-bold text-ink/50">{hourLabel(h)}</div>
                <div className="min-h-[44px] flex-1 space-y-2">
                  {here.map((b) => (
                    <Item key={b.booking_id} b={b} onOpen={() => setSlip(b)} onDone={refresh} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <BookingSlip booking={slip} onClose={() => setSlip(null)} />
    </div>
  );
}
