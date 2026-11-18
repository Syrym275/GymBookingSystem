import { useState } from 'react';
import { Building2, Users } from 'lucide-react';
import { createBooking, getTakenHours } from '../../api/bookingsApi';
import type { Suggestion } from '../../api/ApiError';
import { listHalls } from '../../api/hallsApi';
import { CLOSE_HOUR, OPEN_HOUR, TODAY, TODAY_DATE } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { BookingView } from '../../types';
import { addDaysStr, fmtDate, hourLabel, hourOf, kzt, mk } from '../../utils/format';
import { SlotPicker } from '../SlotPicker';
import { EmptyState, ErrorNote, Loading } from '../ui';
import { BookingError } from './BookingError';
import { useT } from '../../i18n';

const HOURS = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

/** Rent a hall for any whole-hour interval. Used by members (self) and reception (memberId given). */
export function HallBooking({ memberId, onBooked }: { memberId?: number; onBooked: (b: BookingView) => void }) {
  const { t, tp } = useT();
  const halls = useAsync(() => listHalls(), []);
  const [hallId, setHallId] = useState<number | null>(null);
  const [date, setDate] = useState(TODAY_DATE);
  const [start, setStart] = useState(18);
  const [end, setEnd] = useState(20);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const taken = useAsync(() => (hallId ? getTakenHours('hall', hallId, date) : Promise.resolve([])), [hallId, date]);
  const hall = halls.data?.find((h) => h.hall_id === hallId);

  const hoursCount = end - start;
  const clash = (taken.data ?? []).some((h) => h >= start && h < end);
  const past = mk(date, start) < TODAY;

  const changeStart = (s: number) => {
    setStart(s);
    if (end <= s) setEnd(s + 1);
    setError(null);
  };

  const submit = async () => {
    if (!hall) return;
    setBusy(true);
    setError(null);
    try {
      const b = await createBooking({
        booking_type: 'hall_rental',
        member_id: memberId,
        hall_id: hall.hall_id,
        start_time: mk(date, start),
        end_time: mk(date, end),
      });
      onBooked(b);
    } catch (e) {
      setError(e);
      taken.reload();
    } finally {
      setBusy(false);
    }
  };

  const pick = (s: Suggestion) => {
    setError(null);
    setStart(hourOf(s.start_time));
    setEnd(hourOf(s.end_time));
  };

  if (halls.loading && !halls.data) return <Loading />;
  if (halls.error) return <ErrorNote message={halls.error} />;
  if (!halls.data?.length) return <EmptyState title={t('hb.noHalls')} text={t('tb.checkLater')} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="label">{t('hb.step1')}</p>
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
          <EmptyState title={t('hb.pickFirst')} text={t('hb.pickFirstText')} />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="hb-date">
                {t('tb.step2')}
              </label>
              <input
                id="hb-date"
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
              <SlotPicker date={date} hours={HOURS} taken={taken.data ?? []} range={[start, end]} />
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="hb-start">
                  {t('hb.from')}
                </label>
                <select id="hb-start" className="input" value={start} onChange={(e) => changeStart(Number(e.target.value))}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="hb-end">
                  {t('hb.until')}
                </label>
                <select
                  id="hb-end"
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
            <BookingError error={error} onPick={pick} />
            <div className="rounded-xl bg-cream p-4 text-sm">
              <p className="font-bold">
                {hall.hall_name} · {fmtDate(date)}
              </p>
              <p>
                {hourLabel(start)} – {hourLabel(end)} · {t('hb.hours', { n: hoursCount })} × {kzt(hall.hourly_rate_kzt)} ={' '}
                <b className="text-brand-dark">{kzt(hall.hourly_rate_kzt * hoursCount)}</b>
              </p>
              <p className="mt-1 text-xs text-ink/60">{t('tb.pendingNote')}</p>
            </div>
            <button className="btn-primary w-full sm:w-auto" disabled={busy || clash || past} onClick={submit}>
              {busy ? t('tb.reserving') : t('hb.reserve')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
