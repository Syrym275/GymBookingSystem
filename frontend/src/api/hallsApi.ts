import type { Hall } from '../types';
import { ApiError } from './ApiError';
import { api } from './http';
import { requireUser } from './session';

// The public endpoint returns active halls only; the admin may ask for inactive ones too.
export async function listHalls(opts: { includeInactive?: boolean } = {}): Promise<Hall[]> {
  const viewer = requireUser();
  if (opts.includeInactive && viewer.role === 'admin') {
    return api<Hall[]>('/admin/halls', 'Could not load halls.');
  }
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
  requireUser(['admin']);
  validate(input);
  return api<Hall>('/admin/halls', 'Could not save the hall.', { method: 'POST', body: input });
}

export async function updateHall(id: number, input: HallInput): Promise<Hall> {
  requireUser(['admin']);
  validate(input);
  return api<Hall>(`/admin/halls/${id}`, 'Could not save the hall.', { method: 'PATCH', body: input });
}

export async function setHallActive(id: number, active: boolean): Promise<Hall> {
  requireUser(['admin']);
  return api<Hall>(`/admin/halls/${id}`, 'Could not save the hall.', { method: 'PATCH', body: { is_active: active } });
}
