import { DEMO_PASSWORD } from '../config';
import { getDb } from '../mock/db';
import type { CurrentUser, Role } from '../types';

// MOCK ONLY - the real backend checks credentials. See AuthContext.tsx.

export interface DemoAccount {
  role: Role;
  label: string;
  name: string;
  email: string;
  password: string;
  note: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'member', label: 'Member', name: 'Aruzhan Bekova', email: 'aruzhan.bekova@example.kz', password: DEMO_PASSWORD, note: 'Book, pay, manage bookings' },
  { role: 'trainer', label: 'Trainer', name: 'Aigerim Sadykova', email: 'aigerim.sadykova@gym.kz', password: DEMO_PASSWORD, note: 'Schedule, attendance, stats' },
  { role: 'receptionist', label: 'Receptionist', name: 'Anel Rakhimova', email: 'reception@gym.kz', password: DEMO_PASSWORD, note: 'Today, lookups, unpaid' },
  { role: 'admin', label: 'Admin / Manager', name: 'Madi Akhmetov', email: 'manager@gym.kz', password: DEMO_PASSWORD, note: 'Everything + reports' },
];

export function authenticate(email: string, password: string): CurrentUser | null {
  const u = getDb().users.find(
    (x) => x.is_active && x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password,
  );
  if (!u) return null;
  return { user_id: u.user_id, full_name: u.full_name, email: u.email, role: u.role, member_id: u.member_id, trainer_id: u.trainer_id };
}
