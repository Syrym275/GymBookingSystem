import type { StaffAccount } from '../types';
import { ApiError } from './ApiError';
import { api } from './http';
import { requireUser } from './session';

/** The admin, receptionist and trainer logins (member logins are not "staff"). Passwords never leave the server. */
export async function listStaff(): Promise<StaffAccount[]> {
  requireUser(['admin']);
  return api<StaffAccount[]>('/admin/staff', 'Could not load staff accounts.');
}

export interface StaffInput {
  full_name: string;
  email: string;
  /** There is exactly one admin account, created with backend/scripts/create_admin.py, never here. */
  role: 'receptionist' | 'trainer';
  trainer_id?: number;
  /** First password, chosen by the admin and passed on to the person. Same rules as sign-up. */
  password: string;
}

export async function addStaff(input: StaffInput): Promise<StaffAccount> {
  requireUser(['admin']);
  if (!input.full_name.trim() || !/^\S+@\S+\.\S+$/.test(input.email)) {
    throw new ApiError('VALIDATION', 'Enter a name and a valid email.');
  }
  if (input.role === 'trainer' && !input.trainer_id) {
    throw new ApiError('VALIDATION', 'Choose which trainer profile this login belongs to.');
  }
  return api<StaffAccount>('/admin/staff', 'Could not create the account.', {
    method: 'POST',
    body: { ...input, email: input.email.trim() },
  });
}

export async function setStaffActive(userId: number, active: boolean): Promise<StaffAccount> {
  const viewer = requireUser(['admin']);
  if (viewer.user_id === userId && !active) throw new ApiError('VALIDATION', 'You cannot deactivate your own account.');
  return api<StaffAccount>(`/admin/staff/${userId}`, 'Could not change the account.', {
    method: 'PATCH',
    body: { is_active: active },
  });
}
