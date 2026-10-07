/**
 * Where the app's data comes from, picked once at start:
 * - `demo`: Alex's folder in memory (`DemoWorld`), the UI's reference;
 * - `fake`: the real logic (Drive folder, journal, runs) over a fake Drive
 *   and a fake Worker in the browser, seeded with the same folder;
 * - `real`: Google Drive and Bower's Worker at `apiBase()`.
 * `?source=` picks one for the tab; with `VITE_API_URL` set and no query,
 * the app is real.
 */
import { DriveHttp } from './drive/drive-http';
import type { DemoWorld } from './demo/world';
import type { Scenario, TimeScale } from './demo/scenario';
import { makeLiveSources, uploadAccount } from './live';
import { fenceDoors, leavingLetsGo } from './session';
import type { Sources } from './sources';
import { WorkerHttp } from './worker/worker-http';

export type SourceKind = 'demo' | 'fake' | 'real';
const KEY = 'bower:demo:source';
const isKind = (v: string | null): v is SourceKind => v === 'demo' || v === 'fake' || v === 'real';

/**
 * The Worker's address: `VITE_API_URL` when set, else the app's own origin,
 * where the Worker answers its own paths (one origin, TL-P3-06).
 */
export function apiBase(): string {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  return api ? api : location.origin;
}

export function readSource(): SourceKind {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  try {
    const q = new URLSearchParams(location.search).get('source');
    if (q !== null) {
      const kind: SourceKind = isKind(q) ? q : 'demo';
      sessionStorage.setItem(KEY, kind);
      return kind;
    }
    const kept = sessionStorage.getItem(KEY);
    if (isKind(kept)) return kept;
  } catch {
    // expected: Storage may be blocked; the address decides.
  }
  return api ? 'real' : 'demo';
}

/** Switches the tab to another source and starts again. */
export function chooseSource(kind: SourceKind): void {
  try {
    sessionStorage.setItem(KEY, kind);
  } catch {
    // expected: Without storage the address carries it.
  }
  const url = new URL(location.href);
  url.searchParams.set('source', kind);
  location.assign(url.toString());
}

export async function buildSources(kind: SourceKind, scenario: Scenario, scale: TimeScale): Promise<{ sources: Sources; world?: DemoWorld }> {
  // The demo and the pretend Drive load only when asked for: the real app never downloads them.
  // One active place per person (TL-P2-13) on every source: demo and each fake
  // scenario are separate worlds that never block each other, and the person is a hash of their email.
  if (kind === 'demo') {
    const [{ DemoWorld }, { ALEX }, { localPlace }] = await Promise.all([import('./demo/world'), import('./demo/fixture'), import('./fake/fake-lease')]);
    const world = new DemoWorld({ scenario, scale });
    // The demo has no Worker: its lease lives in this browser, as the pretend Worker's does.
    const place = localPlace({ world: 'demo', person: await uploadAccount(ALEX.email) });
    const fenced = fenceDoors(world.sources(), place);
    // Signing out and leaving Bower let the lease go as on every source.
    return { sources: { ...fenced, session: leavingLetsGo(fenced.session, place) }, world };
  }
  if (kind === 'real') {
    const worker = new WorkerHttp(apiBase());
    // The real Worker answers POST /session and fences its own writes (TL-P3-14): this tab holds a place,
    // and its Worker calls carry the place and epoch.
    return { sources: makeLiveSources({ worker, driveLinks: true, drive: new DriveHttp({ token: (fresh) => worker.driveToken(fresh) }), place: { world: 'real' } }) };
  }
  const [{ pretendDrive, pretendRuns }, { FakeWorker }, { FakeLease, leaseKey }, { ALEX }] = await Promise.all([import('./fake/pretend'), import('./fake/fake-worker'), import('./fake/fake-lease'), import('./demo/fixture')]);
  const { drive, rootId, fresh } = await pretendDrive(scenario);
  drive.latency = scenario === 'slow' ? 1500 : scale === 'instant' ? 0 : 40;
  drive.offline = scenario === 'offline';
  // The pretend Worker's run service owns runs on the B path, across reloads, beside the pretend Drive.
  const runs = pretendRuns(scenario, drive, fresh, scale);
  // The pretend Worker's session lease, shared by this browser's tabs as devices share the real Worker's.
  const world = `fake:${scenario}`;
  const lease = new FakeLease({ key: leaseKey(world, await uploadAccount(ALEX.email)) });
  const worker = new FakeWorker({ drive, scenario, rootId, fresh, offline: scenario === 'offline', runs, lease });
  return { sources: makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true, uploadQueue: true, place: { world } }) };
}
