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
 *      register(input) : Promise<CurrentUser>  (member self sign-up; signs the new member in)
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
import { delay } from '../api/helpers';
import { setSessionUser } from '../api/session';
import type { CurrentUser } from '../types';
import { authenticate, registerMember, type RegisterInput } from './mockUsers';

const STORAGE_KEY = 'gbs_current_user';

interface AuthValue {
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<CurrentUser>;
  register: (input: RegisterInput) => Promise<CurrentUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStored(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
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
    await delay();
    const found = authenticate(email, password); // (1) REPLACE with the real login request
    if (!found) throw new ApiError('AUTH', 'Wrong email or password.');
    setSessionUser(found); // (3) mock-only
    writeStored(found); // (2)
    setUser(found);
    return found;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await delay();
    const created = registerMember(input); // (1b) REPLACE with the real sign-up request
    setSessionUser(created); // (3) mock-only
    writeStored(created); // (2)
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(() => {
    setSessionUser(null);
    writeStored(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, register, logout }), [user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
