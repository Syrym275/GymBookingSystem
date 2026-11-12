// The trainer's own availability ("status"). The backend has no field for this yet, so for now it is
// kept in this browser only (localStorage). When the backend adds one, replace read/write with API calls.

export type Availability = 'available' | 'break' | 'off';

export interface AvailabilityState {
  state: Availability;
  note: string;
  updatedAt: string | null; // local "YYYY-MM-DDTHH:mm"
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  break: 'On a break',
  off: 'Day off',
};

export const AVAILABILITY_HINT: Record<Availability, string> = {
  available: 'You are taking sessions as normal.',
  break: 'Short pause. Existing bookings stay, you are away for a while.',
  off: 'Not working today. Reception can see you are away.',
};

const key = (trainerId?: number) => `gbs_trainer_availability_${trainerId ?? 0}`;

export function readAvailability(trainerId?: number): AvailabilityState {
  try {
    const raw = localStorage.getItem(key(trainerId));
    if (raw) return JSON.parse(raw) as AvailabilityState;
  } catch {
    /* storage blocked - fall back to the default */
  }
  return { state: 'available', note: '', updatedAt: null };
}

export function writeAvailability(trainerId: number | undefined, value: AvailabilityState) {
  try {
    localStorage.setItem(key(trainerId), JSON.stringify(value));
  } catch {
    /* storage blocked - the choice lasts until the page is closed */
  }
}
