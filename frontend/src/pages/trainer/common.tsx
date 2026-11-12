import type { CSSProperties } from 'react';
import { Clock, Coffee, Moon, Play } from 'lucide-react';
import type { BookingView } from '../../types';
import { fmtDateTime, timeOf } from '../../utils/format';
import { AVAILABILITY_LABEL, type Availability } from './availability';
import type { ClientLabel, LiveStatus } from './analytics';

export const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2);

/** Recharts tooltip box that follows the light/dark theme. */
export const tooltipStyle: CSSProperties = {
  background: 'rgb(var(--surface))',
  border: '1px solid rgb(var(--line))',
  borderRadius: 8,
  color: 'rgb(var(--ink))',
  fontSize: 12,
};

/** Colour used for "no-show" in every chart (same hue as the danger colour of the theme). */
export const NO_SHOW_COLOR = '#F43F5E';

const CLIENT_CHIP: Record<ClientLabel, string> = {
  'At risk': 'border-berry/60 bg-berry-soft text-berry',
  Regular: 'border-brand/60 bg-brand-soft text-brand-dark',
  New: 'border-mint/60 bg-mint-soft text-mint-dark',
  Active: 'border-line bg-sun-soft text-ink/70',
  Inactive: 'border-line bg-transparent text-ink/40',
};

export function ClientChip({ label }: { label: ClientLabel }) {
  return <span className={`chip ${CLIENT_CHIP[label]}`}>{label}</span>;
}

const AVAIL_STYLE: Record<Availability, string> = {
  available: 'border-mint/60 bg-mint-soft text-mint-dark',
  break: 'border-line bg-sun-soft text-ink',
  off: 'border-berry/60 bg-berry-soft text-berry',
};
const AVAIL_ICON: Record<Availability, JSX.Element> = {
  available: <Play className="h-3 w-3" />,
  break: <Coffee className="h-3 w-3" />,
  off: <Moon className="h-3 w-3" />,
};

export function AvailabilityChip({ state }: { state: Availability }) {
  return (
    <span className={`chip gap-1.5 ${AVAIL_STYLE[state]}`}>
      {AVAIL_ICON[state]}
      {AVAILABILITY_LABEL[state]}
    </span>
  );
}

/** One sentence about what the trainer is doing right now, built from the schedule. */
export function LiveStatusLine({ live }: { live: LiveStatus }) {
  const row = (b: BookingView) => `${b.member.full_name} · ${timeOf(b.start_time)}–${timeOf(b.end_time)}`;
  if (live.current) {
    return (
      <div>
        <p className="flex items-center gap-2 font-display text-xl font-bold uppercase">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-brand" />
          </span>
          In a session
        </p>
        <p className="mt-1 text-sm text-ink/70">{row(live.current)}</p>
      </div>
    );
  }
  if (live.next) {
    return (
      <div>
        <p className="flex items-center gap-2 font-display text-xl font-bold uppercase">
          <Clock className="h-5 w-5 text-brand-dark" /> {live.todayLeft > 0 ? 'Free until your next session' : 'Free for the rest of today'}
        </p>
        <p className="mt-1 text-sm text-ink/70">
          Next: {live.todayLeft > 0 ? row(live.next) : `${live.next.member.full_name} · ${fmtDateTime(live.next.start_time)}`}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="flex items-center gap-2 font-display text-xl font-bold uppercase">
        <Clock className="h-5 w-5 text-brand-dark" /> Nothing booked
      </p>
      <p className="mt-1 text-sm text-ink/70">No upcoming sessions yet.</p>
    </div>
  );
}
