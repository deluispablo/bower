/**
 * The real Worker over HTTP, with the session cookie. Its error bodies
 * (`{ error: { code, message } }`) become a `BowerError` with the Worker's
 * own sentence; anything else gets one plain sentence.
 */
import { BowerError, type ErrorCode } from '../types';
import type { Me, RunWire, WorkerApi } from './worker-api';

const SENTENCE: Record<ErrorCode, string> = {
  auth: 'Sign in again to keep going.',
  offline: "You're offline. Try again when you're back.",
  'not-found': 'Your Bower folder is not there any more.',
  conflict: 'That cannot be done right now.',
  unknown: "Bower's server didn't answer. Try again.",
};

const codeFor = (status: number): ErrorCode => (status === 401 ? 'auth' : status === 404 ? 'not-found' : status === 409 ? 'conflict' : 'unknown');

export class WorkerHttp implements WorkerApi {
  private token: { value: string; until: number } | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly base: string,
    f?: typeof fetch,
  ) {
    this.fetchFn = f ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async me(): Promise<Me | null> {
    try {
      return await this.call<Me>('GET', '/me');
    } catch (e) {
      if (e instanceof BowerError && e.code === 'auth') return null;
      throw e;
    }
  }

  signIn(): Promise<void> {
    location.assign(`${this.base}/auth/login`);
    return new Promise(() => undefined);
  }

  async signOut(): Promise<void> {
    this.token = null;
    await this.call('POST', '/auth/logout');
  }

  async deleteAccount(): Promise<void> {
    this.token = null;
    await this.call('DELETE', '/me');
  }

  async driveToken(fresh: boolean): Promise<string> {
    if (!fresh && this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const t = await this.call<{ accessToken: string; expiresAt: number }>('GET', fresh ? '/drive/token?fresh=1' : '/drive/token');
    this.token = { value: t.accessToken, until: t.expiresAt };
    return t.accessToken;
  }

  async createFolder(): Promise<{ id: string; found: boolean }> {
    const r = await this.call<{ folderId: string; found?: boolean }>('POST', '/vault', {});
    return { id: r.folderId, found: !!r.found };
  }

  async process(scope: 'all' | 'instructions', opts: { allowWeb?: boolean } = {}): Promise<RunWire> {
    return (await this.call<{ run: RunWire }>('POST', '/process', { scope, allowWeb: !!opts.allowWeb })).run;
  }

  async status(): Promise<RunWire | null> {
    return (await this.call<{ run: RunWire | null }>('GET', '/status')).run;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method,
        credentials: 'include',
        ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      if (e instanceof TypeError) throw new BowerError('offline', SENTENCE.offline);
      console.error(e);
      throw new BowerError('unknown', SENTENCE.unknown);
    }
    if (res.status === 204) return undefined as T;
    // expected: an error page from a proxy may not be JSON; the status code still says what happened.
    const parsed: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = codeFor(res.status);
      const message = (parsed as { error?: { message?: unknown } } | null)?.error?.message;
      if (code === 'unknown') console.error(`Worker answered ${res.status} for ${method} ${path}`);
      throw new BowerError(code, typeof message === 'string' && message ? message : SENTENCE[code]);
    }
    return parsed as T;
  }
}
