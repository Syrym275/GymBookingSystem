/*
 * ============================================================================
 *  AUTH CONTRACT  -  READ THIS BEFORE PLUGGING IN REAL LOGIN
 * ============================================================================
 *  The rest of the app only depends on this shape:
 *
 *      const { user, login, logout } = useAuth();
 *      user : CurrentUser | null
 *             { user_id, full_name, email, role, member_id?, trainer_id? }
 *      login(email, password) : Promise<CurrentUser>   (throws ApiError('AUTH', msg) on failure)
 *      register(input) : Promise<CurrentUser>  (member self sign-up; signs the new member in, unverified)
 *      markEmailVerified(email) : void  (after the emailed link is opened)
 *      logout() : void
 *
 *  Authentication is provided by the backend with an HttpOnly session cookie.
 *  The browser never stores credentials or treats a client-supplied user as authenticated.
 * ============================================================================
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/ApiError';
import { setSessionUser } from '../api/session';
import { t } from '../i18n';
import type { CurrentUser } from '../types';
import type { RegisterInput } from './mockUsers';

interface AuthValue {
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (input: RegisterInput) => Promise<CurrentUser>;
  /** Updates the signed-in user after their email link was opened (in this or another tab). */
  markEmailVerified: (email: string) => void;
  logout: () => void;
}

// The admin signs in like everyone else: one real account (backend/scripts/create_admin.py).
const SESSION_CHECK_MS = 3000; // how long the start-up sign-in check may take

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Never wait for the backend forever: if it is down or stuck (for example on an unreachable database),
    // give up after a few seconds and show the site as signed out instead of a blank page.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_CHECK_MS);
    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error('Could not restore the sign-in session.');
        return (await response.json()) as CurrentUser;
      })
      .then((signedIn) => {
        setSessionUser(signedIn);
        setUser(signedIn);
      })
      .catch(() => setUser(null))
      .finally(() => {
        clearTimeout(timer);
        setReady(true);
      });
    return () => clearTimeout(timer);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    let response: Response;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new ApiError('AUTH', 'Could not reach the sign-in service. Check that the backend is running.');
    }

    const responseText = await response.text();
    let data: { detail?: unknown } & Partial<CurrentUser>;
    try {
      data = JSON.parse(responseText) as { detail?: unknown } & Partial<CurrentUser>;
    } catch {
      if (!response.ok) {
        throw new ApiError(
          'AUTH',
          `Sign-in failed (HTTP ${response.status}); the backend returned a non-JSON error. Check the backend terminal for the cause.`,
        );
      }
      throw new ApiError('AUTH', `The sign-in service returned an invalid response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      throw new ApiError(
        'AUTH',
        typeof data.detail === 'string'
          ? data.detail
          : response.status >= 500
            ? 'Sign-in is temporarily unavailable. Check that the backend database is configured and running.'
            : 'Wrong email or password.',
      );
    }

    const signedIn = data as CurrentUser;
    setSessionUser(signedIn);
    setUser(signedIn);
    return signedIn;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
  let response: Response;
  try {
    response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError('VALIDATION', 'Could not reach the registration service. Check that the backend is running.');
  }

  // A proxy or server crash can send an empty or non-JSON body.
  const data = (await response.json().catch(() => ({}))) as { detail?: unknown } & Partial<CurrentUser>;

  if (!response.ok) {
    throw new ApiError(
      'VALIDATION',
      typeof data.detail === 'string'
        ? data.detail
        : response.status >= 500
          ? 'Registration is temporarily unavailable. Check that the backend is running.'
          : 'Registration failed.',
    );
  }

  const created = data as CurrentUser;

  setSessionUser(created);
  setUser(created);

  return created;
}, []);

  const markEmailVerified = useCallback((email: string) => {
    setUser((current) => {
      if (!current || current.email !== email.trim().toLowerCase() || current.email_verified !== false) return current;
      const updated = { ...current, email_verified: true };
      setSessionUser(updated);
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    try {
      sessionStorage.removeItem('gbs_demo_admin'); // left over from the old demo preview
    } catch {
      /* ignore */
    }
    setSessionUser(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, register, markEmailVerified, logout }),
    [user, login, register, markEmailVerified, logout],
  );
  if (!ready) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-cream text-sm text-ink/60">
        {t('common.loading')}
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
