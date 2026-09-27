/**
 * Typed client for the Worker (`api/`). All requests carry the session
 * cookie; a non-2xx JSON `{ error: { code, message } }` response becomes an
 * `ApiError`, and anything that isn't valid JSON becomes an `ApiError` with
 * code `network` (the request itself failed) or `unexpected` (a response
 * came back but wasn't the JSON shape we expect).
 *
 * The endpoints sit behind one `WorkerClient` object so a demo build can
 * swap in an in-memory one (see `demoReady` below).
 */

import type { DriveToken } from './drive.js';

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

export interface Vault {
  folderId: string;
  inboxFolderId: string;
  name: string;
}

export interface Me {
  email: string;
  /** The Worker does not send one today; never invented client-side. */
  name?: string;
  vault: Vault | null;
  quota: { used: number; limit: number };
  needsReauth: boolean;
  hasApiKey: boolean;
  /** ISO-8601; when the first-run tour was finished or skipped. Absent until then. */
  tourSeenAt?: string;
}

/**
 * What `/me` answers, once, right after a sign-in with an address that is
 * not on the invite list: the Worker reads it from a five-minute cookie and
 * clears it, so a reload no longer has the address.
 */
export interface NotInvitedMe {
  notInvited: true;
  email: string;
}

export function isNotInvited(me: Me | NotInvitedMe): me is NotInvitedMe {
  return 'notInvited' in me && me.notInvited;
}

interface VaultResponse {
  vault: Vault;
}

/** A missing field leaves the stored value as it is. */
export interface UpdateSettingsInput {
  /** A new BYOK Claude API key, or `null` to remove a saved one. */
  apiKey?: string | null;
  /** ISO-8601 (`Date.prototype.toISOString()`): the first-run tour was seen. */
  tourSeenAt?: string;
}

export interface UpdateSettingsResult {
  hasApiKey: boolean;
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
  /** Paths the pre-scan set aside under `0-Inbox/Quarantine/` this run. */
  quarantined?: string[];
  /** Paths (or `"*"` for the whole run) the post-run audit refused. */
  refused?: string[];
  error?: string;
  runId?: string;
}

export interface StatusResponse {
  run: Run | null;
  stale: boolean;
}

export interface PushPublicKeyResponse {
  publicKey: string;
}

/**
 * Every Worker endpoint the app calls, as one object. The exported
 * functions below delegate to the current implementation: the real one
 * (`httpWorkerClient`, over `apiFetch`) by default, the in-memory one in a
 * demo build (`VITE_DEMO=1`, `demo/index.ts`). Each method is documented on
 * its exported function.
 */
export interface WorkerClient {
  getHealth(): Promise<HealthResponse>;
  getMe(): Promise<Me | NotInvitedMe>;
  createVault(): Promise<Vault>;
  selectVault(folderId: string): Promise<Vault>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  updateSettings(input: UpdateSettingsInput): Promise<UpdateSettingsResult>;
  deleteAccount(): Promise<void>;
  startProcess(): Promise<{ run: Run }>;
  getStatus(): Promise<StatusResponse>;
  getPushPublicKey(): Promise<PushPublicKeyResponse>;
  subscribePush(subscription: PushSubscriptionJSON): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
  getDriveToken(fresh: boolean): Promise<DriveToken>;
}

function postVault(body: unknown): Promise<Vault> {
  return apiFetch<VaultResponse>('/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(({ vault }) => vault);
}

function sendJson(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** The real Worker client: every call is an `apiFetch`. */
export const httpWorkerClient: WorkerClient = {
  getHealth: () => apiFetch<HealthResponse>('/health'),
  getMe: () => apiFetch<Me | NotInvitedMe>('/me'),
  createVault: () => postVault({ mode: 'create' }),
  selectVault: (folderId) => postVault({ mode: 'select', folderId }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  logoutAll: () => apiFetch<void>('/auth/logout-all', { method: 'POST' }),
  updateSettings: (input) =>
    apiFetch<UpdateSettingsResult>('/settings', sendJson('PATCH', input)),
  deleteAccount: () => apiFetch<void>('/me', { method: 'DELETE' }),
  startProcess: () => apiFetch<{ run: Run }>('/process', { method: 'POST' }),
  getStatus: () => apiFetch<StatusResponse>('/status'),
  getPushPublicKey: () => apiFetch<PushPublicKeyResponse>('/push/public-key'),
  subscribePush: (subscription) => {
    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;
    if (endpoint === undefined || p256dh === undefined || auth === undefined) {
      throw new Error('Incomplete push subscription.');
    }
    return apiFetch<void>(
      '/push/subscribe',
      sendJson('POST', { subscription: { endpoint, keys: { p256dh, auth } } }),
    );
  },
  unsubscribePush: (endpoint) =>
    apiFetch<void>('/push/subscribe', sendJson('DELETE', { endpoint })),
  getDriveToken: (fresh) =>
    apiFetch<DriveToken>(fresh ? '/drive/token?fresh=1' : '/drive/token'),
};

let worker: WorkerClient = httpWorkerClient;

/**
 * Whether this is a demo build (`VITE_DEMO=1`): a build-time constant, so
 * every call site (the UI's "Run your own Bower" screens, #193, included)
 * folds to a plain `false` and drops out of a production bundle.
 */
export function isDemo(): boolean {
  return import.meta.env.VITE_DEMO === '1';
}

/**
 * The demo switch, decided at build time: with `VITE_DEMO=1` the demo
 * module (its own chunk) is loaded and installs its in-memory clients
 * before any call goes out; otherwise this is `null` and the whole branch,
 * the dynamic import included, is dropped from the bundle. Checked inline
 * (not via `isDemo()`) so the constant-folds-to-`false` case stays a
 * literal esbuild can dead-code-eliminate the `import()` for, rather than
 * a call it would have to inline first.
 */
const demoReady: Promise<void> | null =
  import.meta.env.VITE_DEMO === '1'
    ? import('./demo/index.js').then((demo) => demo.install())
    : null;

/** Swaps the Worker client. Only `demo/index.ts` and tests call it. */
export function setWorkerClient(client: WorkerClient): void {
  worker = client;
}

/**
 * Runs `call` once the build's clients are in place: at once in a real
 * build (so a synchronous throw stays synchronous), after the demo module
 * has loaded in a demo build. `drive.ts` routes its calls through it too.
 */
export function whenReady<T>(call: () => Promise<T>): Promise<T> {
  return demoReady === null ? call() : demoReady.then(call);
}

function withWorker<T>(call: (client: WorkerClient) => Promise<T>): Promise<T> {
  return whenReady(() => call(worker));
}

export function getHealth(): Promise<HealthResponse> {
  return withWorker((c) => c.getHealth());
}

export function getMe(): Promise<Me | NotInvitedMe> {
  return withWorker((c) => c.getMe());
}

/** `POST /vault { mode: 'create' }`: a new folder from the template. */
export function createVault(): Promise<Vault> {
  return withWorker((c) => c.createVault());
}

/** `POST /vault { mode: 'select', folderId }`: an existing Drive folder. */
export function selectVault(folderId: string): Promise<Vault> {
  return withWorker((c) => c.selectVault(folderId));
}

export function logout(): Promise<void> {
  return withWorker((c) => c.logout());
}

/**
 * "Sign out everywhere": ends every session of this account, on every
 * device, this one included (`POST /auth/logout-all`).
 */
export function logoutAll(): Promise<void> {
  return withWorker((c) => c.logoutAll());
}

/**
 * The Worker's `/auth/login`: a full navigation, never fetched.
 * `selectAccount` makes Google show its account picker ("Try another account").
 */
export function loginUrl(options: { selectAccount?: boolean } = {}): string {
  const query = options.selectAccount === true ? '?prompt=select_account' : '';
  return `${API_URL}/auth/login${query}`;
}

/** `PATCH /settings`. */
export function updateSettings(
  input: UpdateSettingsInput,
): Promise<UpdateSettingsResult> {
  return withWorker((c) => c.updateSettings(input));
}

/** Removes the account and its data. The Drive folder itself is untouched. */
export function deleteAccount(): Promise<void> {
  return withWorker((c) => c.deleteAccount());
}

/**
 * `POST /process`: starts an agent run for the signed-in user's vault, or
 * returns the run already in progress. 429 (`ApiError` code `quota`) means
 * today's runs are used up.
 */
export function startProcess(): Promise<{ run: Run }> {
  return withWorker((c) => c.startProcess());
}

/**
 * `GET /status`: the signed-in user's current run, with staleness. A
 * `stale: true` run has already been rewritten server-side to `failed`
 * with `error: "stale"`.
 */
export function getStatus(): Promise<StatusResponse> {
  return withWorker((c) => c.getStatus());
}

/**
 * `GET /push/public-key`: the VAPID public key (base64url, raw P-256 point)
 * to pass as `applicationServerKey` to `pushManager.subscribe`.
 */
export function getPushPublicKey(): Promise<PushPublicKeyResponse> {
  return withWorker((c) => c.getPushPublicKey());
}

/**
 * `POST /push/subscribe`: stores this browser's push subscription for the
 * signed-in user. `subscription` is a `PushSubscription.toJSON()` result;
 * only `endpoint` and `keys.p256dh`/`keys.auth` are sent, matching what the
 * Worker accepts (see `docs/api.md`); an incomplete one throws.
 */
export function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<void> {
  return withWorker((c) => c.subscribePush(subscription));
}

/** `DELETE /push/subscribe`: removes the subscription stored for `endpoint`. */
export function unsubscribePush(endpoint: string): Promise<void> {
  return withWorker((c) => c.unsubscribePush(endpoint));
}

/**
 * `GET /drive/token` (`?fresh=1` when `fresh`): a short-lived Drive access
 * token. Callers go through `getToken` in `drive.ts`, which caches it.
 */
export function getDriveToken(fresh: boolean): Promise<DriveToken> {
  return withWorker((c) => c.getDriveToken(fresh));
}
