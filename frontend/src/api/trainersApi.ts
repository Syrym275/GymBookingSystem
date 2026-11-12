import type { Trainer } from '../types';
import { getDb, nextId, saveDb } from '../mock/db';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';

/** The signed-in trainer's own profile, including is_active (false = registration still pending approval). */
export async function getMyTrainerProfile(): Promise<Trainer> {
  await delay();
  const viewer = requireUser(['trainer']);
  const t = getDb().trainers.find((x) => x.trainer_id === viewer.trainer_id);
  if (!t) throw new ApiError('NOT_FOUND', 'Trainer profile not found.');
  return clone(t);
}

/** Booking pages only ever see active trainers; staff may ask for inactive ones too (filters, admin). */
export async function listTrainers(opts: { includeInactive?: boolean } = {}): Promise<Trainer[]> {
  const viewer = requireUser();
  const staff = viewer.role === 'admin' || viewer.role === 'receptionist';
  if (!opts.includeInactive || !staff) {
    let response: Response;
    try {
      response = await fetch('/api/trainers');
    } catch {
      throw new ApiError('VALIDATION', 'Could not load trainers. Check the backend connection and try again.');
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError('VALIDATION', 'The trainer service returned an invalid response.');
    }
    if (!response.ok || !Array.isArray(data)) {
      const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : 'Could not load trainers.';
      throw new ApiError('VALIDATION', detail);
    }
    return data.map((trainer) => ({ ...(trainer as Omit<Trainer, 'is_active'>), is_active: true }));
  }
  await delay();
  const all = getDb().trainers;
  const rows = opts.includeInactive && staff ? all : all.filter((t) => t.is_active);
  return clone(rows);
}

export interface TrainerInput {
  full_name: string;
  specialization: string;
  session_price_kzt: number;
}

function validate(input: TrainerInput) {
  if (!input.full_name.trim()) throw new ApiError('VALIDATION', 'Name is required.');
  if (!input.specialization.trim()) throw new ApiError('VALIDATION', 'Specialization is required.');
  if (!(input.session_price_kzt > 0)) throw new ApiError('VALIDATION', 'Price must be greater than 0.');
}

export async function createTrainer(input: TrainerInput): Promise<Trainer> {
  await delay();
  requireUser(['admin']);
  validate(input);
  const t: Trainer = { trainer_id: nextId('trainer'), ...input, is_active: true };
  getDb().trainers.push(t);
  saveDb();
  return clone(t);
}

/** Price changes only affect future bookings: old bookings keep their own price_kzt. */
export async function updateTrainer(id: number, input: TrainerInput): Promise<Trainer> {
  await delay();
  requireUser(['admin']);
  validate(input);
  const t = getDb().trainers.find((x) => x.trainer_id === id);
  if (!t) throw new ApiError('NOT_FOUND', 'Trainer not found.');
  Object.assign(t, input);
  saveDb();
  return clone(t);
}

/** Trainers are never deleted, only deactivated. */
export async function setTrainerActive(id: number, active: boolean): Promise<Trainer> {
  await delay();
  requireUser(['admin']);
  const t = getDb().trainers.find((x) => x.trainer_id === id);
  if (!t) throw new ApiError('NOT_FOUND', 'Trainer not found.');
  t.is_active = active;
  saveDb();
  return clone(t);
}
