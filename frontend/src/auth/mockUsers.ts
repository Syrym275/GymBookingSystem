import { addMonths } from 'date-fns';
import { DEMO_PASSWORD, TODAY, TODAY_DATE } from '../config';
import { ApiError } from '../api/ApiError';
import { getDb, nextId, saveDb } from '../mock/db';
import { qrToken } from '../mock/seed';
import type { CurrentUser, Member, MembershipPlan, Role, UserAccount } from '../types';
import { toDate } from '../utils/format';

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
  { role: 'receptionist', label: 'Receptionist', name: 'Anel Rakhimova', email: 'reception@gym.kz', password: DEMO_PASSWORD, note: 'Today, lookups, unpaid' },
];

// Trainer and admin areas are hidden for now, so only these roles can sign in.
export const ENABLED_ROLES: Role[] = ['member', 'receptionist'];

export function authenticate(email: string, password: string): CurrentUser | null {
  const u = getDb().users.find(
    (x) => x.is_active && x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password,
  );
  if (!u || !ENABLED_ROLES.includes(u.role)) return null;
  return toCurrent(u);
}

function toCurrent(u: UserAccount): CurrentUser {
  return { user_id: u.user_id, full_name: u.full_name, email: u.email, role: u.role, member_id: u.member_id, trainer_id: u.trainer_id };
}

export interface RegisterInput {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  membership_plan: MembershipPlan;
}

export const PLAN_MONTHS: Record<MembershipPlan, number> = { monthly: 1, quarterly: 3, annual: 12 };

/** Accepts "+7 701 123 45 67", "87011234567", "7011234567" ... -> "+77011234567" (or null). */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[\s()-]/g, '');
  if (d.startsWith('+7')) d = d.slice(2);
  else if (/^[78]\d{10}$/.test(d)) d = d.slice(1);
  return /^\d{10}$/.test(d) ? `+7${d}` : null;
}

/**
 * MOCK self sign-up: creates a members row + a member login account.
 * The real backend replaces this with e.g. POST /auth/register (and checks uniqueness server-side).
 */
export function registerMember(input: RegisterInput): CurrentUser {
  const db = getDb();
  const full_name = input.full_name.trim().replace(/\s+/g, ' ');
  const email = input.email.trim();
  const phone = normalizePhone(input.phone);

  if (full_name.length < 2) throw new ApiError('VALIDATION', 'Please enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('VALIDATION', 'Please enter a valid email.');
  if (!phone) throw new ApiError('VALIDATION', 'Phone must be a Kazakhstan number, e.g. +7 701 123 45 67.');
  if (input.password.length < 6) throw new ApiError('VALIDATION', 'Password must be at least 6 characters.');
  if (!(input.membership_plan in PLAN_MONTHS)) throw new ApiError('VALIDATION', 'Please choose a membership plan.');
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()) || db.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    throw new ApiError('VALIDATION', 'An account with this email already exists. Try signing in.');
  }
  if (db.members.some((m) => m.phone === phone)) throw new ApiError('VALIDATION', 'This phone number is already registered.');

  const member_id = nextId('member');
  const member: Member = {
    member_id,
    full_name,
    email,
    phone,
    qr_code_token: qrToken(member_id),
    membership_plan: input.membership_plan,
    membership_expires_on: toDate(addMonths(new Date(`${TODAY_DATE}T00:00`), PLAN_MONTHS[input.membership_plan])),
    created_at: TODAY,
  };
  const account: UserAccount = {
    user_id: nextId('user'),
    full_name,
    email,
    password: input.password, // mock only - the real backend stores a hash
    role: 'member',
    member_id,
    is_active: true,
  };
  db.members.push(member);
  db.users.push(account);
  saveDb();
  return toCurrent(account);
}
