// Email verification endpoints (backend/app/verification.py).

export interface VerifyEmailResult {
  email: string;
  /** True when the link was clicked again after the email was already verified. */
  already_verified: boolean;
}

async function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server. Check that the backend is running.');
  }
  // A proxy or server crash can send an empty or non-JSON body.
  const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : fallback);
  return data as T;
}

export function verifyEmailToken(token: string): Promise<VerifyEmailResult> {
  return post('verify-email', { token }, 'This verification link is invalid or has expired. Request a new one below.');
}

/** Always answers the same way, whether or not the email has an account. */
export async function resendVerification(email: string): Promise<string> {
  const data = await post<{ detail: string }>('resend-verification', { email }, 'Could not send a new link. Try again shortly.');
  return data.detail;
}
