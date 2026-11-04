import type { CurrentUser, Role } from '../types';
import { ApiError } from './ApiError';

// Stands in for "the server knows who is calling" (token / cookie).
// AuthContext sets this; every api/* function reads it to decide what data the caller may see.
let current: CurrentUser | null = null;

export function setSessionUser(user: CurrentUser | null) {
  current = user;
}

export function requireUser(roles?: Role[]): CurrentUser {
  if (!current) throw new ApiError('FORBIDDEN', 'You are not signed in.');
  if (roles && !roles.includes(current.role)) {
    throw new ApiError('FORBIDDEN', 'Your account is not allowed to do this.');
  }
  return current;
}
