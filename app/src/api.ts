/**
 * Typed client for the Worker (`api/`). All requests carry the session
 * cookie; a non-2xx JSON `{ error: { code, message } }` response becomes an
 * `ApiError`, and anything that isn't valid JSON becomes an `ApiError` with
 * code `network` (the request itself failed) or `unexpected` (a response
 * came back but wasn't the JSON shape we expect).
 */

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const err = value.error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code: unknown }).code === 'string' &&
    typeof (err as { message: unknown }).message === 'string'
  );
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server.');
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      'unexpected',
      'Unexpected server response.',
    );
  }

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message);
    }
    throw new ApiError(
      response.status,
      'unexpected',
      'Unexpected server response.',
    );
  }

  return body as T;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health');
}
