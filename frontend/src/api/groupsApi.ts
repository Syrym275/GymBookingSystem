import type { BookingStatus, BookingType } from '../types';
import { api } from './http';

// Group sessions: the member who booked invites other members by email. The owner pays;
// guests join for free. Matches backend/app/groups.py.

export type GroupStatus = 'invited' | 'accepted' | 'declined' | 'left' | 'removed';

export interface GroupParticipant {
  member_id: number;
  full_name: string;
  /** Only the owner (and staff) see emails. */
  email: string | null;
  status: GroupStatus;
  invited_at: string;
  responded_at: string | null;
}

export interface GroupDetails {
  booking_id: number;
  owner_member_id: number;
  owner_name: string;
  max_size: number;
  /** Owner + accepted guests. */
  size: number;
  participants: GroupParticipant[];
}

export interface GroupInvitation {
  booking_id: number;
  status: GroupStatus;
  invited_at: string;
  owner_name: string;
  booking_type: BookingType;
  booking_status: BookingStatus;
  trainer_name: string | null;
  hall_name: string | null;
  start_time: string;
  end_time: string;
  size: number;
}

export const getGroup = (bookingId: number) =>
  api<GroupDetails>(`/bookings/${bookingId}/group`, 'Could not load the group.');

export const inviteToGroup = (bookingId: number, email: string) =>
  api<GroupDetails>(`/bookings/${bookingId}/group`, 'Could not send the invitation.', {
    method: 'POST',
    body: { email },
  });

/** The owner removes a guest, or a guest passes their own member_id to leave. */
export const removeFromGroup = (bookingId: number, memberId: number) =>
  api<GroupDetails>(`/bookings/${bookingId}/group/${memberId}`, 'Could not update the group.', { method: 'DELETE' });

export const listMyInvitations = () => api<GroupInvitation[]>('/groups/invitations', 'Could not load your group sessions.');

export const acceptInvitation = (bookingId: number) =>
  api<GroupDetails>(`/groups/invitations/${bookingId}/accept`, 'Could not accept the invitation.', { method: 'POST' });

export const declineInvitation = (bookingId: number) =>
  api<void>(`/groups/invitations/${bookingId}/decline`, 'Could not decline the invitation.', { method: 'POST' });
