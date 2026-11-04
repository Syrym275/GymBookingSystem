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

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const BLOCK: Record<BookingStatus, string> = {
  pending: 'bg-sun-soft border-sun',
  confirmed: 'bg-mint-soft border-mint',
  completed: 'bg-sky-100 border-sky-400',
  no_show: 'bg-berry-soft border-berry',
  cancelled: 'bg-slate-100 border-slate-300 line-through opacity-60',
  expired: 'bg-orange-50 border-orange-300 opacity-60',
};

export default function TrainerSchedule() {
  const [view, setView] = useState<'week' | 'day'>('week');
  const [weekStart, setWeekStart] = useState(toDate(startOfWeek(parseLocal(TODAY_DATE), { weekStartsOn: 1 })));
  const [day, setDay] = useState(TODAY_DATE);
  const [slip, setSlip] = useState<BookingView | null>(null);
  const { data, error, loading, reload } = useAsync(() => listBookings(), []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const days = Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i));
  const live = data.filter((b) => b.status !== 'cancelled' && b.status !== 'expired');
  const dayList = live.filter((b) => dateOf(b.start_time) === day);

  const refresh = () => {
    setSlip(null);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="My schedule"
        subtitle="Only your own training sessions. Click a session to open it."
        actions={
          <div className="inline-flex rounded-xl border-2 border-ink bg-white p-1">
            {(['week', 'day'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-lg px-4 py-1.5 text-sm font-bold capitalize ${view === v ? 'bg-brand text-white' : 'hover:bg-sun-soft'}`}>
                {v}
              </button>
            ))}
          </div>
        }
      />

      {view === 'week' ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setWeekStart(addDaysStr(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setWeekStart(addDaysStr(weekStart, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setWeekStart(toDate(startOfWeek(parseLocal(TODAY_DATE), { weekStartsOn: 1 })))}>
              This week
            </button>
            <span className="ml-2 text-sm font-bold">
              {fmtDay(days[0])} – {fmtDay(days[6])}
            </span>
            {loading && <span className="text-xs text-ink/50">updating…</span>}
          </div>
          <div className="overflow-x-auto rounded-2xl border-2 border-ink bg-white shadow-hard">
            <div className="grid min-w-[860px]" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
              <div className="border-b-2 border-ink bg-sun-soft" />
              {days.map((d) => (
                <div
                  key={d}
                  className={`border-b-2 border-l border-ink border-l-ink/10 px-2 py-2 text-center text-xs font-extrabold uppercase ${
                    d === TODAY_DATE ? 'bg-brand text-white' : 'bg-sun-soft'
                  }`}
                >
                  {fmtDay(d)}
                </div>
              ))}
              {HOURS.map((h) => (
                <div key={h} className="contents">
                  <div className="border-t border-ink/10 px-1 py-2 text-right text-[11px] font-bold text-ink/50">{hourLabel(h)}</div>
                  {days.map((d) => {
                    const cell = live.filter((b) => dateOf(b.start_time) === d && hourOf(b.start_time) === h);
                    return (
                      <div key={d + h} className={`min-h-[52px] border-l border-t border-ink/10 p-1 ${d === TODAY_DATE ? 'bg-brand-soft/30' : ''}`}>
                        {cell.map((b) => (
                          <button
                            key={b.booking_id}
                            onClick={() => setSlip(b)}
                            className={`w-full rounded-lg border-2 px-1.5 py-1 text-left text-[11px] font-bold leading-tight ${BLOCK[b.status]}`}
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
                  <span className="w-28 font-display text-lg font-extrabold">
                    {timeOf(b.start_time)}–{timeOf(b.end_time)}
                  </span>
                  <button className="min-w-0 flex-1 text-left font-bold" onClick={() => setSlip(b)}>
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
