import type { Role, StaffAccount } from '../types';
import { DEMO_PASSWORD } from '../config';
import { getDb, nextId, saveDb } from '../mock/db';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';

const strip = (u: { user_id: number; full_name: string; email: string; role: Role; trainer_id?: number; is_active: boolean }): StaffAccount => ({
  user_id: u.user_id,
  full_name: u.full_name,
  email: u.email,
  role: u.role,
  trainer_id: u.trainer_id,
  is_active: u.is_active,
});

/** Receptionist / trainer / admin logins (member logins are not "staff"). Passwords never leave the "server". */
export async function listStaff(): Promise<StaffAccount[]> {
  await delay();
  requireUser(['admin']);
  return clone(getDb().users.filter((u) => u.role !== 'member').map(strip));
}

export interface StaffInput {
  full_name: string;
  email: string;
  role: Exclude<Role, 'member'>;
  trainer_id?: number;
}

export async function addStaff(input: StaffInput): Promise<StaffAccount> {
  await delay();
  requireUser(['admin']);
  const db = getDb();
  if (!input.full_name.trim() || !/^\S+@\S+\.\S+$/.test(input.email)) {
    throw new ApiError('VALIDATION', 'Enter a name and a valid email.');
  }
  if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new ApiError('VALIDATION', 'An account with this email already exists.');
  }
  if (input.role === 'trainer' && !input.trainer_id) {
    throw new ApiError('VALIDATION', 'Choose which trainer profile this login belongs to.');
  }
  const u = {
    user_id: nextId('user'),
    full_name: input.full_name.trim(),
    email: input.email.trim(),
    password: DEMO_PASSWORD, // mock: the real backend sends an invite / reset link instead
    role: input.role,
    trainer_id: input.role === 'trainer' ? input.trainer_id : undefined,
    is_active: true,
  };
  db.users.push(u);
  saveDb();
  return clone(strip(u));
}

export async function setStaffActive(userId: number, active: boolean): Promise<StaffAccount> {
  await delay();
  const viewer = requireUser(['admin']);
  if (viewer.user_id === userId && !active) throw new ApiError('VALIDATION', 'You cannot deactivate your own account.');
  const u = getDb().users.find((x) => x.user_id === userId);
  if (!u || u.role === 'member') throw new ApiError('NOT_FOUND', 'Account not found.');
  u.is_active = active;
  saveDb();
  return clone(strip(u));
}
