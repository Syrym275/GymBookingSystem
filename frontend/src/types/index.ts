// Types mirror the PostgreSQL tables exactly (names + values).

export type Role = 'member' | 'trainer' | 'receptionist' | 'admin';
export type MembershipPlan = 'monthly' | 'quarterly' | 'annual';
export type BookingType = 'training' | 'hall_rental';
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'expired';
export type PaymentMethod = 'card' | 'nfc' | 'app' | 'cash';
export type PaymentStatus = 'approved' | 'declined' | 'refunded';

export interface Member {
  member_id: number;
  full_name: string;
  email: string;
  phone: string; // +7XXXXXXXXXX
  qr_code_token: string;
  membership_plan: MembershipPlan;
  membership_expires_on: string; // YYYY-MM-DD
  created_at: string;
}

export interface Trainer {
  trainer_id: number;
  full_name: string;
  specialization: string;
  session_price_kzt: number;
  is_active: boolean;
}

export interface Hall {
  hall_id: number;
  hall_name: string;
  capacity: number; // 1..200
  hourly_rate_kzt: number;
  is_active: boolean;
}

export interface Booking {
  booking_id: number;
  member_id: number;
  booking_type: BookingType;
  trainer_id: number | null;
  hall_id: number | null;
  start_time: string; // local "YYYY-MM-DDTHH:mm"
  end_time: string;
  status: BookingStatus;
  price_kzt: number;
  created_at: string;
  payment_expires_at?: string | null;
  payment_status?: PaymentStatus | null;
  payment_method?: PaymentMethod | null;
  paid_at?: string | null;
}

export interface Payment {
  payment_id: number;
  booking_id: number;
  amount_kzt: number;
  method: PaymentMethod;
  payment_status: PaymentStatus;
  provider_txn_ref: string;
  created_at: string;
}

// ---- Auth ----------------------------------------------------------------

/** Login account (mock). The real backend owns this table. */
export interface UserAccount {
  user_id: number;
  full_name: string;
  email: string;
  password: string; // mock only!
  role: Role;
  member_id?: number;
  trainer_id?: number;
  is_active: boolean;
}

export interface CurrentUser {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  member_id?: number;
  trainer_id?: number;
  trainer_specialization?: string | null;
  trainer_session_price_kzt?: number | null;
  trainer_is_active?: boolean | null;
  /** False until the emailed link is opened. Missing for demo accounts, which count as verified. */
  email_verified?: boolean;
  /** Set by sign-up only: false when the account was saved but the email could not be sent. */
  verification_email_sent?: boolean | null;
}

// ---- Role-filtered views (what the API is allowed to return) -------------

/** Member fields as seen by the viewer. Trainer: only full_name. Reception: no email / QR. */
export interface MemberRef {
  member_id?: number;
  full_name: string;
  phone?: string;
  email?: string;
  qr_code_token?: string;
  membership_plan?: MembershipPlan;
  membership_expires_on?: string;
}

export interface MemberView {
  member_id: number;
  full_name: string;
  phone: string;
  membership_plan: MembershipPlan;
  membership_expires_on: string;
  email?: string; // admin / the member themself only
  qr_code_token?: string; // admin / the member themself only
  created_at?: string;
}

export interface BookingView extends Omit<Booking, 'member_id'> {
  member_id?: number; // hidden from trainers
  member: MemberRef;
  trainer_name: string | null;
  hall_name: string | null;
  paid: boolean; // derived from status
  payment?: Payment | null; // admin only
}

export interface PaymentView extends Payment {
  booking_no: string;
  member_name: string;
}

export interface StaffAccount {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  trainer_id?: number;
  is_active: boolean;
}
