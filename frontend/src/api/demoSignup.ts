import { TODAY } from '../config';
import { getDb, nextId, saveDb } from '../mock/db';
import { delay } from './helpers';

/**
 * DEMO MODE ONLY. When the backend cannot be reached while running `npm run dev`, the trainer sign-up form files
 * its application in the in-browser demo data instead of failing, so the approval flow in Admin > Trainers can be
 * tried without a backend or a database. Nothing is sent anywhere, no email is sent, and a production build never
 * calls this (see registerTrainer in publicApi.ts).
 */
export async function submitDemoTrainerApplication(input: {
  full_name: string;
  email: string;
  specialization: string;
  session_price_kzt: number;
}): Promise<void> {
  await delay();
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === email) || db.applications.some((a) => a.email.toLowerCase() === email)) {
    throw new Error('An account with this email already exists.');
  }
  db.applications.push({
    application_id: nextId('application'),
    full_name: input.full_name.trim(),
    email,
    specialization: input.specialization.trim(),
    session_price_kzt: input.session_price_kzt,
    created_at: TODAY,
  });
  saveDb();
}
