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
  const viewer = requireUser(['member']);

  if (!viewer.member_id) {
    throw new ApiError('NOT_FOUND', 'Member not found.');
  }

  const response = await fetch(`/api/members/${viewer.member_id}`);
  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? 'NOT_FOUND' : 'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : 'Could not load member profile.',
    );
  }

  return data as MemberView;
}

/** Reception: name / phone / plan only. Admin: everything. Members and trainers: no access. */
export async function listMembers(q = ''): Promise<MemberView[]> {
  requireUser(['receptionist', 'admin']);
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  let response: Response;
  try {
    const query = params.toString();
    response = await fetch(`/api/members${query ? `?${query}` : ''}`);
  } catch {
    throw new ApiError('VALIDATION', 'Could not load members. Check the backend connection and try again.');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('VALIDATION', 'The member service returned an invalid response.');
  }
  if (!response.ok || !Array.isArray(data)) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load members.';
    throw new ApiError('VALIDATION', detail);
  }
  return data as MemberView[];
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
