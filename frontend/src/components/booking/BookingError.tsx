import { AlertTriangle } from 'lucide-react';
import { ApiError, type Suggestion } from '../../api/ApiError';
import { timeOf } from '../../utils/format';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';

/** Friendly messages for the database error codes (23P01 / GB001 / GB002 ...). */
export function BookingError({ error, onPick }: { error: unknown; onPick?: (s: Suggestion) => void }) {
  const { t } = useT();
  if (!error) return null;
  const err = error instanceof ApiError ? error : null;
  let title = t('bookErr.generic');
  let text = msg(error instanceof Error ? error.message : String(error));

  if (err?.code === '23P01') {
    title = t('bookErr.takenTitle');
    text = t('bookErr.takenText');
  } else if (err?.code === 'GB001') {
    title = t('bookErr.unpaidTitle');
  } else if (err?.code === 'GB002') {
    title = t('bookErr.membershipTitle');
    text += ' ' + t('bookErr.membershipHint');
  }

  return (
    <div role="alert" className="rounded-xl border border-berry bg-berry-soft p-4 text-sm">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle className="h-4 w-4 text-berry" /> {title}
      </p>
      <p className="mt-1">{text}</p>
      {err && err.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {err.suggestions.map((s) => (
            <button key={s.start_time} className="chip border-line bg-white hover:bg-sun" onClick={() => onPick?.(s)}>
              {timeOf(s.start_time)}–{timeOf(s.end_time)}
            </button>
          ))}
        </div>
      )}
      {err?.code === '23P01' && err.suggestions.length === 0 && (
        <p className="mt-2 text-ink/70">{t('bookErr.noOther')}</p>
      )}
    </div>
  );
}
