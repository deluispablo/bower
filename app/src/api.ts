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

  if (response.status === 204) {
    return undefined as T;
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

export interface Vault {
  folderId: string;
  inboxFolderId: string;
  name: string;
}

export interface Me {
  email: string;
  vault: Vault | null;
  quota: { used: number; limit: number };
  needsReauth: boolean;
  hasApiKey: boolean;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>('/me');
}

interface VaultResponse {
  vault: Vault;
}

/** `POST /vault { mode: 'create' }`: a new folder from the template. */
export async function createVault(): Promise<Vault> {
  const { vault } = await apiFetch<VaultResponse>('/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'create' }),
  });
  return vault;
}

/** `POST /vault { mode: 'select', folderId }`: an existing Drive folder. */
export async function selectVault(folderId: string): Promise<Vault> {
  const { vault } = await apiFetch<VaultResponse>('/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'select', folderId }),
  });
  return vault;
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

/** The Worker's `/auth/login`: a full navigation, never fetched. */
export function loginUrl(): string {
  return `${API_URL}/auth/login`;
}

export interface UpdateSettingsInput {
  /** A new BYOK Claude API key, or `null` to remove a saved one. */
  apiKey: string | null;
}

export interface UpdateSettingsResult {
  hasApiKey: boolean;
}

export function updateSettings(
  input: UpdateSettingsInput,
): Promise<UpdateSettingsResult> {
  return apiFetch<UpdateSettingsResult>('/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** Removes the account and its data. The Drive folder itself is untouched. */
export function deleteAccount(): Promise<void> {
  return apiFetch<void>('/me', { method: 'DELETE' });
}
