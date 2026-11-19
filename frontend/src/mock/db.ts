import type { Booking, Hall, Member, Payment, Trainer, TrainerApplication, UserAccount } from '../types';
import { buildSeed } from './seed';

// In-memory "database", persisted to localStorage so changes survive a refresh.
// The real backend replaces this whole folder.

export interface DB {
  members: Member[];
  trainers: Trainer[];
  halls: Hall[];
  bookings: Booking[];
  payments: Payment[];
  users: UserAccount[];
  applications: TrainerApplication[];
  seq: { booking: number; payment: number; member: number; trainer: number; hall: number; user: number; application: number };
}

const KEY = 'gbs_mock_db_v4'; // bumped: the seed now includes trainer applications

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* storage unavailable - fall back to seed */
  }
  return buildSeed();
}

let db: DB = load();

export const getDb = () => db;

export function saveDb() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

export function nextId(kind: keyof DB['seq']): number {
  db.seq[kind] += 1;
  return db.seq[kind];
}
