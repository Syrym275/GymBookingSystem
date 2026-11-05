import type { Hall } from '../types';
import { getDb, nextId, saveDb } from '../mock/db';
import { ApiError } from './ApiError';
import { clone, delay } from './helpers';
import { requireUser } from './session';

export async function listHalls(opts: { includeInactive?: boolean } = {}): Promise<Hall[]> {
  await delay();
  const viewer = requireUser();
  const staff = viewer.role === 'admin' || viewer.role === 'receptionist';
  const all = getDb().halls;
  const rows = opts.includeInactive && staff ? all : all.filter((h) => h.is_active);
  return clone(rows);
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
