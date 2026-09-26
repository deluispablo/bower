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
  /** 429 `quota` only: seconds until the daily limit resets. */
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
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

/** The 429 `quota` body also carries `retryAfter` alongside `error`. */
function extractRetryAfter(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('retryAfter' in value)) {
    return undefined;
  }
  const retryAfter = value.retryAfter;
  return typeof retryAfter === 'number' ? retryAfter : undefined;
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
      throw new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        extractRetryAfter(body),
      );
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

export type RunState = 'queued' | 'running' | 'done' | 'failed';

/** Mirrors `Run` in `api/src/types.ts`. */
export interface Run {
  state: RunState;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  processed?: string[];
  error?: string;
  runId?: string;
}

/**
 * `POST /process`: starts an agent run for the signed-in user's vault, or
 * returns the run already in progress. 429 (`ApiError` code `quota`) means
 * today's runs are used up.
 */
export function startProcess(): Promise<{ run: Run }> {
  return apiFetch<{ run: Run }>('/process', { method: 'POST' });
}

export interface StatusResponse {
  run: Run | null;
  stale: boolean;
}

/**
 * `GET /status`: the signed-in user's current run, with staleness. A
 * `stale: true` run has already been rewritten server-side to `failed`
 * with `error: "stale"`.
 */
export function getStatus(): Promise<StatusResponse> {
  return apiFetch<StatusResponse>('/status');
}

export interface PushPublicKeyResponse {
  publicKey: string;
}

/**
 * `GET /push/public-key`: the VAPID public key (base64url, raw P-256 point)
 * to pass as `applicationServerKey` to `pushManager.subscribe`.
 */
export function getPushPublicKey(): Promise<PushPublicKeyResponse> {
  return apiFetch<PushPublicKeyResponse>('/push/public-key');
}

/**
 * `POST /push/subscribe`: stores this browser's push subscription for the
 * signed-in user. `subscription` is a `PushSubscription.toJSON()` result;
 * only `endpoint` and `keys.p256dh`/`keys.auth` are sent, matching what the
 * Worker accepts (see `docs/api.md`).
 */
export function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<void> {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (endpoint === undefined || p256dh === undefined || auth === undefined) {
    throw new Error('Incomplete push subscription.');
  }
  return apiFetch<void>('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: { endpoint, keys: { p256dh, auth } },
    }),
  });
}

/** `DELETE /push/subscribe`: removes the subscription stored for `endpoint`. */
export function unsubscribePush(endpoint: string): Promise<void> {
  return apiFetch<void>('/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
