import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../types';
import { useAuth } from './AuthContext';

export const HOME: Record<Role, string> = {
  member: '/member',
  trainer: '/trainer',
  receptionist: '/reception',
  admin: '/admin',
};

export const ROLE_LABEL: Record<Role, string> = {
  member: 'Member',
  trainer: 'Trainer',
  receptionist: 'Receptionist',
  admin: 'Admin / Manager',
};

/** Route guard: not logged in -> /login; wrong role -> that role's own dashboard. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}
