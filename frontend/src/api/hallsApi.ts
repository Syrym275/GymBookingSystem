import type { Hall } from '../types';
import { getDb, nextId, saveDb } from '../mock/db';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';

// The public endpoint returns active halls only. Keep the options argument for
// existing callers; inactive-hall management needs a separate staff endpoint.
export async function listHalls(_opts: { includeInactive?: boolean } = {}): Promise<Hall[]> {
  requireUser();
  let response: Response;
  try {
    response = await fetch('/api/halls');
  } catch {
    throw new ApiError('VALIDATION', 'Could not load halls. Check the backend connection and try again.');
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('VALIDATION', 'The hall service returned an invalid response.');
  }

  if (!response.ok || !Array.isArray(data)) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string'
      ? data.detail
      : 'Could not load halls.';
    throw new ApiError('VALIDATION', detail);
  }

  return data.map((hall) => ({ ...(hall as Omit<Hall, 'is_active'>), is_active: true }));
}

export interface HallInput {
  hall_name: string;
  capacity: number;
  hourly_rate_kzt: number;
}

function validate(input: HallInput) {
  if (!input.hall_name.trim()) throw new ApiError('VALIDATION', 'Hall name is required.');
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 200) {
    throw new ApiError('VALIDATION', 'Capacity must be between 1 and 200.');
  }
  if (!(input.hourly_rate_kzt > 0)) throw new ApiError('VALIDATION', 'Hourly rate must be greater than 0.');
}

export async function createHall(input: HallInput): Promise<Hall> {
  await delay();
  requireUser(['admin']);
  validate(input);
  const h: Hall = { hall_id: nextId('hall'), ...input, is_active: true };
  getDb().halls.push(h);
  saveDb();
  return clone(h);
}

export async function updateHall(id: number, input: HallInput): Promise<Hall> {
  await delay();
  requireUser(['admin']);
  validate(input);
  const h = getDb().halls.find((x) => x.hall_id === id);
  if (!h) throw new ApiError('NOT_FOUND', 'Hall not found.');
  Object.assign(h, input);
  saveDb();
  return clone(h);
}

export async function setHallActive(id: number, active: boolean): Promise<Hall> {
  await delay();
  requireUser(['admin']);
  const h = getDb().halls.find((x) => x.hall_id === id);
  if (!h) throw new ApiError('NOT_FOUND', 'Hall not found.');
  h.is_active = active;
  saveDb();
  return clone(h);
}
