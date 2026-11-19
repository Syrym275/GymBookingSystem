// Public catalogue and account registration use FastAPI. Some dashboard reports remain mock-backed.
import { submitDemoTrainerApplication } from './demoSignup';

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

export interface TrainerRegistrationInput {
  full_name: string;
  email: string;
  password: string;
  specialization: string;
  session_price_kzt: number;
}

/** Saves a trainer for approval and emails a verification link. Does not sign them in. */
export async function registerTrainer(input: TrainerRegistrationInput): Promise<{ verificationEmailSent: boolean }> {
  const fallback = 'Could not send your registration. Please try again shortly.';
  // Demo mode (npm run dev only): if the backend is down, stuck or broken, file the application in the demo data.
  const demo = async () => {
    await submitDemoTrainerApplication(input);
    return { verificationEmailSent: true };
  };
  let response: Response;
  try {
    response = await fetch('/api/auth/register/trainer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(6000), // never wait forever for a stuck backend
    });
  } catch {
    if (import.meta.env.DEV) return demo();
    throw new Error(fallback);
  }
  if (!response.ok && response.status >= 500 && import.meta.env.DEV) return demo();
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.detail === 'string' ? data.detail : fallback);
  }
  const data = await response.json().catch(() => null);
  return { verificationEmailSent: data?.verification_email_sent !== false };
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/public/catalog`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('The catalogue could not be loaded. Please try again shortly.');
  }
  if (!response.ok) {
    throw new Error('The catalogue is temporarily unavailable. Please try again shortly.');
  }
  const data: PublicCatalog = await response.json();
  if (!Array.isArray(data.trainers) || !Array.isArray(data.halls)) {
    throw new Error('The catalogue response is incomplete. Please try again shortly.');
  }
  return data;
}

