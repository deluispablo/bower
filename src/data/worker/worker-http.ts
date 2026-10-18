/**
 * The real Worker over HTTP, with the session cookie. Its error bodies
 * (`{ error: { code, message } }`) become a `BowerError` with the Worker's
 * own sentence; anything else gets one plain sentence.
 */
import { BowerError, type ErrorCode } from '../types';
import { DRIVE_MESSAGES } from '../drive/drive-api';
import { answered } from '../wait';
import { isRunWire, type Me, type ProcessOptions, type RunReply, type StatusReply, type WorkerApi } from './worker-api';
import { isLeaseReply, openElsewhere, type LeaseReply, type SessionAction } from '../session';

const SENTENCE: Record<ErrorCode, string> = {
  auth: 'Sign in again to keep going.',
  offline: "You're offline. Try again when you're back.",
  'not-found': 'Your Bower folder is not there any more.',
  conflict: 'That cannot be done right now.',
  unknown: "Bower's server didn't answer. Try again.",
  unreached: DRIVE_MESSAGES.unreached,
};

const codeFor = (status: number): ErrorCode => (status === 401 ? 'auth' : status === 404 ? 'not-found' : status === 409 ? 'conflict' : 'unknown');

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isMe = (v: unknown): v is Me => object(v) && object(v.user) && text(v.user.name) && text(v.user.email) && (v.folderId === null || text(v.folderId));
interface TokenReply { accessToken: string; expiresAt: number }
const isToken = (v: unknown): v is TokenReply => object(v) && text(v.accessToken) && typeof v.expiresAt === 'number' && Number.isFinite(v.expiresAt) && v.expiresAt >= 0;
interface FolderReply { folderId: string; found: boolean }
const isFolder = (v: unknown): v is FolderReply => object(v) && text(v.folderId) && typeof v.found === 'boolean';
/** The revision the Worker answers every run with (TL-P3-15): a whole number from 0. */
const revision = (v: Record<string, unknown>): v is Record<string, unknown> & { revision: number } => typeof v.revision === 'number' && Number.isSafeInteger(v.revision) && v.revision >= 0;
const isRunReply = (v: unknown): v is RunReply => object(v) && isRunWire(v.run) && revision(v);
const isStatus = (v: unknown): v is StatusReply => object(v) && (v.run === null || isRunWire(v.run)) && revision(v);

export class WorkerHttp implements WorkerApi {
  private token: { value: string; until: number } | null = null;
  private tokenAsk: Promise<string> | null = null;
  /** The place this tab holds the lease for, sent with the calls the Worker fences (TL-P2-14, P3 contract). */
  private place: { place: string; epoch: number } | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly base: string,
    f?: typeof fetch,
  ) {
    this.fetchFn = f ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async me(): Promise<Me | null> {
    try {
      return await this.call<Me>('GET', '/me', undefined, isMe);
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
    this.tokenAsk = null;
    await this.call('POST', '/auth/logout');
  }

  async deleteAccount(): Promise<void> {
    this.token = null;
    this.tokenAsk = null;
    await this.call('DELETE', '/me', undefined, undefined, this.fence());
  }

  async driveToken(fresh: boolean): Promise<string> {
    if (!fresh && this.tokenAsk) return this.tokenAsk;
    if (!fresh && this.token && this.token.until > Date.now() + 60_000) return this.token.value;
    const pending = this.call<TokenReply>('GET', fresh ? '/drive/token?fresh=1' : '/drive/token', undefined, isToken).then((t) => {
      if (this.tokenAsk === pending) this.token = { value: t.accessToken, until: t.expiresAt };
      return t.accessToken;
    }).finally(() => {
      if (this.tokenAsk === pending) this.tokenAsk = null;
    });
    this.tokenAsk = pending;
    return pending;
  }

  async createFolder(): Promise<{ id: string; found: boolean }> {
    const r = await this.call<FolderReply>('POST', '/vault', {}, isFolder, this.fence());
    return { id: r.folderId, found: r.found };
  }

  async process(scope: 'all' | 'instructions', opts: ProcessOptions = {}): Promise<RunReply> {
    const body = { scope, allowWeb: !!opts.allowWeb, ...(opts.requestId !== undefined ? { requestId: opts.requestId } : {}), ...(opts.subject !== undefined ? { subject: opts.subject } : {}), ...(opts.answer ? { answer: true } : {}) };
    const reply = await this.call<RunReply>('POST', '/process', body, isRunReply, this.fence());
    return { run: reply.run, revision: reply.revision, ...(reply.waits === true ? { waits: true } : {}) };
  }

  async status(): Promise<StatusReply> {
    const reply = await this.call<StatusReply>('GET', '/status', undefined, isStatus);
    return { run: reply.run, revision: reply.revision };
  }

  /** POST /session: the Worker binds the lease to the signed-in person; `place` is a random tab id, no secret. */
  async session(place: string, action: SessionAction, gen = 0): Promise<LeaseReply> {
    // Leaving is sent as the page closes: keepalive lets it outlive the page (sendBeacon cannot set headers).
    const reply = await this.call<LeaseReply>('POST', '/session', { place, action, gen }, isLeaseReply, {}, action === 'leave');
    if (reply.active) this.place = { place, epoch: reply.epoch };
    else if (this.place?.place === place) this.place = null;
    return { active: reply.active, epoch: reply.epoch };
  }

  /** The place and epoch the Worker checks on process, createFolder and deleteAccount; none before a session. */
  private fence(): Record<string, string> {
    return this.place ? { 'x-bower-place': this.place.place, 'x-bower-epoch': String(this.place.epoch) } : {};
  }

  private async call<T>(method: string, path: string, body?: unknown, valid?: (v: unknown) => v is T, extra: Record<string, string> = {}, keepalive = false): Promise<T> {
    let res: Response;
    try {
      const headers = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra };
      res = await answered(this.fetchFn, `${this.base}${path}`, {
        method,
        credentials: 'include',
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(keepalive ? { keepalive: true } : {}),
      });
    } catch (e) {
      if (e instanceof TypeError) throw new BowerError('offline', SENTENCE.offline);
      console.error(e);
      throw new BowerError('unknown', SENTENCE.unknown);
    }
    const empty = (method === 'POST' && path === '/auth/logout') || (method === 'DELETE' && path === '/me');
    const invalid = (): never => {
      // No response content in diagnostics: it may contain credentials or the person's details.
      console.error(`Worker gave an invalid response (${res.status}) for ${method} ${path}`);
      throw new BowerError('unknown', "Bower's server sent an unreadable reply. Try again.");
    };
    if (res.status === 204) return empty ? undefined as T : invalid();
    // expected: an error page from a proxy may not be JSON; the status code still says what happened.
    const parsed: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = codeFor(res.status);
      const error = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      // A stale or missing session epoch (TL-P2-14/24): another place is active, told apart from other conflicts.
      if (res.status === 409 && error?.code === 'stale-session') throw openElsewhere();
      const message = error?.message;
      if (code === 'unknown') console.error(`Worker answered ${res.status} for ${method} ${path}`);
      throw new BowerError(code, typeof message === 'string' && message ? message : SENTENCE[code], undefined, { cause: { httpStatus: res.status } });
    }
    if (empty || !valid || !valid(parsed)) return invalid();
    return parsed;
  }
}
