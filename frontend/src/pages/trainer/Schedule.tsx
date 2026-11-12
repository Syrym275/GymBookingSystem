import { useState } from 'react';
import { startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listBookings } from '../../api/bookingsApi';
import { AttendanceButtons } from '../../components/AttendanceButtons';
import { BookingSlip } from '../../components/BookingSlip';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { CLOSE_HOUR, OPEN_HOUR, TODAY_DATE } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingStatus, BookingView } from '../../types';
import { addDaysStr, bkNumber, dateOf, fmtDay, hourLabel, hourOf, parseLocal, timeOf, toDate } from '../../utils/format';
import { isLive } from './analytics';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);
const thisWeek = () => toDate(startOfWeek(parseLocal(TODAY_DATE), { weekStartsOn: 1 }));

const BLOCK: Record<BookingStatus, string> = {
  pending: 'border-dashed border-line bg-sun-soft',
  confirmed: 'border-brand bg-brand-soft',
  completed: 'border-mint bg-mint-soft',
  no_show: 'border-berry bg-berry-soft',
  cancelled: 'border-line bg-sun-soft line-through opacity-50',
  expired: 'border-line bg-sun-soft opacity-50',
};

/** Week calendar + day list of the trainer's own sessions. */
export default function TrainerSchedule() {
  const [view, setView] = useState<'week' | 'day'>('week');
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [day, setDay] = useState(TODAY_DATE);
  const [slip, setSlip] = useState<BookingView | null>(null);
  const { data, error, loading, reload } = useAsync(() => listBookings(), []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));
  const live = data.filter(isLive);
  const dayList = live.filter((b) => dateOf(b.start_time) === day);
  const refresh = () => {
    setSlip(null);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Only your own training sessions. Click a session to open it."
        actions={
          <div className="inline-flex rounded-md border border-line bg-white p-1" role="group" aria-label="View">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded px-4 py-1.5 text-xs font-semibold uppercase tracking-wide ${view === v ? 'bg-brand text-onaccent' : 'text-ink/70 hover:bg-sun-soft'}`}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {view === 'week' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setWeekStart(addDaysStr(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setWeekStart(addDaysStr(weekStart, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setWeekStart(thisWeek())}>
              This week
            </button>
            <span className="ml-2 text-sm font-bold">
              {fmtDay(days[0])} – {fmtDay(days[6])}
            </span>
            {loading && <span className="text-xs text-ink/50">updating…</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-hard">
            <div className="grid min-w-[860px]" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
              <div className="border-b border-line bg-sun-soft" />
              {days.map((d) => (
                <div
                  key={d}
                  className={`border-b border-l border-line px-2 py-2 text-center text-xs font-extrabold uppercase ${d === TODAY_DATE ? 'bg-brand text-onaccent' : 'bg-sun-soft'}`}
                >
                  {fmtDay(d)}
                </div>
              ))}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="border-t border-line px-1 py-2 text-right text-[11px] font-bold text-ink/50">{hourLabel(h)}</div>
                  {days.map((d) => {
                    const cell = live.filter((b) => dateOf(b.start_time) === d && hourOf(b.start_time) === h);
                    return (
                      <div key={d + h} className={`min-h-[52px] border-l border-t border-line p-1 ${d === TODAY_DATE ? 'bg-brand-soft/30' : ''}`}>
                        {cell.map((b) => (
                          <button
                            key={b.booking_id}
                            onClick={() => setSlip(b)}
                            className={`w-full rounded-md border px-1.5 py-1 text-left text-[11px] font-bold leading-tight ${BLOCK[b.status]}`}
                          >
                            {b.member.full_name}
                            <span className="block font-normal text-ink/60">
                              {timeOf(b.start_time)}–{timeOf(b.end_time)}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-3 text-xs text-ink/70">
            {(['confirmed', 'pending', 'completed', 'no_show'] as BookingStatus[]).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded border ${BLOCK[s]}`} /> {s === 'no_show' ? 'No-show' : s[0].toUpperCase() + s.slice(1)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <label className="sr-only" htmlFor="ts-day">
              Day
            </label>
            <input id="ts-day" type="date" className="input w-auto" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button className="btn-ghost btn-sm" onClick={() => setDay(TODAY_DATE)}>
              Today
            </button>
          </div>
          {dayList.length === 0 ? (
            <EmptyState title="No sessions this day" text="Enjoy the free time!" />
          ) : (
            <div className="space-y-3">
              {dayList.map((b) => (
                <div key={b.booking_id} className="card-flat flex flex-wrap items-center gap-3">
                  <span className="w-28 font-display text-lg font-bold">
                    {timeOf(b.start_time)}–{timeOf(b.end_time)}
                  </span>
                  <button className="min-w-0 flex-1 text-left font-bold hover:underline" onClick={() => setSlip(b)}>
                    {b.member.full_name}
                    <span className="ml-2 font-mono text-xs font-normal text-ink/50">{bkNumber(b.booking_id)}</span>
                  </button>
                  <StatusBadge status={b.status} />
                  <AttendanceButtons booking={b} onDone={refresh} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <BookingSlip booking={slip} onClose={() => setSlip(null)} footer={slip && <AttendanceButtons booking={slip} onDone={refresh} />} />
    </div>
  );
}
