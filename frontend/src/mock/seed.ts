import type {
  Booking,
  BookingStatus,
  BookingType,
  Hall,
  Member,
  MembershipPlan,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Trainer,
  UserAccount,
} from '../types';
import type { DB } from './db';
import { DEMO_PASSWORD } from '../config';
import { addDaysStr, dateOf, minutesBetween, pad } from '../utils/format';

export function qrToken(id: number) {
  let h = (id * 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < 3; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + 374761393) >>> 0;
    out += h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
  }
  return `GBS-${out}`;
}

function member(
  id: number,
  full_name: string,
  email: string,
  plan: MembershipPlan,
  expires: string,
  created: string,
): Member {
  return {
    member_id: id,
    full_name,
    email,
    phone: `+7701${pad(1234500 + id * 37, 7)}`,
    qr_code_token: qrToken(id),
    membership_plan: plan,
    membership_expires_on: expires,
    created_at: created,
  };
}

export function buildSeed(): DB {
  const trainers: Trainer[] = [
    { trainer_id: 1, full_name: 'Aigerim Sadykova', specialization: 'Strength training', session_price_kzt: 8000, is_active: true },
    { trainer_id: 2, full_name: 'Arman Seitkali', specialization: 'Functional training', session_price_kzt: 6500, is_active: true },
    { trainer_id: 3, full_name: 'Daniyar Ospanov', specialization: 'Boxing', session_price_kzt: 7000, is_active: true },
    { trainer_id: 4, full_name: 'Zhanna Iskakova', specialization: 'Yoga / Pilates', session_price_kzt: 6000, is_active: true },
    { trainer_id: 5, full_name: 'Marat Zhaksylykov', specialization: 'CrossFit', session_price_kzt: 7500, is_active: false },
  ];

  const halls: Hall[] = [
    { hall_id: 1, hall_name: 'Main Hall', capacity: 40, hourly_rate_kzt: 12000, is_active: true },
    { hall_id: 2, hall_name: 'Yoga Studio', capacity: 20, hourly_rate_kzt: 8000, is_active: true },
    { hall_id: 3, hall_name: 'Boxing Studio', capacity: 15, hourly_rate_kzt: 9000, is_active: true },
    { hall_id: 4, hall_name: 'Old Cardio Room', capacity: 25, hourly_rate_kzt: 6000, is_active: false },
  ];

  const members: Member[] = [
    member(1, 'Aruzhan Bekova', 'aruzhan.bekova@example.kz', 'annual', '2027-03-15', '2025-03-15T10:00'),
    member(2, 'Dias Nurlanov', 'dias.nurlanov@example.kz', 'monthly', '2026-11-28', '2026-05-28T12:30'),
    member(3, 'Aliya Tulegenova', 'aliya.tulegenova@example.kz', 'quarterly', '2027-01-10', '2026-04-10T09:15'),
    member(4, 'Yerassyl Omarov', 'yerassyl.omarov@example.kz', 'monthly', '2026-11-20', '2026-06-20T17:40'),
    member(5, 'Kamila Zhumabayeva', 'kamila.zhumabayeva@example.kz', 'annual', '2027-06-30', '2025-06-30T11:05'),
    member(6, 'Timur Abenov', 'timur.abenov@example.kz', 'monthly', '2026-10-31', '2026-09-30T18:20'),
    member(7, 'Saule Kassymova', 'saule.kassymova@example.kz', 'quarterly', '2026-12-20', '2026-09-20T08:45'),
    member(8, 'Madina Rakhimova', 'madina.rakhimova@example.kz', 'monthly', '2026-11-06', '2026-10-06T16:10'),
    member(9, 'Nurzhan Kenesov', 'nurzhan.kenesov@example.kz', 'annual', '2027-02-01', '2026-02-01T13:00'),
    member(10, 'Dana Mukhamedova', 'dana.mukhamedova@example.kz', 'quarterly', '2026-12-05', '2026-09-05T19:25'),
    member(11, 'Beibit Sarsenov', 'beibit.sarsenov@example.kz', 'monthly', '2026-11-30', '2026-10-30T10:50'),
  ];

  // ---- bookings ----------------------------------------------------------
  const bookings: Booking[] = [];
  const createdFor = (start: string) => {
    const d = addDaysStr(dateOf(start), -3);
    return `${d > '2026-11-01' ? '2026-11-01' : d}T10:00`;
  };
  const push = (
    member_id: number,
    booking_type: BookingType,
    trainer_id: number | null,
    hall_id: number | null,
    start_time: string,
    end_time: string,
    status: BookingStatus,
    price_kzt: number,
  ) => {
    bookings.push({
      booking_id: bookings.length + 1,
      member_id,
      booking_type,
      trainer_id,
      hall_id,
      start_time,
      end_time,
      status,
      price_kzt,
      created_at: createdFor(start_time),
    });
  };

  // Past training sessions 12-25 Oct: [trainer, date, hour, member, status]
  const past: [number, string, number, number, BookingStatus][] = [
    // Aigerim: 8 sessions, all 18:00 / 19:00, 1 no-show
    [1, '2026-10-12', 18, 1, 'completed'],
    [1, '2026-10-13', 19, 2, 'completed'],
    [1, '2026-10-14', 18, 3, 'completed'],
    [1, '2026-10-15', 19, 1, 'completed'],
    [1, '2026-10-19', 18, 4, 'no_show'],
    [1, '2026-10-20', 19, 2, 'completed'],
    [1, '2026-10-22', 18, 5, 'completed'],
    [1, '2026-10-24', 18, 7, 'completed'],
    // Arman: 3 (2 evening, 1 before 17:00)
    [2, '2026-10-13', 18, 3, 'completed'],
    [2, '2026-10-16', 19, 5, 'completed'],
    [2, '2026-10-21', 10, 8, 'completed'],
    // Daniyar: 3 (1 evening, 2 before 17:00)
    [3, '2026-10-14', 18, 6, 'completed'],
    [3, '2026-10-17', 11, 9, 'completed'],
    [3, '2026-10-23', 9, 10, 'no_show'],
    // Zhanna: 3 (all before 17:00)
    [4, '2026-10-12', 8, 7, 'completed'],
    [4, '2026-10-15', 12, 8, 'completed'],
    [4, '2026-10-22', 15, 11, 'completed'],
  ];
  for (const [t, date, hour, m, status] of past) {
    const price = trainers.find((x) => x.trainer_id === t)!.session_price_kzt;
    push(m, 'training', t, null, `${date}T${pad(hour)}:00`, `${date}T${pad(hour + 1)}:00`, status, price);
  }
  // Past hall rentals
  push(2, 'hall_rental', null, 1, '2026-10-16T18:00', '2026-10-16T20:00', 'completed', 24000);
  push(3, 'hall_rental', null, 2, '2026-10-18T10:00', '2026-10-18T12:00', 'completed', 16000);
  push(4, 'hall_rental', null, 3, '2026-10-24T17:00', '2026-10-24T19:00', 'completed', 18000);

  // Week 2-8 Nov (booking ids 21-31)
  push(1, 'training', 1, null, '2026-11-02T18:00', '2026-11-02T19:00', 'confirmed', 8000); // 21
  push(2, 'training', 1, null, '2026-11-02T19:00', '2026-11-02T20:00', 'confirmed', 8000); // 22
  push(3, 'training', 4, null, '2026-11-03T08:00', '2026-11-03T09:00', 'confirmed', 6000); // 23
  push(5, 'hall_rental', null, 1, '2026-11-04T18:00', '2026-11-04T20:00', 'confirmed', 24000); // 24
  push(7, 'hall_rental', null, 1, '2026-11-04T20:00', '2026-11-04T22:00', 'confirmed', 24000); // 25
  push(4, 'training', 1, null, '2026-11-04T18:00', '2026-11-04T19:00', 'pending', 8000); // 26
  push(4, 'hall_rental', null, 2, '2026-11-06T17:00', '2026-11-06T19:00', 'pending', 16000); // 27
  push(3, 'hall_rental', null, 2, '2026-11-05T12:00', '2026-11-05T13:00', 'cancelled', 8000); // 28
  push(5, 'training', 2, null, '2026-11-05T19:00', '2026-11-05T20:00', 'confirmed', 6500); // 29
  push(1, 'training', 3, null, '2026-11-03T17:00', '2026-11-03T18:00', 'expired', 7000); // 30
  push(2, 'hall_rental', null, 3, '2026-11-07T10:00', '2026-11-07T12:00', 'confirmed', 18000); // 31

  // ---- payments ----------------------------------------------------------
  const payments: Payment[] = [];
  const methods: PaymentMethod[] = ['card', 'nfc', 'app', 'card', 'cash'];
  const addPayment = (b: Booking, status: PaymentStatus, method: PaymentMethod) => {
    const id = payments.length + 1;
    const date = dateOf(b.created_at);
    payments.push({
      payment_id: id,
      booking_id: b.booking_id,
      amount_kzt: b.price_kzt,
      method,
      payment_status: status,
      provider_txn_ref: `TXN-${date.replace(/-/g, '')}-${pad(id, 4)}`,
      created_at: `${date}T10:${pad(10 + (id % 40))}`,
    });
  };
  for (const b of bookings) {
    if (b.status === 'confirmed' || b.status === 'completed' || b.status === 'no_show') {
      if (b.booking_id === 24) addPayment(b, 'declined', 'card'); // payment 24 declined...
      addPayment(b, 'approved', b.booking_id === 24 ? 'app' : methods[b.booking_id % methods.length]); // ...then 25 approved
    }
  }

  // ---- login accounts ----------------------------------------------------
  const users: UserAccount[] = [
    { user_id: 1, full_name: 'Madi Akhmetov', email: 'manager@gym.kz', password: DEMO_PASSWORD, role: 'admin', is_active: true },
    { user_id: 2, full_name: 'Anel Rakhimova', email: 'reception@gym.kz', password: DEMO_PASSWORD, role: 'receptionist', is_active: true },
    ...trainers
      .filter((t) => t.is_active)
      .map<UserAccount>((t, i) => ({
        user_id: 3 + i,
        full_name: t.full_name,
        email: `${t.full_name.toLowerCase().replace(' ', '.')}@gym.kz`,
        password: DEMO_PASSWORD,
        role: 'trainer',
        trainer_id: t.trainer_id,
        is_active: true,
      })),
    ...members.map<UserAccount>((m) => ({
      user_id: 10 + m.member_id,
      full_name: m.full_name,
      email: m.email,
      password: DEMO_PASSWORD,
      role: 'member',
      member_id: m.member_id,
      is_active: true,
    })),
  ];

  // sanity: every booking has a sensible duration
  bookings.forEach((b) => {
    if (minutesBetween(b.start_time, b.end_time) <= 0) throw new Error('bad seed booking');
  });

  return {
    members,
    trainers,
    halls,
    bookings,
    payments,
    users,
    seq: {
      booking: bookings.length,
      payment: payments.length,
      member: members.length,
      trainer: trainers.length,
      hall: halls.length,
      user: Math.max(...users.map((u) => u.user_id)),
    },
  };
}
