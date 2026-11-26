import { useState } from 'react';
import { Building2, Dumbbell, Users } from 'lucide-react';
import { createBooking, getTakenHours } from '../../api/bookingsApi';
import { listHalls } from '../../api/hallsApi';
import { getTrainerAvailability, listTrainers } from '../../api/trainersApi';
import { CLOSE_HOUR, OPEN_HOUR, TODAY, TODAY_DATE } from '../../config';
import { specializationLabel } from '../../data/gymData';
import { useAsync } from '../../hooks/useAsync';
import { AvailabilityChip } from '../../pages/trainer/common';
import type { BookingView } from '../../types';
import { addDaysStr, fmtDate, hourLabel, kzt, mk } from '../../utils/format';
import { useT } from '../../i18n';
import { SlotPicker } from '../SlotPicker';
import { EmptyState, ErrorNote, Loading } from '../ui';
import { BookingError } from './BookingError';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

/**
 * Hall + trainer in ONE booking (the "3-way connection": member, hall, trainer).
 * The member picks a hall and a time, then only trainers who are free for that whole time can be chosen.
 * Used by members (self) and reception (memberId given).
 */
export function CombinedBooking({ memberId, onBooked }: { memberId?: number; onBooked: (b: BookingView) => void }) {
  const { t, tp } = useT();
  const halls = useAsync(() => listHalls(), []);
  const trainers = useAsync(() => listTrainers(), []);
  const [hallId, setHallId] = useState<number | null>(null);
  const [trainerId, setTrainerId] = useState<number | null>(null);
  const [date, setDate] = useState(TODAY_DATE);
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(19);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const hall = halls.data?.find((h) => h.hall_id === hallId);
  const trainer = trainers.data?.find((x) => x.trainer_id === trainerId);

  // What is blocked on this day: the hall's hours, and for every trainer their hours + day off / break.
  const hallTaken = useAsync(() => (hallId ? getTakenHours('hall', hallId, date, memberId) : Promise.resolve([] as number[])), [hallId, date, memberId]);
  const trainerDay = useAsync(
    () =>
      hallId
        ? Promise.all(
            (trainers.data ?? []).map(async (tr) => {
              const [availability, taken] = await Promise.all([
                getTrainerAvailability(tr.trainer_id),
                getTakenHours('trainer', tr.trainer_id, date, memberId),
              ]);
              return { id: tr.trainer_id, state: availability.state, taken };
            }),
          )
        : Promise.resolve([]),
    [hallId, trainers.data, date, memberId],
  );

  const hours = end - start;
  const clash = (hallTaken.data ?? []).some((h) => h >= start && h < end);
  const past = mk(date, start) < TODAY;

  const dayOf = (id: number) => trainerDay.data?.find((x) => x.id === id);
  /** null = free for the whole time, otherwise why not. */
  const whyBusy = (id: number): 'off' | 'break' | 'busy' | null => {
    const info = dayOf(id);
    if (!info) return null;
    if (info.state === 'off') return 'off';
    if (info.taken.some((h) => h >= start && h < end)) return info.state === 'break' ? 'break' : 'busy';
    return null;
  };
  const freeTrainers = (trainers.data ?? []).filter((x) => whyBusy(x.trainer_id) === null);
  const trainerFree = trainer ? whyBusy(trainer.trainer_id) === null : false;

  const refresh = () => {
    hallTaken.reload();
    trainerDay.reload();
  };
  const changeStart = (s: number) => {
    setStart(s);
    if (end <= s) setEnd(s + 1);
    setError(null);
  };

  const submit = async () => {
    if (!hall || !trainer) return;
    setBusy(true);
    setError(null);
    try {
      const b = await createBooking({
        booking_type: 'combined',
        member_id: memberId,
        hall_id: hall.hall_id,
        trainer_id: trainer.trainer_id,
        start_time: mk(date, start),
        end_time: mk(date, end),
      });
      onBooked(b);
    } catch (e) {
      setError(e);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if ((halls.loading && !halls.data) || (trainers.loading && !trainers.data)) return <Loading />;
  if (halls.error) return <ErrorNote message={halls.error} />;
  if (trainers.error) return <ErrorNote message={trainers.error} />;
  if (!halls.data?.length) return <EmptyState title={t('hb.noHalls')} text={t('tb.checkLater')} />;
  if (!trainers.data?.length) return <EmptyState title={t('tb.noTrainers')} text={t('tb.checkLater')} />;

  const total = hall && trainer ? (hall.hourly_rate_kzt + trainer.session_price_kzt) * hours : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="label">{t('cb.step1')}</p>
        <div className="space-y-3">
          {halls.data.map((h) => (
            <button
              key={h.hall_id}
              onClick={() => {
                setHallId(h.hall_id);
                setError(null);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
                hallId === h.hall_id ? 'border-line bg-sun shadow-hard' : 'border-ink/20 bg-white hover:border-line'
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-onaccent">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold">{h.hall_name}</span>
                <span className="flex items-center gap-1 text-sm text-ink/60">
                  <Users className="h-3 w-3" /> {tp('landing.halls.upTo', h.capacity)}
                </span>
              </span>
              <span className="text-right text-sm font-bold">
                {kzt(h.hourly_rate_kzt)}
                <span className="block text-xs font-normal text-ink/50">{t('tb.perHour')}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!hall ? (
          <EmptyState title={t('hb.pickFirst')} text={t('cb.pickHallText')} />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="cb-date">
                {t('cb.step2')}
              </label>
              <input
                id="cb-date"
                type="date"
                className="input max-w-xs"
                value={date}
                min={TODAY_DATE}
                max={addDaysStr(TODAY_DATE, 90)}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    setError(null);
                  }
                }}
              />
            </div>
            <div>
              <p className="label">{t('hb.availability')}</p>
              <SlotPicker date={date} hours={HOURS} taken={hallTaken.data ?? []} range={[start, end]} />
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cb-start">
                  {t('cb.from')}
                </label>
                <select id="cb-start" className="input" value={start} onChange={(e) => changeStart(Number(e.target.value))}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="cb-end">
                  {t('hb.until')}
                </label>
                <select
                  id="cb-end"
                  className="input"
                  value={end}
                  onChange={(e) => {
                    setEnd(Number(e.target.value));
                    setError(null);
                  }}
                >
                  {HOURS.filter((h) => h > start)
                    .concat(CLOSE_HOUR)
                    .map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {clash && <ErrorNote message={t('hb.clash')} />}
            {past && <ErrorNote message={t('hb.past')} />}

            <div>
              <p className="label">{t('cb.step3')}</p>
              {trainerDay.loading && !trainerDay.data ? (
                <p className="text-sm text-ink/60">{t('tb.checking')}</p>
              ) : trainerDay.error ? (
                <ErrorNote message={trainerDay.error} />
              ) : (
                <>
                  <p className="mb-2 text-xs text-ink/60" data-testid="cb-free-count">
                    {freeTrainers.length === 0 ? t('cb.noneFree') : t('cb.freeCount', { n: freeTrainers.length, from: hourLabel(start), to: hourLabel(end) })}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {trainers.data.map((tr) => {
                      const why = whyBusy(tr.trainer_id);
                      const selected = trainerId === tr.trainer_id;
                      return (
                        <button
                          key={tr.trainer_id}
                          type="button"
                          disabled={why !== null}
                          onClick={() => {
                            setTrainerId(tr.trainer_id);
                            setError(null);
                          }}
                          aria-pressed={selected}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                            why !== null
                              ? 'cursor-not-allowed border-ink/10 bg-slate-50 opacity-60'
                              : selected
                                ? 'border-line bg-sun shadow-hard'
                                : 'border-ink/20 bg-white hover:border-line'
                          }`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-onaccent">
                            <Dumbbell className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold leading-tight">{tr.full_name}</span>
                            <span className="block text-xs text-ink/60">{specializationLabel(tr.specialization)}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {why === null ? (
                                <span className="chip border-mint/60 bg-mint-soft text-mint-dark">{t('cb.free')}</span>
                              ) : (
                                <span className="chip border-berry/60 bg-berry-soft text-berry">
                                  {why === 'off' ? t('cb.dayOff') : why === 'break' ? t('cb.onBreak') : t('cb.busy')}
                                </span>
                              )}
                              {dayOf(tr.trainer_id) && why === null && dayOf(tr.trainer_id)!.state !== 'available' && <AvailabilityChip state={dayOf(tr.trainer_id)!.state} />}
                            </span>
                          </span>
                          <span className="text-right text-xs font-bold">
                            {kzt(tr.session_price_kzt)}
                            <span className="block font-normal text-ink/50">{t('tb.perHour')}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <BookingError error={error} />
            <div className="rounded-xl bg-cream p-4 text-sm">
              <p className="font-bold">
                {hall.hall_name}
                {trainer ? ` + ${trainer.full_name}` : ''} · {fmtDate(date)}
              </p>
              <p>
                {hourLabel(start)} – {hourLabel(end)} · {t('hb.hours', { n: hours })}
              </p>
              {trainer && trainerFree ? (
                <>
                  <p className="mt-1 text-ink/70">
                    {t('cb.breakdown', {
                      hall: kzt(hall.hourly_rate_kzt),
                      trainer: kzt(trainer.session_price_kzt),
                      n: hours,
                    })}{' '}
                    = <b className="text-brand-dark">{kzt(total)}</b>
                  </p>
                  <p className="mt-1 text-xs text-ink/60">{t('cb.together')}</p>
                  <p className="mt-1 text-xs text-ink/60">{t('tb.pendingNote')}</p>
                </>
              ) : (
                <p className="mt-1 text-ink/60">{trainer ? t('cb.trainerBusy') : t('cb.pickTrainer')}</p>
              )}
            </div>
            <button className="btn-primary w-full sm:w-auto" disabled={busy || clash || past || !trainer || !trainerFree} onClick={submit}>
              {busy ? t('tb.reserving') : t('cb.reserve')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
