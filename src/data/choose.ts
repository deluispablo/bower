/**
 * Where the app's data comes from, picked once at start:
 * - `demo`: Alex's folder in memory (`DemoWorld`), the UI's reference;
 * - `fake`: the real logic (Drive folder, journal, runs) over a fake Drive
 *   and a fake Worker in the browser, seeded with the same folder;
 * - `real`: Google Drive and Bower's Worker at `VITE_API_URL`.
 * `?source=` picks one for the tab; with `VITE_API_URL` set and no query,
 * the app is real.
 */
import { FakeDrive } from './drive/fake-drive';
import { DriveHttp } from './drive/drive-http';
import { DemoWorld } from './demo/world';
import type { Scenario, TimeScale } from './demo/scenario';
import { FakeWorker } from './fake/fake-worker';
import { seedFakeDrive } from './fake/seed';
import { makeLiveSources } from './live';
import type { Sources } from './sources';
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
    // Storage may be blocked; the address decides.
  }
  return api ? 'real' : 'demo';
}

/** Switches the tab to another source and starts again. */
export function chooseSource(kind: SourceKind): void {
  try {
    sessionStorage.setItem(KEY, kind);
  } catch {
    // Without storage the address carries it.
  }
  const url = new URL(location.href);
  url.searchParams.set('source', kind);
  location.assign(url.toString());
}

export async function buildSources(kind: SourceKind, scenario: Scenario, scale: TimeScale): Promise<{ sources: Sources; world?: DemoWorld }> {
  if (kind === 'demo') {
    const world = new DemoWorld({ scenario, scale });
    return { sources: world.sources(), world };
  }
  if (kind === 'real') {
    const worker = new WorkerHttp(import.meta.env.VITE_API_URL as string);
    return { sources: makeLiveSources({ worker, drive: new DriveHttp({ token: (fresh) => worker.driveToken(fresh) }) }) };
  }
  const drive = new FakeDrive();
  const rootId = await seedFakeDrive(drive, scenario, Date.now());
  drive.latency = scenario === 'slow' ? 1500 : scale === 'instant' ? 0 : 40;
  drive.offline = scenario === 'offline';
  const worker = new FakeWorker({ drive, scenario, scale, rootId, offline: scenario === 'offline' });
  return { sources: makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles() }) };
}
