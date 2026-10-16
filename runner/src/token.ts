/**
 * The runner's Drive token, from the Worker's `GET /runner/runs/:id/token`
 * with the run's ticket (TL-P3-18). The token is kept until shortly before
 * `expiresAt`; `grant()` asks the Worker again, or joins the request already in flight (`fresh=1` after a Drive 401,
 * RFC 6750 section 3.1). The attempt check
 * before each fenced write is `attempt()`, `GET /runner/runs/:id/attempt`:
 * answered by the person object alone, with no Google call (TL-P4-04). A 410 `gone` from either route (Delete me,
 * or Google access revoked or unreadable) drops the kept token.
 */
import { BowerError } from '../../src/data/types';
import { askAgainNow, noAnswer, send, type Fetch, type Pacing } from '../../src/data/drive/transport';
import { isAdmissionManifest, type AdmissionManifest } from '../../src/data/spine/admission';

/** What `GET /runner/runs/:id/token` answers. */
export interface TokenGrant {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  folderId: string;
  attempt: number;
  /** What the run was admitted to take (TL-P3-21); null when the Worker kept none. */
  manifest: AdmissionManifest | null;
}

export interface RunnerTokenOptions {
  /** The Worker's origin, such as `https://api.example.com`. */
  api: string;
  runId: string;
  ticket: string;
  fetch?: Fetch;
  now?: () => number;
  /** The transport's waits between tries; the real backoff when absent. */
  pacing?: Partial<Pacing>;
}

/** A token this close to its expiry is asked for again. */
const MARGIN_MS = 60_000;
/** The marker on a stale-attempt refusal (`BowerError` cause). */
export const STALE_ATTEMPT = 'stale-attempt';

/** A newer attempt holds this run: this runner must stop writing. */
export const staleAttempt = (): BowerError => new BowerError('conflict', 'This tidy-up was taken over.', undefined, { cause: STALE_ATTEMPT });

export const isStaleAttempt = (e: unknown): boolean => e instanceof BowerError && e.cause === STALE_ATTEMPT;

/** The marker on a gone refusal (`BowerError` cause). */
export const GONE = 'gone';
/** The signed-out sentence: the run's ticket is refused, or the person is gone. */
export const NO_LONGER_ALLOWED = 'This tidy-up is no longer allowed to change your folder.';

/**
 * The person is gone (Delete me, or Google access revoked or unreadable): the Worker answers 410 `gone` (RFC 9110,
 * 15.5.11). The kept Drive token is dropped, and this runner writes nothing more.
 */
export const gone = (): BowerError => new BowerError('auth', NO_LONGER_ALLOWED, undefined, { cause: GONE });

export const isGone = (e: unknown): boolean => e instanceof BowerError && e.cause === GONE;

/** Bower's server got no answer through: a runner is never told it is offline (`transport.ts`). */
const UNREACHED = "Bower couldn't reach its server. It will try again.";
export const unreached = (): BowerError => noAnswer('headless', { offline: UNREACHED, elsewhere: UNREACHED });

/** A runner route's answer worth asking again, by the one table (`transport.ts`): rate limited, timed out, or failed. */
export const serverBusy = (res: Response): boolean => askAgainNow(res.status, []);

export class RunnerToken {
  private readonly url: string;
  private readonly fetchFn: Fetch;
  private readonly now: () => number;
  private kept: TokenGrant | null = null;
  /** The token request in flight, shared by parallel callers (single flight, as `LiveRuns.refreshing`). */
  private inflight: { fresh: boolean; grant: Promise<TokenGrant> } | null = null;

  private readonly attemptUrl: string;

  constructor(private readonly opts: RunnerTokenOptions) {
    const run = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}`;
    this.url = `${run}/token`;
    this.attemptUrl = `${run}/attempt`;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.now = opts.now ?? Date.now;
  }

  /** The Drive access token; `fresh` asks the Worker for a new one (after a 401 from Drive). */
  async token(fresh: boolean): Promise<string> {
    if (!fresh && this.kept && this.kept.expiresAt - MARGIN_MS > this.now()) return this.kept.accessToken;
    return (await this.grant(fresh)).accessToken;
  }

  /**
   * Asks the Worker, and keeps the token it gives. A plain call joins any request in flight; a fresh one joins only a
   * fresh one, since a plain answer may be the token Drive refused.
   */
  grant(fresh = false): Promise<TokenGrant> {
    if (this.inflight && (this.inflight.fresh || !fresh)) return this.inflight.grant;
    const flight = {
      fresh,
      grant: this.ask(fresh ? `${this.url}?fresh=1` : this.url, 'token').then((body) => {
        const grant = asGrant(body);
        if (!grant) {
          console.error('The token route answered no token');
          throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
        }
        // Only the request still in flight keeps its token: a plain one overtaken by a fresh one never replaces it.
        if (this.inflight === flight) this.kept = grant;
        return grant;
      }).finally(() => {
        if (this.inflight === flight) this.inflight = null;
      }),
    };
    this.inflight = flight;
    return flight.grant;
  }

  /** The run's current attempt, asked now; the Worker answers it from the person object alone, with no Google call. */
  async attempt(): Promise<number> {
    const body = await this.ask(this.attemptUrl, 'attempt');
    const attempt = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).attempt : undefined;
    if (typeof attempt !== 'number') {
      console.error('The attempt route answered no attempt');
      throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
    }
    return attempt;
  }

  /** One GET of a runner route with the ticket: its body when it answered 2xx; a refusal as a `BowerError`. */
  private async ask(url: string, route: string): Promise<unknown> {
    let res: Response;
    try {
      // Idempotent: asking again changes nothing on the Worker (`transport.ts`).
      res = await send(this.fetchFn, url, { headers: { authorization: `Bearer ${this.opts.ticket}` } }, { idempotent: true, again: serverBusy, pacing: this.opts.pacing });
    } catch (e) {
      console.error(e);
      throw unreached();
    }
    const body = (await res.json().catch((e: unknown) => {
      console.error(e);
      return null;
    })) as unknown;
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (res.status === 409 && code === STALE_ATTEMPT) throw staleAttempt();
    if (res.status === 410 || res.status === 401) {
      // A bearer token works for whoever holds it until it expires (RFC 6750, sections 1.2 and 5.3). Google ends it
      // early only when the grant is revoked (developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke),
      // and an unreadable refresh token never is: the kept one is dropped here, and nothing more is written with it.
      this.kept = null;
      console.error(`The ${route} route answered ${res.status}: the run ticket is refused or the person is gone`);
      throw res.status === 410 ? gone() : new BowerError('auth', NO_LONGER_ALLOWED);
    }
    if (!res.ok) {
      console.error(`The ${route} route answered ${res.status}`);
      throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
    }
    return body;
  }
}

function asGrant(body: unknown): TokenGrant | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { accessToken, expiresAt, folderId, attempt } = b;
  if (typeof accessToken !== 'string' || typeof expiresAt !== 'number' || typeof folderId !== 'string' || typeof attempt !== 'number') return null;
  // A manifest that is there and is not one is refused; none at all is a run admitted with none kept.
  const manifest = b.manifest ?? null;
  if (manifest !== null && !isAdmissionManifest(manifest)) return null;
  return { accessToken, expiresAt, folderId, attempt, manifest };
}
