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
 *      register(input) : Promise<PendingRegistration>  (member self sign-up; account needs email confirmation)
 *      verifyEmail(email, code) : Promise<CurrentUser>  (confirms the emailed code; signs members in)
 *      resendCode(email) : Promise<void>
 *      logout() : void
 *
 *  To connect the real backend replace ONLY the marked parts below:
 *   1. login():     replace the `authenticate(...)` call (mock list in ./mockUsers.ts)
 *                   with e.g. POST /auth/login and map the response to CurrentUser.
 *   1b. register(): replace the `registerMember(...)` call with e.g. POST /auth/register.
 *   2. Storage:     the user is kept in localStorage under STORAGE_KEY. With real auth keep the
 *                   token in an httpOnly cookie (or memory) and load the user from GET /me on start.
 *   3. Session:     `setSessionUser(...)` tells the MOCK api who is calling. Delete it once the
 *                   real API identifies the caller from the token/cookie.
 *   4. src/mock/ and ./mockUsers.ts can then be deleted.
 *  Route protection (RequireRole.tsx) and every page keep working unchanged.
 * ============================================================================
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/ApiError';
import { setSessionUser } from '../api/session';
import type { CurrentUser } from '../types';
import { authenticate, ENABLED_ROLES, type RegisterInput } from './mockUsers';

const STORAGE_KEY = 'gbs_current_user';

export interface PendingRegistration {
  email: string;
  /** False when the backend saved the account but could not send the email. */
  emailSent: boolean;
}

interface AuthValue {
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<CurrentUser>;
  /** Saves the account; it can be used after verifyEmail(). */
  register: (input: RegisterInput) => Promise<PendingRegistration>;
  /** Checks the emailed code. Signs the user in when their role has an app area. */
  verifyEmail: (email: string, code: string) => Promise<CurrentUser>;
  resendCode: (email: string) => Promise<void>;
  logout: () => void;
}

/** POST JSON to the backend and return the parsed body, or throw ApiError with the backend's message. */
async function postJson<T>(path: string, body: unknown, fallback: string, code: ApiError['code'] = 'VALIDATION'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(code, 'Could not reach the server. Check that the backend is running.');
  }
  // A proxy or server crash can send an empty or non-JSON body.
  const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : response.status >= 500
          ? 'The service is temporarily unavailable. Check that the backend is running.'
          : fallback;
    throw new ApiError(code, detail);
  }
  return data as T;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStored(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const u = raw ? (JSON.parse(raw) as CurrentUser) : null;
    return u && ENABLED_ROLES.includes(u.role) ? u : null;
  } catch {
    return null;
  }
}

function writeStored(user: CurrentUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked - session lasts until refresh */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(() => {
    const stored = readStored();
    setSessionUser(stored); // (3) mock-only
    return stored;
  });

  const login = useCallback(async (email: string, password: string) => {
    const signIn = (found: CurrentUser) => {
      setSessionUser(found);
      writeStored(found);
      setUser(found);
      return found;
    };

    let response: Response;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      const demoUser = import.meta.env.DEV ? authenticate(email, password) : null;
      if (demoUser) return signIn(demoUser);
      throw new ApiError('AUTH', 'Could not reach the sign-in service. Check that the backend is running.');
    }

    const responseText = await response.text();
    // The receptionist demo exists in the local seed, not necessarily in PostgreSQL.
    if (!response.ok && import.meta.env.DEV) {
      const demoUser = authenticate(email, password);
      if (demoUser) return signIn(demoUser);
    }

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
        response.headers.get('X-Error-Code') === 'email_not_verified' ? 'UNVERIFIED' : 'AUTH',
        typeof data.detail === 'string'
          ? data.detail
          : response.status >= 500
            ? 'Sign-in is temporarily unavailable. Check that the backend database is configured and running.'
            : 'Wrong email or password.',
      );
    }

    return signIn(data as CurrentUser);
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<PendingRegistration> => {
    const data = await postJson<{ email: string; email_sent?: boolean }>('/auth/register', input, 'Registration failed.');
    return { email: data.email, emailSent: data.email_sent !== false };
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const verified = await postJson<CurrentUser>('/auth/verify-email', { email, code }, 'Could not confirm the email.');
    // Trainers have no app area yet, so they are confirmed but not signed in.
    if (ENABLED_ROLES.includes(verified.role)) {
      setSessionUser(verified);
      writeStored(verified);
      setUser(verified);
    }
    return verified;
  }, []);

  const resendCode = useCallback(async (email: string) => {
    await postJson('/auth/resend-code', { email }, 'Could not send a new code.');
  }, []);

  const logout = useCallback(() => {
    setSessionUser(null);
    writeStored(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, register, verifyEmail, resendCode, logout }),
    [user, login, register, verifyEmail, resendCode, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
