/**
 * Where the app's data comes from, picked once at start:
 * - `demo`: Alex's folder in memory (`DemoWorld`), the UI's reference;
 * - `fake`: the real logic (Drive folder, journal, runs) over a fake Drive
 *   and a fake Worker in the browser, seeded with the same folder;
 * - `real`: Google Drive and Bower's Worker at `VITE_API_URL`.
 * `?source=` picks one for the tab; with `VITE_API_URL` set and no query,
 * the app is real.
 */
import { DriveHttp } from './drive/drive-http';
import type { DemoWorld } from './demo/world';
import type { Scenario, TimeScale } from './demo/scenario';
import { makeLiveSources, uploadAccount } from './live';
import { fenceDoors, type PlaceGuard } from './session';
import type { Session, Sources } from './sources';
import { WorkerHttp } from './worker/worker-http';

export type SourceKind = 'demo' | 'fake' | 'real';
const KEY = 'bower:demo:source';
const isKind = (v: string | null): v is SourceKind => v === 'demo' || v === 'fake' || v === 'real';

export function readSource(): SourceKind {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  try {
    const q = new URLSearchParams(location.search).get('source');
    if (q !== null) {
      const kind: SourceKind = isKind(q) && (q !== 'real' || api) ? q : 'demo';
      sessionStorage.setItem(KEY, kind);
      return kind;
    }
    const kept = sessionStorage.getItem(KEY);
    if (isKind(kept) && (kept !== 'real' || api)) return kept;
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

/**
 * The demo's session door, letting the lease go when the person leaves, as the live sources do: signing
 * out or deleting the account lets the next place (or person) start without asking.
 */
function leavingLetsGo(door: Session, place: PlaceGuard): Session {
  return {
    current: () => door.current(),
    signIn: () => door.signIn(),
    folderState: () => door.folderState(),
    createFolder: (onStep) => door.createFolder(onStep),
    subscribe: (cb) => door.subscribe(cb),
    async signOut(): Promise<void> {
      // Only an active place has a lease to let go; a blocked one stays blocked until signing out is done.
      const was = place.state();
      if (was === 'active') await place.leave().catch((e: unknown) => console.error(e));
      try {
        await door.signOut();
      } catch (e) {
        // Still signed in here: an active place takes its lease back.
        if (was === 'active') void place.start().catch((err: unknown) => console.error(err));
        throw e;
      }
      place.reset();
    },
    async deleteAccount(): Promise<void> {
      await door.deleteAccount();
      await place.leave().catch((e: unknown) => console.error(e));
    },
  };
}

export async function buildSources(kind: SourceKind, scenario: Scenario, scale: TimeScale): Promise<{ sources: Sources; world?: DemoWorld }> {
  // The demo and the pretend Drive load only when asked for: the real app never downloads them.
  // One active place per person (TL-P2-13) on demo and fake (real waits for P3, below): demo and each fake
  // scenario are separate worlds that never block each other, and the person is a hash of their email.
  if (kind === 'demo') {
    const [{ DemoWorld }, { ALEX }, { localPlace }] = await Promise.all([import('./demo/world'), import('./demo/fixture'), import('./fake/fake-lease')]);
    const world = new DemoWorld({ scenario, scale });
    // The demo has no Worker: its lease lives in this browser, as the pretend Worker's does.
    const place = localPlace({ world: 'demo', person: await uploadAccount(ALEX.email) });
    const fenced = fenceDoors(world.sources(), place);
    return { sources: { ...fenced, session: leavingLetsGo(fenced.session, place) }, world };
  }
  if (kind === 'real') {
    const worker = new WorkerHttp(import.meta.env.VITE_API_URL as string);
    // P3 obligation (TL-P2-14/24/25): no place here yet, because today's real Worker has no POST /session
    // and asking it would stop the app at start. Once the P3 Worker answers it, wire `place: { world: 'real' }`.
    return { sources: makeLiveSources({ worker, driveLinks: true, drive: new DriveHttp({ token: (fresh) => worker.driveToken(fresh) }) }) };
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
  const worker = new FakeWorker({ drive, scenario, scale, rootId, fresh, offline: scenario === 'offline', runs, lease });
  return { sources: makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true, uploadQueue: true, place: { world } }) };
}
