import { getDb } from '../mock/db';
import { clone, delay } from './helpers';

// Public, no sign-in needed (landing page). Only active trainers / halls and only
// marketing-safe fields. Real backend: e.g. GET /public/catalog.

export interface PublicTrainer {
  trainer_id: number;
  full_name: string;
  specialization: string;
  session_price_kzt: number;
}

export interface PublicHall {
  hall_id: number;
  hall_name: string;
  capacity: number;
  hourly_rate_kzt: number;
}

export interface PublicCatalog {
  trainers: PublicTrainer[];
  halls: PublicHall[];
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  await delay();
  const db = getDb();
  return clone({
    trainers: db.trainers
      .filter((t) => t.is_active)
      .map(({ trainer_id, full_name, specialization, session_price_kzt }) => ({ trainer_id, full_name, specialization, session_price_kzt })),
    halls: db.halls
      .filter((h) => h.is_active)
      .map(({ hall_id, hall_name, capacity, hourly_rate_kzt }) => ({ hall_id, hall_name, capacity, hourly_rate_kzt })),
  });
}
