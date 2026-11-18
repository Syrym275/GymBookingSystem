import { t, type Key } from '../../i18n';
export type Availability = 'available' | 'break' | 'off';

export interface AvailabilityState {
  state: Availability;
  note: string;
  breakUntil: string | null;
  updatedAt: string | null; // local "YYYY-MM-DDTHH:mm"
}

// Texts come from the dictionary (avail.<state> / avail.<state>.hint) when they are read.
function byState(suffix: string): Record<Availability, string> {
  const out = {} as Record<Availability, string>;
  for (const s of ['available', 'break', 'off'] as const) {
    Object.defineProperty(out, s, { enumerable: true, get: () => t(`avail.${s}${suffix}` as Key) });
  }
  return out;
}

export const AVAILABILITY_LABEL: Record<Availability, string> = byState('');

export const AVAILABILITY_HINT: Record<Availability, string> = byState('.hint');
