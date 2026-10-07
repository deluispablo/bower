/**
 * The runner's Drive token, from the Worker's `GET /runner/runs/:id/token`
 * with the run's ticket (TL-P3-18). The token is kept until shortly before
 * `expiresAt`; `grant()` always asks the Worker again, so the attempt it
 * reports is current (one read per write batch, TL-P3-19).
 */
import { BowerError } from '../../src/data/types';

/** What `GET /runner/runs/:id/token` answers. */
export interface TokenGrant {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  folderId: string;
  attempt: number;
}

export interface RunnerTokenOptions {
  /** The Worker's origin, such as `https://api.example.com`. */
  api: string;
  runId: string;
  ticket: string;
  fetch?: typeof fetch;
  now?: () => number;
}

/** A token this close to its expiry is asked for again. */
const MARGIN_MS = 60_000;
/** The marker on a stale-attempt refusal (`BowerError` cause). */
export const STALE_ATTEMPT = 'stale-attempt';

/** A newer attempt holds this run: this runner must stop writing. */
export const staleAttempt = (): BowerError => new BowerError('conflict', 'This tidy-up was taken over.', undefined, { cause: STALE_ATTEMPT });

export const isStaleAttempt = (e: unknown): boolean => e instanceof BowerError && e.cause === STALE_ATTEMPT;

export class RunnerToken {
  private readonly url: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private kept: TokenGrant | null = null;

  constructor(private readonly opts: RunnerTokenOptions) {
    this.url = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}/token`;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.now = opts.now ?? Date.now;
  }

  /** The Drive access token; `fresh` asks the Worker for a new one (after a 401 from Drive). */
  async token(fresh: boolean): Promise<string> {
    if (!fresh && this.kept && this.kept.expiresAt - MARGIN_MS > this.now()) return this.kept.accessToken;
    return (await this.grant()).accessToken;
  }

  /** Asks the Worker now, and keeps the token it gives. */
  async grant(): Promise<TokenGrant> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, { headers: { authorization: `Bearer ${this.opts.ticket}` } });
    } catch (e) {
      console.error(e);
      throw new BowerError('offline', "Bower couldn't reach its server. It will try again.");
    }
    const body = (await res.json().catch((e: unknown) => {
      console.error(e);
      return null;
    })) as { error?: { code?: unknown } } | Partial<TokenGrant> | null;
    const code = body && 'error' in body && typeof body.error === 'object' && body.error !== null ? body.error.code : undefined;
    if (res.status === 409 && code === STALE_ATTEMPT) throw staleAttempt();
    if (res.status === 401) {
      console.error('The token route refused the run ticket');
      throw new BowerError('auth', 'This tidy-up is no longer allowed to change your folder.');
    }
    const grant = res.ok ? asGrant(body) : null;
    if (!grant) {
      console.error(`The token route answered ${res.status}`);
      throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
    }
    this.kept = grant;
    return grant;
  }
}

function asGrant(body: unknown): TokenGrant | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { accessToken, expiresAt, folderId, attempt } = b;
  if (typeof accessToken !== 'string' || typeof expiresAt !== 'number' || typeof folderId !== 'string' || typeof attempt !== 'number') return null;
  return { accessToken, expiresAt, folderId, attempt };
}
