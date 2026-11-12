import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { createBooking, getTakenHours } from '../../api/bookingsApi';
import type { Suggestion } from '../../api/ApiError';
import { listTrainers } from '../../api/trainersApi';
import { CLOSE_HOUR, OPEN_HOUR, TODAY_DATE } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView } from '../../types';
import { addDaysStr, fmtDate, hourLabel, hourOf, kzt, mk } from '../../utils/format';
import { SlotPicker } from '../SlotPicker';
import { EmptyState, ErrorNote, Loading } from '../ui';
import { BookingError } from './BookingError';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i); // 07..21

/** Book a 60-minute session. Used by members (self) and reception (memberId given). */
export function TrainerBooking({ memberId, onBooked }: { memberId?: number; onBooked: (b: BookingView) => void }) {
  const trainers = useAsync(() => listTrainers(), []);
  const [trainerId, setTrainerId] = useState<number | null>(null);
  const [date, setDate] = useState(TODAY_DATE);
  const [hour, setHour] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const taken = useAsync(() => (trainerId ? getTakenHours('trainer', trainerId, date, memberId) : Promise.resolve([])), [trainerId, date, memberId]);
  const trainer = trainers.data?.find((t) => t.trainer_id === trainerId);

  const submit = async () => {
    if (!trainer || hour === null) return;
    setBusy(true);
    setError(null);
    try {
      const b = await createBooking({
        booking_type: 'training',
        member_id: memberId,
        trainer_id: trainer.trainer_id,
        start_time: mk(date, hour),
        end_time: mk(date, hour + 1),
      });
      onBooked(b);
    } catch (e) {
      setError(e);
      taken.reload();
      setHour(null);
    } finally {
      setBusy(false);
    }
  };

  const pick = (s: Suggestion) => {
    setError(null);
    setHour(hourOf(s.start_time));
  };

  if (trainers.loading && !trainers.data) return <Loading />;
  if (trainers.error) return <ErrorNote message={trainers.error} />;
  if (!trainers.data?.length) return <EmptyState title="No trainers available" text="Please check back later." />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="label">1 · Choose a trainer</p>
        <div className="space-y-3">
          {trainers.data.map((t) => (
            <button
              key={t.trainer_id}
              onClick={() => {
                setTrainerId(t.trainer_id);
                setHour(null);
                setError(null);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
                trainerId === t.trainer_id ? 'border-line bg-sun shadow-hard' : 'border-ink/20 bg-white hover:border-line'
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-onaccent">
                <Dumbbell className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold">{t.full_name}</span>
                <span className="block text-sm text-ink/60">{t.specialization}</span>
              </span>
              <span className="text-right text-sm font-bold">
                {kzt(t.session_price_kzt)}
                <span className="block text-xs font-normal text-ink/50">per hour</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!trainer ? (
          <EmptyState title="Pick a trainer first" text="Then choose a day and a free 60-minute slot." />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="tb-date">
                2 · Pick a date
              </label>
              <input
                id="tb-date"
                type="date"
                className="input max-w-xs"
                value={date}
                min={TODAY_DATE}
                max={addDaysStr(TODAY_DATE, 90)}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setHour(null);
                    setError(null);
                  }
                }}
              />
            </div>
            <div>
              <p className="label">3 · Pick a start time (60 min)</p>
              <SlotPicker date={date} hours={HOURS} taken={taken.data ?? []} selected={hour} onSelect={setHour} />
              {taken.loading && <p className="mt-2 text-sm text-ink/60">Checking availability…</p>}
              {taken.error && <ErrorNote message={taken.error} />}
              <p className="mt-2 text-xs text-ink/50">Striped slots are already booked. Open 07:00–22:00.</p>
            </div>
            <BookingError error={error} onPick={pick} />
            <div className="rounded-xl bg-cream p-4 text-sm">
              {hour === null ? (
                <span className="text-ink/60">Select a time to see the summary.</span>
              ) : (
                <>
                  <p className="font-bold">
                    {trainer.full_name} · {fmtDate(date)}
                  </p>
                  <p>
                    {hourLabel(hour)} – {hourLabel(hour + 1)} · <b>{kzt(trainer.session_price_kzt)}</b>
                  </p>
                  <p className="mt-1 text-xs text-ink/60">Booked as “pending” - the slot is held until it is paid.</p>
                </>
              )}
            </div>
            <button className="btn-primary w-full sm:w-auto" disabled={hour === null || busy || taken.loading || Boolean(taken.error)} onClick={submit}>
              {busy ? 'Reserving…' : 'Reserve this slot'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
