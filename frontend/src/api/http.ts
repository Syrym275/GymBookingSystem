import { ApiError, type ApiErrorCode } from './ApiError';

type Query = Record<string, string | number | undefined | null>;

/** Adds the non-empty values as a query string. */
export function withQuery(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

const codeFor = (status: number): ApiErrorCode =>
  status === 404 ? 'NOT_FOUND' : status === 401 || status === 403 ? 'FORBIDDEN' : 'VALIDATION';

/**
 * Calls the backend (through the /api proxy) with the session cookie and returns the JSON body.
 * A failed call throws ApiError with the backend's `detail` message, or `fallback` when there is none.
 */
export async function api<T>(
  path: string,
  fallback: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('VALIDATION', `${fallback} Check the backend connection and try again.`);
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data && typeof data.detail === 'string' ? data.detail : fallback;
    throw new ApiError(codeFor(response.status), detail);
  }
  return data as T;
}
