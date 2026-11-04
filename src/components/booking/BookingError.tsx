import { AlertTriangle } from 'lucide-react';
import { ApiError, type Suggestion } from '../../api/ApiError';
import { timeOf } from '../../utils/format';

/** Friendly messages for the database error codes (23P01 / GB001 / GB002 ...). */
export function BookingError({ error, onPick }: { error: unknown; onPick?: (s: Suggestion) => void }) {
  if (!error) return null;
  const err = error instanceof ApiError ? error : null;
  let title = 'Something went wrong';
  let text = error instanceof Error ? error.message : String(error);

  if (err?.code === '23P01') {
    title = 'This slot was just taken';
    text = 'Someone else (or one of your own bookings) already holds that time. Pick another slot:';
  } else if (err?.code === 'GB001') {
    title = 'Too many unpaid bookings';
  } else if (err?.code === 'GB002') {
    title = 'Membership not valid for that date';
    text += ' Ask reception to extend your membership.';
  }

  return (
    <div role="alert" className="rounded-xl border-2 border-berry bg-berry-soft p-4 text-sm">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="h-4 w-4 text-berry" /> {title}
      </p>
      <p className="mt-1">{text}</p>
      {err && err.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {err.suggestions.map((s) => (
            <button key={s.start_time} className="chip border-ink bg-white hover:bg-sun" onClick={() => onPick?.(s)}>
              {timeOf(s.start_time)}–{timeOf(s.end_time)}
            </button>
          ))}
        </div>
      )}
      {err?.code === '23P01' && err.suggestions.length === 0 && (
        <p className="mt-2 text-ink/70">No other free slot on this day — try another date.</p>
      )}
    </div>
  );
}
