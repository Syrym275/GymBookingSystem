import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../types';
import { useAuth } from './AuthContext';
import { t, type Key } from '../i18n';

export const HOME: Record<Role, string> = {
  member: '/member',
  trainer: '/trainer',
  receptionist: '/reception',
  admin: '/admin',
};

// Read from the dictionary each time, so the label follows the site language.
export const ROLE_LABEL = {} as Record<Role, string>;
for (const role of ['member', 'trainer', 'receptionist', 'admin'] as const) {
  Object.defineProperty(ROLE_LABEL, role, { enumerable: true, get: () => t(`role.${role}` as Key) });
}

/** Route guard: not logged in -> /login; wrong role -> that role's own dashboard. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}
