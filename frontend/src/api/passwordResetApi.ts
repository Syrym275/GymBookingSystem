// Password reset endpoints (backend/app/password_reset.py) and the signed-in password change (backend/app/auth.py).

import { api } from './http';

async function post(path: string, body: unknown, fallback: string): Promise<string> {
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
  return typeof data.detail === 'string' ? data.detail : '';
}

/** Always answers the same way, whether or not the email has an account. */
export function requestPasswordReset(email: string): Promise<string> {
  return post('forgot-password', { email }, 'Could not send the reset link. Try again shortly.');
}

export function resetPassword(token: string, password: string): Promise<string> {
  return post('reset-password', { token, password }, 'Could not change the password. Request a new link.');
}

/** Signed-in users only. Signs out the account's other devices; this one stays signed in. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  const data = await api<{ detail: string }>('/auth/change-password', 'Could not change the password.', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
  return data.detail;
}
