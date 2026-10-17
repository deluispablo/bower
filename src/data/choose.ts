/**
 * Where the app's data comes from, picked once at start:
 * - `demo`: Alex's folder in memory (`DemoWorld`), the UI's reference;
 * - `fake`: the real logic (Drive folder, journal, runs) over a fake Drive
 *   and a fake Worker in the browser, seeded with the same folder;
 * - `real`: Google Drive and Bower's Worker at `apiBase()`.
 * `?source=` picks one for the tab; with no query and nothing kept for the tab,
 * the app is real when served from a deployed origin (any host but localhost,
 * 127.0.0.1, [::1] and *.localhost) or when `VITE_API_URL` is set, else the demo.
 */
import { DriveHttp } from './drive/drive-http';
import { driveError, driveFailure } from './drive/drive-api';
import type { DemoWorld } from './demo/world';
import type { Scenario, TimeScale } from './demo/scenario';
import { makeLiveSources, uploadAccount } from './live';
import { BowerError } from './types';
import { PROP } from './vault/layout';
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

const isLocal = (h: string): boolean => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');

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
  return api || !isLocal(location.hostname) ? 'real' : 'demo';
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
    // Pile files go through the persistent upload queue (C02): reserved ids, Drive's resumable protocol, resumed after a reload.
    // The real Worker answers POST /session and fences its own writes (TL-P3-14): this tab holds a place,
    // and its Worker calls carry the place and epoch. Each new pile is declared first, through the same fenced
    // Drive client, since the Worker's admission and the runner read declarations as the fake does (P3-15).
    return { sources: makeLiveSources({ worker, driveLinks: true, declarePiles: true, drive: new DriveHttp({ token: (fresh) => worker.driveToken(fresh) }), place: { world: 'real' } }) };
  }
  const [{ pretendDrive, pretendRuns }, { FakeWorker }, { FakeLease, leaseKey }, { ALEX }] = await Promise.all([import('./fake/pretend'), import('./fake/fake-worker'), import('./fake/fake-lease'), import('./demo/fixture')]);
  const { drive, rootId, fresh, keys } = await pretendDrive(scenario);
  drive.latency = scenario === 'slow' ? 1500 : scale === 'instant' ? 0 : 40;
  drive.offline = scenario === 'offline';
  // The live shape: about 300 ms a call and four at once, as a browser talks to Drive. Home must show the Inbox first.
  if (scenario === 'slow-report') {
    drive.latency = 300;
    drive.concurrency = 4;
    drive.calls = 0;
    (window as unknown as { __driveCalls: () => number }).__driveCalls = () => drive.calls;
  }
  // The write-it situation: the scripted reply updates two Current states, and the page may change a note elsewhere,
  // now or right before Bower's write to it is sent.
  const writeIt = scenario === 'write-it' ? await import('./fake/write-it') : null;
  const atWrite = writeIt && rootId ? writeIt.editAtWrite(drive, rootId) : null;
  // The pretend Worker's run service owns runs on the B path, across reloads, beside the pretend Drive.
  const runs = pretendRuns(scenario, drive, fresh, scale, atWrite ? { beforeDispatch: atWrite.beforeDispatch } : undefined);
  // The pretend Worker's session lease, shared by this browser's tabs as devices share the real Worker's.
  const world = `fake:${scenario}`;
  const lease = new FakeLease({ key: leaseKey(world, await uploadAccount(ALEX.email)) });
  const worker = new FakeWorker({ drive, scenario, rootId, fresh, offline: scenario === 'offline', runs, lease, ...(writeIt ? { states: writeIt.writeItStates(keys) } : {}) });
  if (writeIt && rootId) (window as unknown as { __editElsewhere: (path: string, from: string, to: string) => Promise<void> }).__editElsewhere = writeIt.editElsewhere(drive, rootId);
  if (atWrite) (window as unknown as { __editAtWrite: (path: string, from: string, to: string) => void }).__editAtWrite = atWrite.arm;
  // The notes of changes find no network until the page says Drive now refuses them for good (the test's hook).
  if (scenario === 'journal-refused') {
    let refuses = false;
    let waited = false;
    (window as unknown as { __refuseJournal: () => void }).__refuseJournal = () => { refuses = true; };
    const create = drive.createText.bind(drive);
    drive.createText = async (...a: Parameters<typeof drive.createText>) => {
      if (!/^\d{4}-\d{2}-\d{2}T[\d-]+\.\d{3}Z-[a-z0-9]{6}\.json$/.test(a[1])) return create(...a);
      // Admission now awaits the outbox lock: the hook can run before this first attempt.
      // Keep the scenario's offline-first order; the queued online drain handles the refusal.
      if (!waited) { waited = true; throw driveError('offline'); }
      throw refuses ? driveFailure('unknown', 'permanent') : driveError('offline');
    };
  }
  // c4-undo-withdraw's named triggers (`window.__unreachDrive`, `window.__driveOffline`): from the first on, the notes of changes and the things of a pile
  // find no network when sent, and the reads by the ids reserved for them find none either; everything else answers.
  if (scenario === 'withdraw-unreached') {
    let unreached = false;
    const reserved = new Set<string>();
    (window as unknown as { __unreachDrive: () => void }).__unreachDrive = () => { unreached = true; };
    // c4-undo-compensate's offline Bin Undo: from then on, the pretend Drive finds no network at all.
    (window as unknown as { __driveOffline: () => void }).__driveOffline = () => { drive.offline = true; };
    const line = /^\d{4}-\d{2}-\d{2}T[\d-]+\.\d{3}Z-[a-z0-9]{6}\.json$/;
    const create = drive.createText.bind(drive);
    drive.createText = async (...a: Parameters<typeof drive.createText>) => {
      if (!unreached || !(line.test(a[1]) || a[3]?.[PROP.asAdded] !== undefined)) return create(...a);
      if (a[4]) reserved.add(a[4]);
      throw driveError('offline');
    };
    const get = drive.get.bind(drive);
    drive.get = async (...a: Parameters<typeof drive.get>) => {
      if (unreached && reserved.has(a[0])) throw driveError('offline');
      return get(...a);
    };
  }
  const sources = makeLiveSources({ worker, drive, runningPiles: () => worker.runningPiles(), pollMs: 300, declarePiles: true, place: { world } });
  // The full read of the piles fails after the listing answered, until the page heals it (the test's hook).
  if (scenario === 'inbox-read-fails') {
    let heals = false;
    (window as unknown as { __healInboxRead: () => void }).__healInboxRead = () => { heals = true; };
    const vault = Object.create(sources.vault) as typeof sources.vault;
    vault.piles = async () => {
      if (heals) return sources.vault.piles();
      console.error(new Error('inbox read failed (made up for this situation)'));
      throw new BowerError('offline', 'Bower could not read your inbox. Try again.');
    };
    return { sources: { ...sources, vault } };
  }
  return { sources };
}
