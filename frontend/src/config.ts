// Keep booking limits aligned with the user's local calendar and current time.
const now = new Date();
export const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
export const TODAY_DATE = TODAY.slice(0, 10);

export const OPEN_HOUR = 7; // 07:00
export const CLOSE_HOUR = 22; // 22:00
export const MAX_PENDING = 2; // unpaid bookings per member
export const HOLD_MINUTES = 15; // payment hold
export const DEMO_PASSWORD = 'demo123';

// The member area is hidden until it is finished (it is planned for next week).
// Set this to true to bring back its pages, demo account, sign-up and sign-in.
export const MEMBER_AREA_ENABLED = false;
