import type { Booking, BookingView, CurrentUser, Member, MemberRef, MemberView } from '../types';
import { getDb } from '../mock/db';
import { isPaidStatus } from '../utils/format';

/**
 * Access rules live HERE (not in the UI):
 *  - trainer      -> member full_name only (no id, phone, email, QR)
 *  - receptionist -> name, phone, plan + expiry (no email, no QR, no payments)
 *  - member       -> own data
 *  - admin        -> everything
 */
export function memberRefFor(m: Member, viewer: CurrentUser): MemberRef {
  switch (viewer.role) {
    case 'trainer':
      return { full_name: m.full_name };
    case 'receptionist':
      return {
        member_id: m.member_id,
        full_name: m.full_name,
        phone: m.phone,
        membership_plan: m.membership_plan,
        membership_expires_on: m.membership_expires_on,
      };
    case 'admin':
      return { ...m };
    default:
      return { member_id: m.member_id, full_name: m.full_name };
  }
}

export function memberViewFor(m: Member, viewer: CurrentUser): MemberView {
  const base: MemberView = {
    member_id: m.member_id,
    full_name: m.full_name,
    phone: m.phone,
    membership_plan: m.membership_plan,
    membership_expires_on: m.membership_expires_on,
  };
  if (viewer.role === 'admin' || (viewer.role === 'member' && viewer.member_id === m.member_id)) {
    return { ...base, email: m.email, qr_code_token: m.qr_code_token, created_at: m.created_at };
  }
  return base;
}

export function toView(b: Booking, viewer: CurrentUser): BookingView {
  const db = getDb();
  const m = db.members.find((x) => x.member_id === b.member_id)!;
  const trainer = b.trainer_id ? db.trainers.find((t) => t.trainer_id === b.trainer_id) : undefined;
  const hall = b.hall_id ? db.halls.find((h) => h.hall_id === b.hall_id) : undefined;
  const view: BookingView = {
    ...b,
    member_id: viewer.role === 'trainer' ? undefined : b.member_id,
    member: memberRefFor(m, viewer),
    trainer_name: trainer ? trainer.full_name : null,
    hall_name: hall ? hall.hall_name : null,
    paid: isPaidStatus(b.status),
  };
  if (viewer.role === 'admin') {
    const attempts = db.payments.filter((p) => p.booking_id === b.booking_id);
    view.payment = attempts.find((p) => p.payment_status === 'approved') ?? attempts[attempts.length - 1] ?? null;
  }
  return view;
}
