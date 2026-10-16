import { config } from '@/lib/config';
import { ApiError, type ApiErrorCode } from './apiError';

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

const unauthorizedListeners = new Set<() => void>();
// Incremented on every sign-in/sign-out so a 401 from a request that started under a
// previous session cannot tear down a newer one.
let sessionEpoch = 0;
export function bumpSessionEpoch() {
  sessionEpoch += 1;
}
/** Subscribe to 401 responses (used to clear client state and redirect to login). */
export function onUnauthorized(fn: () => void) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

function buildQuery(q?: Query) {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

function readCookie(name: string) {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];
}

const STATUS_CODES: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: 'VALIDATION', message: 'The request was invalid.' },
  401: { code: 'UNAUTHENTICATED', message: 'Your session has ended. Please sign in again.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
  404: { code: 'NOT_FOUND', message: 'The requested item was not found.' },
  409: { code: 'CONFLICT', message: 'The item changed or is not in a valid state for this action.' },
  422: { code: 'VALIDATION', message: 'Some fields are invalid.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and retry.' },
};

async function httpRequest<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}${buildQuery(query)}`, {
      method,
      // Session is carried by a Secure, HttpOnly, SameSite cookie set by the backend.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(isForm ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': readCookie('XSRF-TOKEN') ?? '' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Unable to reach the server. Check your connection.');
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  let serverMessage: string | undefined;
  let details: string[] | undefined;
  try {
    const data = await res.json();
    serverMessage = typeof data?.message === 'string' ? data.message.slice(0, 300) : undefined;
    details = Array.isArray(data?.details) ? data.details.slice(0, 20).map(String) : undefined;
  } catch {
    /* non-JSON error body — ignore, never render raw HTML */
  }
  const mapped = STATUS_CODES[res.status] ?? { code: 'SERVER' as const, message: 'The server could not complete the request.' };
  throw new ApiError(res.status, mapped.code, res.status >= 500 ? mapped.message : serverMessage ?? mapped.message, details);
}

export async function apiRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const epoch = sessionEpoch;
  try {
    if (config.useMocks) {
      const { handleMockRequest } = await import('@/mocks/server');
      return await handleMockRequest<T>(method, path, opts.query ?? {}, opts.body);
    }
    return await httpRequest<T>(method, path, opts.query, opts.body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && epoch === sessionEpoch && path !== '/auth/login' && path !== '/auth/session') {
      unauthorizedListeners.forEach((fn) => fn());
    }
    throw e;
  }
}

export const api = {
  get: <T>(path: string, query?: Query) => apiRequest<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, { body }),
};
