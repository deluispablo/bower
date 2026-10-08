/**
 * The runner's Drive token, from the Worker's `GET /runner/runs/:id/token`
 * with the run's ticket (TL-P3-18). The token is kept until shortly before
 * `expiresAt`; `grant()` always asks the Worker again. The attempt check
 * before each fenced write is `attempt()`, `GET /runner/runs/:id/attempt`:
 * answered by the person object alone, with no Google call (TL-P4-04).
 */
import { BowerError } from '../../src/data/types';
import { retried } from './retry';
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

  private readonly attemptUrl: string;

  constructor(private readonly opts: RunnerTokenOptions) {
    const run = `${opts.api.replace(/\/$/, '')}/runner/runs/${encodeURIComponent(opts.runId)}`;
    this.url = `${run}/token`;
    this.attemptUrl = `${run}/attempt`;
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
    const grant = asGrant(await this.ask(this.url, 'token'));
    if (!grant) {
      console.error('The token route answered no token');
      throw new BowerError('unknown', "Bower's server didn't answer. It will try again.");
    }
    this.kept = grant;
    return grant;
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
      // Idempotent: asking again changes nothing on the Worker (`retry.ts`).
      res = await retried(() => this.fetchFn(url, { headers: { authorization: `Bearer ${this.opts.ticket}` } }));
    } catch (e) {
      console.error(e);
      throw new BowerError('offline', "Bower couldn't reach its server. It will try again.");
    }
    const body = (await res.json().catch((e: unknown) => {
      console.error(e);
      return null;
    })) as unknown;
    const error = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    if (res.status === 409 && code === STALE_ATTEMPT) throw staleAttempt();
    if (res.status === 401) {
      console.error(`The ${route} route refused the run ticket`);
      throw new BowerError('auth', 'This tidy-up is no longer allowed to change your folder.');
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
