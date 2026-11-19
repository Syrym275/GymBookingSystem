import type { Trainer } from '../types';
import { ApiError } from './ApiError';
import { api } from './http';
import { requireUser } from './session';
import type { Availability, AvailabilityState } from '../pages/trainer/availability';

/** The signed-in trainer's own profile, including is_active (false = registration still pending approval). */
export async function getMyTrainerProfile(): Promise<Trainer> {
  const viewer = requireUser(['trainer']);
  if (!viewer.trainer_id) {
    throw new ApiError('NOT_FOUND', 'Your account is not linked to a trainer profile.');
  }

  let response: Response;
  try {
    response = await fetch(`/api/trainers/${viewer.trainer_id}`);
  } catch {
    throw new ApiError('VALIDATION', 'Could not load your trainer profile. Check the backend connection and try again.');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('VALIDATION', 'The trainer profile service returned an invalid response.');
  }
  if (!response.ok) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load your trainer profile.';
    throw new ApiError(response.status === 404 ? 'NOT_FOUND' : 'VALIDATION', detail);
  }
  if (typeof data !== 'object' || data === null || !('trainer_id' in data) || data.trainer_id !== viewer.trainer_id
    || !('full_name' in data) || typeof data.full_name !== 'string'
    || !('specialization' in data) || typeof data.specialization !== 'string'
    || !('session_price_kzt' in data) || typeof data.session_price_kzt !== 'number'
    || !('is_active' in data) || typeof data.is_active !== 'boolean') {
    throw new ApiError('VALIDATION', 'The trainer profile service returned an invalid response.');
  }
  return data as Trainer;
}

export async function getMyAvailability(): Promise<AvailabilityState> {
  requireUser(['trainer']);
  let response: Response;
  try {
    response = await fetch('/api/trainers/me/availability');
  } catch {
    throw new ApiError('VALIDATION', 'Could not load your availability. Check the backend connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data !== 'object' || data === null) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load your availability.';
    throw new ApiError(response.status === 403 ? 'FORBIDDEN' : 'VALIDATION', detail);
  }
  const body = data as Record<string, unknown>;
  return {
    state: body.state as Availability,
    note: typeof body.note === 'string' ? body.note : '',
    breakUntil: typeof body.break_until === 'string' ? body.break_until : null,
    updatedAt: typeof body.updated_at === 'string' ? body.updated_at : null,
  };
}

export async function updateMyAvailability(
  input: Pick<AvailabilityState, 'state' | 'note' | 'breakUntil'>,
): Promise<AvailabilityState> {
  requireUser(['trainer']);
  let response: Response;
  try {
    response = await fetch('/api/trainers/me/availability', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: input.state,
        note: input.note,
        break_until: input.breakUntil,
      }),
    });
  } catch {
    throw new ApiError('VALIDATION', 'Could not save your availability. Check the backend connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data !== 'object' || data === null) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not save your availability.';
    throw new ApiError(response.status === 403 ? 'FORBIDDEN' : 'VALIDATION', detail);
  }
  const body = data as Record<string, unknown>;
  return {
    state: body.state as Availability,
    note: typeof body.note === 'string' ? body.note : '',
    breakUntil: typeof body.break_until === 'string' ? body.break_until : null,
    updatedAt: typeof body.updated_at === 'string' ? body.updated_at : null,
  };
}

export async function getTrainerAvailability(
  trainerId: number,
): Promise<{ state: Availability; breakUntil: string | null }> {
  requireUser();
  let response: Response;
  try {
    response = await fetch(`/api/trainers/${trainerId}/availability`);
  } catch {
    throw new ApiError('VALIDATION', 'Could not load trainer availability. Check the backend connection and try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data !== 'object' || data === null) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load trainer availability.';
    throw new ApiError(response.status === 403 ? 'FORBIDDEN' : 'VALIDATION', detail);
  }
  const state = (data as Record<string, unknown>).state;
  if (state !== 'available' && state !== 'break' && state !== 'off') {
    throw new ApiError('VALIDATION', 'The trainer availability service returned an invalid status.');
  }
  const body = data as Record<string, unknown>;
  return {
    state,
    breakUntil: typeof body.break_until === 'string' ? body.break_until : null,
  };
}

/** Booking pages only ever see active trainers; the admin may ask for inactive ones too. */
export async function listTrainers(opts: { includeInactive?: boolean } = {}): Promise<Trainer[]> {
  const viewer = requireUser();
  if (opts.includeInactive && viewer.role === 'admin') {
    return api<Trainer[]>('/admin/trainers', 'Could not load trainers.');
  }
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
  requireUser(['admin']);
  validate(input);
  return api<Trainer>('/admin/trainers', 'Could not save the trainer.', { method: 'POST', body: input });
}

/** Price changes only affect future bookings: old bookings keep their own price_kzt. */
export async function updateTrainer(id: number, input: TrainerInput): Promise<Trainer> {
  requireUser(['admin']);
  validate(input);
  return api<Trainer>(`/admin/trainers/${id}`, 'Could not save the trainer.', { method: 'PATCH', body: input });
}

/** Trainers with bookings are never deleted, only deactivated. Activating also approves. */
export async function setTrainerActive(id: number, active: boolean): Promise<Trainer> {
  requireUser(['admin']);
  return api<Trainer>(`/admin/trainers/${id}`, 'Could not save the trainer.', { method: 'PATCH', body: { is_active: active } });
}
