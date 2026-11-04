import type { MemberView, MembershipPlan } from '../types';
import { TODAY_DATE } from '../config';
import { getDb, saveDb } from '../mock/db';
import { toDate } from '../utils/format';
import { addMonths } from 'date-fns';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';
import { memberViewFor } from './views';

/** The signed-in member's own record (includes email + QR token). */
export async function getMyProfile(): Promise<MemberView> {
  await delay();
  const viewer = requireUser(['member']);
  const m = getDb().members.find((x) => x.member_id === viewer.member_id);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found.');
  return clone(memberViewFor(m, viewer));
}

/** Reception: name / phone / plan only. Admin: everything. Members and trainers: no access. */
export async function listMembers(q = ''): Promise<MemberView[]> {
  await delay();
  const viewer = requireUser(['receptionist', 'admin']);
  const needle = q.trim().toLowerCase();
  const rows = getDb()
    .members.filter(
      (m) => !needle || m.full_name.toLowerCase().includes(needle) || m.phone.replace(/\s/g, '').includes(needle.replace(/\s/g, '')),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((m) => memberViewFor(m, viewer));
  return clone(rows);
}

export async function getMember(id: number): Promise<MemberView> {
  await delay();
  const viewer = requireUser(['receptionist', 'admin']);
  const m = getDb().members.find((x) => x.member_id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found.');
  return clone(memberViewFor(m, viewer));
}

export async function updateMemberPlan(id: number, plan: MembershipPlan): Promise<MemberView> {
  await delay();
  const viewer = requireUser(['admin']);
  const m = getDb().members.find((x) => x.member_id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found.');
  m.membership_plan = plan;
  saveDb();
  return clone(memberViewFor(m, viewer));
}

/** Extend from the later of (current expiry, today) by N months. */
export async function extendMembership(id: number, months: number): Promise<MemberView> {
  await delay();
  const viewer = requireUser(['admin']);
  const m = getDb().members.find((x) => x.member_id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Member not found.');
  const from = m.membership_expires_on > TODAY_DATE ? m.membership_expires_on : TODAY_DATE;
  m.membership_expires_on = toDate(addMonths(new Date(`${from}T00:00`), months));
  saveDb();
  return clone(memberViewFor(m, viewer));
}
