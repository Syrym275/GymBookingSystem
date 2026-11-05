// The public landing page uses FastAPI. Other app functions still use mock APIs.

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
