/**
 * The shapes of the real-adapter world (P3-18), shared by the app's suite (`src/data/contract/real.contract.test.ts`),
 * the runner's (`runner/test/real-adapters.test.ts`) and the Worker run in-process (`api/test/in-process.ts`).
 * Types only, with no imports that need Node or the Workers runtime, so each package's type check can read it:
 * the modules themselves are loaded at run time, where each one's types would not check under the others' settings.
 */
import type { FakeDrive } from '../../src/data/drive/fake-drive';

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ApiOptions {
  /** The Worker's origin (the app's too, as on staging). */
  origin: string;
  /** Everything the Worker reaches outside itself: Google's token endpoint, Drive and GitHub. */
  outside: Fetch;
}

/** The Worker's Hono app run in-process, over its person objects kept in SQLite in memory. */
export interface ApiHost {
  /** The Worker as this browser reaches it: the session cookie it holds goes with every call, as `credentials: 'include'`. */
  browser: Fetch;
  /** The Worker as the runner reaches it: no cookie. */
  fetch: Fetch;
  /** Alex, allowed and signed in (Google gave a refresh token), with `folderId` as the Bower folder; this browser holds the cookie. */
  signIn(folderId: string): Promise<void>;
  /** Another device where Alex is signed in: its own session cookie, in its own jar. */
  otherDevice(): Promise<Fetch>;
  /** When the person object's alarm is set for, or null. */
  alarmAt(): number | null;
  /**
   * Fires the person object's alarm at the time it was set for: what `Person.alarm()` does (`wake`: recovery, then
   * the run the waiting answers asked for) with the Worker's GitHub repository and token, at that time and through
   * `outside` (the alarm itself reads the wall clock and the global fetch). False when no alarm was set.
   */
  fireAlarm(): Promise<boolean>;
}

/** A `bower-tidy` dispatch's `client_payload`, as GitHub got it. */
export interface Dispatched {
  run_id: string;
  attempt: number;
  ticket: string;
  scope: 'all' | 'instructions';
  allow_web: boolean;
}

/** Steps between a runner job and the outside world: each request goes on with `next`, or is answered here. */
export type Hop = (url: URL, init: RequestInit, next: () => Promise<Response>) => Promise<Response>;

export interface RealWorld {
  origin: string;
  drive: FakeDrive;
  rootId: string;
  api: ApiHost;
  /** What the app's DriveHttp sends to Google: Drive v3, answered over `drive`. */
  driveFetch: Fetch;
  /** Every dispatch GitHub took, in order. */
  dispatched: Dispatched[];
  /** Runs the job of `dispatched[i]` through the runner's `main`, as GitHub Actions would; the exit code. */
  runJob(i: number, hop?: Hop): Promise<number>;
  /** Marks the job of `dispatched[i]` completed without running it (cancelled before its first step, or crashed). */
  killJob(i: number): void;
  /** Runs every dispatch whose job has not run yet, in order. */
  runPending(): Promise<void>;
  /** Google refuses the refresh token from now on (`invalid_grant`), and the access tokens it gave stop working. */
  revokeGoogle(): void;
  /** Every Drive write the Worker, the app or a runner sent, as `METHOD path`. */
  driveWrites(): string[];
  /** The path of every file in the folder outside `.bower`, sorted: what a tidy-up's effects leave. */
  paths(): Promise<string[]>;
}
