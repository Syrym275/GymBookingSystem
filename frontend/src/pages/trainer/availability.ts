export type Availability = 'available' | 'break' | 'off';

export interface AvailabilityState {
  state: Availability;
  note: string;
  breakUntil: string | null;
  updatedAt: string | null; // local "YYYY-MM-DDTHH:mm"
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Available',
  break: 'On a break',
  off: 'Day off',
};

export const AVAILABILITY_HINT: Record<Availability, string> = {
  available: 'You are taking sessions as normal.',
  break: 'New bookings are blocked until the break ends. Existing bookings stay.',
  off: 'Not working today. Reception can see you are away.',
};
