import { TODAY } from '../config';
import { hourLabel, mk } from '../utils/format';

interface Props {
  date: string;
  hours: number[]; // start hours to show
  taken: number[];
  selected?: number | null;
  range?: [number, number] | null; // highlight [start, end) hours (hall rental)
  onSelect?: (hour: number) => void;
}

/** Grid of hourly slots. Taken + past slots are disabled; pass no onSelect for a read-only view. */
export function SlotPicker({ date, hours, taken, selected, range, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {hours.map((h) => {
        const isTaken = taken.includes(h);
        const isPast = mk(date, h) < TODAY;
        const inRange = range ? h >= range[0] && h < range[1] : false;
        const isSel = selected === h || inRange;
        const disabled = isTaken || isPast || !onSelect;
        let style = 'border-ink/20 bg-white hover:border-brand hover:bg-brand-soft';
        if (isSel) style = 'border-ink bg-brand text-white shadow-hard-sm';
        else if (isTaken) style = 'border-ink/10 bg-[repeating-linear-gradient(45deg,#f3ece0,#f3ece0_6px,#fff_6px,#fff_12px)] text-ink/40 line-through';
        else if (isPast) style = 'border-ink/10 bg-slate-100 text-ink/30';
        else if (!onSelect) style = 'border-mint/50 bg-mint-soft text-mint-dark';
        return (
          <button
            key={h}
            type="button"
            disabled={disabled && !isSel}
            onClick={() => onSelect?.(h)}
            title={isTaken ? 'Already booked' : isPast ? 'Time has passed' : 'Free'}
            className={`rounded-xl border-2 px-2 py-2 text-sm font-bold transition ${style} ${
              disabled && !isSel ? 'cursor-not-allowed' : ''
            }`}
          >
            {hourLabel(h)}
          </button>
        );
      })}
    </div>
  );
}
