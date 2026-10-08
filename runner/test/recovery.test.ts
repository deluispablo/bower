/**
 * Recovery without the browser (TL-P3-23): a redispatched attempt finishes the run as if it had never been
 * interrupted, over the adapter's contract test (Drive v3 faked over fetch, `drive-v3.ts`), with the real scripted
 * provider and the real Drive effects. No app call: the runner and the faked Worker alone complete the run.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Checkpoint, Outcome } from '../../src/data/contracts/run-checkpoint';
import type { OperationV2 } from '../../src/data/contracts/run-manifest';
import type { FakeDrive, FencedCall } from '../../src/data/drive/fake-drive';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { RunRecords } from '../../src/data/spine/records';
import { SYSTEM } from '../../src/data/vault/layout';
import { driveEffects } from '../src/effects';
import { runTidy, type TidyEnd } from '../src/main';
import { providerFor } from '../src/provider';
import type { Effects } from '../src/spine/run';
import { isStaleAttempt } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
/** The thing someone renames before Bower moves it: its move is refused, and what waits on it stays. */
const RENAMED = 'Dentist reminder.pdf';

afterEach(() => vi.restoreAllMocks());

/** Alex's folder on a pretend Drive v3, with one of Alex's changes in the journal, admitted by the Worker's rules. */
async function seeded(): Promise<{ wire: DriveV3; root: string }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  const changes = (await drive.createFolder(sys, 'changes')).id;
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  await drive.createText(changes, 'change-1.json', `${JSON.stringify({ v: 1, id: 'change-1', device: 'device-1', at: AT - 60_000, kind: 'create', what: 'Made Ideas.md', path: 'Projects/Ideas.md' })}\n`);
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
  await drive.createText(inbox, RENAMED, '%PDF dentist', { pile: 'p-dentist' });
  const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
  await drive.createText(pile, PILE_NOTE, 'The kitchen at the Wrenfield Road viewing.\n');
  await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  return { wire, root };
}

/** What a runner process does to the folder and the Worker; `sends` counts each operation's sends across attempts. */
interface Process {
  /** Every Drive request and Worker call after this fails, as for a runner that was killed. */
  killed: boolean;
}

interface World {
  wire: DriveV3;
  root: string;
  /** Sends per operation, across every attempt. */
  sends: Map<string, number>;
}

async function world(): Promise<World> {
  return { ...(await seeded()), sends: new Map() };
}

interface Attempt {
  /** Sees each fenced write before it is sent (return true to lose its reply after it lands). */
  loseReply?: (call: FencedCall) => boolean;
  /** Sees each fenced write once it landed; set `process.killed` to kill the runner right after it. */
  applied?: (call: FencedCall, process: Process) => void;
  /** Awaited right after an operation's intent is committed, before it is sent. */
  afterIntent?: (op: OperationV2) => Promise<void>;
  /** Drive reads that fail as with no network. */
  failRead?: (url: URL) => boolean;
}

/**
 * One runner process for `attempt`, from its entry, as the Worker's redispatch starts it: the scripted provider and
 * the real Drive effects, with someone renaming `RENAMED` right before Bower would move it.
 */
function tidy(w: World, attempt: number, opts: Attempt = {}): Promise<TidyEnd> {
  const { wire } = w;
  wire.attempt = attempt;
  const process: Process = { killed: false };
  let ids = 0;
  const fetchFn: typeof fetch = async (input, init = {}) => {
    if (process.killed) throw new TypeError('The runner was killed.');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== API && (init.method ?? 'GET').toUpperCase() === 'GET' && opts.failRead?.(url)) throw new TypeError('fetch failed');
    return wire.fetch(input, init);
  };
  const effects = (drive: Parameters<typeof driveEffects>[0]): Effects => {
    const real = driveEffects(drive);
    return {
      observe: real.observe,
      readBack: real.readBack,
      async apply(op, head, fenced, manifest, sending) {
        const e = op.effect;
        if (e.kind === 'move' && e.before.name === RENAMED) {
          const now = await wire.drive.get(e.before.fileId);
          if (now.name === RENAMED) await wire.drive.update(e.before.fileId, { name: 'Dentist reminder (old).pdf' });
        }
        return real.apply(op, head, fenced, manifest, async () => {
          await sending();
          await opts.afterIntent?.(op);
          // Counted only when the send can go out: a killed runner sends nothing more.
          if (!process.killed) w.sends.set(op.operationId, (w.sends.get(op.operationId) ?? 0) + 1);
        });
      },
    };
  };
  return runTidy({
    api: API,
    runId: RUN_ID,
    ticket: TICKET,
    attempt,
    fetch: fetchFn,
    provider: (drive, rootId) => providerFor('scripted', drive, { rootId, runId: RUN_ID, allowWeb: false }),
    effects,
    clock: () => AT,
    newId: () => `attempt${attempt}-${++ids}`,
    onDrive: (d) => {
      d.fault = {
        before: (call) => (opts.loseReply?.(call) ? 'lose-reply' : 'pass'),
        applied: (call) => opts.applied?.(call, process),
      };
    },
  });
}

const isCheckpoint = (call: FencedCall): boolean => call.op === 'create-text' && call.name.startsWith('checkpoint-');

async function chainOf(wire: DriveV3, root: string): Promise<Checkpoint[]> {
  const found = await new RunRecords(wire.drive, root).found(RUN_ID);
  return found.kind === 'run' ? found.chain : [];
}

interface Entry {
  path: string;
  folder: boolean;
  trashed: boolean;
  sha256: string | null;
  appProperties: Record<string, string>;
}

/**
 * The folder as Drive stores it: each file's path (names and parents), whether it is in the Bin, and its content's
 * hash. The run's own checkpoints are left out: their names and bytes say which attempt wrote them.
 */
async function stateOf(drive: FakeDrive, root: string): Promise<Entry[]> {
  const data = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string; name: string; parents: string[]; folder: boolean; appProperties?: Record<string, string> }; trashed: boolean; content: { text: string } | { b64: string } | null }> };
  const byId = new Map(data.files.map((f) => [f.meta.id, f]));
  const pathOf = (id: string): string | null => {
    const parts: string[] = [];
    for (let f = byId.get(id); f; f = byId.get(f.meta.parents[0] ?? '')) {
      parts.unshift(f.meta.name);
      if (f.meta.parents[0] === root) return parts.join('/');
    }
    return null;
  };
  const out: Entry[] = [];
  for (const f of data.files) {
    const path = pathOf(f.meta.id);
    if (path === null || /\/checkpoint-\d+-[0-9a-f]{64}\.json$/.test(path)) continue;
    const c = f.content;
    const sha256 = c === null ? null : createHash('sha256').update('text' in c ? c.text : Buffer.from(c.b64, 'base64')).digest('hex');
    out.push({ path, folder: f.meta.folder, trashed: f.trashed, sha256, appProperties: f.meta.appProperties ?? {} });
  }
  return out.sort((a, b) => (a.path + String(a.trashed)).localeCompare(b.path + String(b.trashed)));
}

/** The run's end as the Worker and the folder hold it: the final phase, the folder, and the report shown. */
async function endOf(w: World): Promise<{ phase: string | undefined; state: Entry[]; view: unknown }> {
  const state = await stateOf(w.wire.drive, w.root);
  const files = await w.wire.drive.listAll(w.root);
  const sys = files.find((f) => f.folder && f.name === SYSTEM.dir && f.parents[0] === w.root);
  const view = files.find((f) => f.name === 'last-run.json' && f.parents[0] === sys?.id);
  return { phase: w.wire.statuses.at(-1)?.phase, state, view: view ? JSON.parse(await w.wire.drive.readText(view.id)) : null };
}

/** The run done in one go, the way every interrupted run must end. */
async function uninterrupted(): Promise<{ end: Awaited<ReturnType<typeof endOf>>; chain: Checkpoint[]; sends: Map<string, number> }> {
  const w = await world();
  expect((await tidy(w, 1)).phase).toBe('done');
  return { end: await endOf(w), chain: await chainOf(w.wire, w.root), sends: w.sends };
}

/** Which checkpoint it is, by what it holds for the person: first, an outcome state, report pending, or done. */
function kindOf(chain: readonly Checkpoint[], at: number): string {
  const c = chain[at];
  if (!c) return 'none';
  if (at === 0) return 'first';
  if (c.phase === 'done') return 'done';
  const before = chain[at - 1];
  if (c.report.state === 'pending' && before?.report.state !== 'pending') return 'report pending';
  const changed = c.outcomes.find((o, i) => JSON.stringify(o) !== JSON.stringify(before?.outcomes[i]));
  return changed ? changed.state : c.phase;
}

/** What reading an operation back reads: the file it changes, or the folder it makes something in. */
function readIds(op: OperationV2, head: Checkpoint): string[] {
  const e = op.effect;
  const out: string[] = [];
  if ('before' in e) out.push(e.before.fileId);
  if ('parent' in e) {
    if ('fileId' in e.parent) out.push(e.parent.fileId);
    else {
      const by = e.parent.createdBy;
      const made = head.outcomes.find((o) => o.operationId === by);
      if (made?.state === 'applied') out.push(made.evidence.file.fileId);
    }
  }
  return out;
}

/** A folder the plan makes (it carries its create key), not one of the run's own record folders. */
const madeFolder = (call: FencedCall): boolean => call.op === 'create-folder' && call.appProperties?.bowerItem !== undefined;

describe('recovery without the browser', () => {
  it('attempt 2 reconciles an in-flight operation by read-back and never redoes it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { end: expected } = await uninterrupted();

    // Landed: attempt 1's first folder is made, its answer is lost and Drive cannot be read back, so the runner stops
    // (a lost answer alone is read back at once, TL-P3-28). Attempt 2 reads it back as made.
    const landed = await world();
    let lost = false;
    // It stops in saving: its chain holds an effect that may have been sent.
    expect((await tidy(landed, 1, { loseReply: (call) => !lost && madeFolder(call) && (lost = true), failRead: () => lost })).phase).toBe('saving');
    const held = (await chainOf(landed.wire, landed.root)).at(-1);
    const inFlight = held?.outcomes.find((o) => o.state === 'possible-effect');
    expect(inFlight).toBeDefined();
    expect((await tidy(landed, 2)).phase).toBe('done');
    expect(landed.sends.get(inFlight?.operationId ?? '')).toBe(1);
    expect(await endOf(landed)).toEqual(expected);

    // Not landed: attempt 1 is killed right after it committed a folder's intent, before it sent it. Attempt 2 reads
    // back that nothing is there, and sends it once, under its own fence.
    const notLanded = await world();
    const caught: { intent?: Outcome | undefined } = {};
    const intentId = (): string => caught.intent?.operationId ?? '';
    const killAtIntent = (call: FencedCall, process: Process): void => {
      if (!isCheckpoint(call) || call.op !== 'create-text' || caught.intent) return;
      const record = JSON.parse(call.text) as Checkpoint;
      caught.intent = record.outcomes.find((o) => o.state === 'possible-effect');
      if (caught.intent) process.killed = true;
    };
    await expect(tidy(notLanded, 1, { applied: killAtIntent })).rejects.toBeInstanceOf(Error);
    expect(caught.intent).toBeDefined();
    expect(notLanded.sends.get(intentId()) ?? 0).toBe(0);
    expect((await tidy(notLanded, 2)).phase).toBe('done');
    expect(notLanded.sends.get(intentId())).toBe(1);
    expect(await endOf(notLanded)).toEqual(expected);

    // Unreadable: the same, and attempt 2 cannot read the folder the thing went to. The run stops without a resend.
    const unreadable = await world();
    caught.intent = undefined;
    await expect(tidy(unreadable, 1, { applied: killAtIntent })).rejects.toBeInstanceOf(Error);
    const stuck = (await chainOf(unreadable.wire, unreadable.root)).at(-1);
    const found = await new RunRecords(unreadable.wire.drive, unreadable.root).found(RUN_ID);
    const op = found.kind === 'run' ? found.manifest.operations.find((o) => o.operationId === intentId()) : undefined;
    const ids = op && stuck ? readIds(op, stuck) : [];
    expect(ids.length).toBeGreaterThan(0);
    const writesBefore = unreadable.wire.requests.filter((r) => r.method !== 'GET').length;
    const second = await tidy(unreadable, 2, { failRead: (url) => ids.some((id) => url.pathname.endsWith(`/files/${id}`) || (url.searchParams.get('q') ?? '').includes(`'${id}' in parents`)) });
    expect(second.phase).toBe('saving');
    expect(unreadable.sends.get(intentId()) ?? 0).toBe(0);
    expect((await chainOf(unreadable.wire, unreadable.root)).at(-1)).toEqual(stuck);
    expect(unreadable.wire.requests.filter((r) => r.method !== 'GET').length).toBe(writesBefore);
  });

  it('the old attempt changes nothing after a takeover', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { end: expected } = await uninterrupted();
    const w = await world();

    // Attempt 1 commits a folder's intent, then stalls before sending it; the Worker gives up on it and redispatches.
    let wake: () => void = () => {};
    const woken = new Promise<void>((r) => {
      wake = r;
    });
    const stall = { at: (): void => {} };
    const atStall = new Promise<void>((r) => {
      stall.at = r;
    });
    let paused = false;
    const first = tidy(w, 1, {
      afterIntent: async (op) => {
        if (paused || op.effect.kind !== 'create-folder') return;
        paused = true;
        stall.at();
        await woken;
      },
    }).catch((e: unknown) => e);
    await atStall;

    // Attempt 2 takes over and finishes the run.
    expect((await tidy(w, 2)).phase).toBe('done');
    const finished = await endOf(w);
    expect(finished).toEqual(expected);
    const statuses = [...w.wire.statuses];

    // Attempt 1 wakes: its next fenced write is refused, and it reports nothing.
    wake();
    expect(isStaleAttempt(await first)).toBe(true);
    expect(await endOf(w)).toEqual(finished);
    expect(w.wire.statuses).toEqual(statuses);
  });

  it('a run killed after any checkpoint ends like an uninterrupted run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { end: expected, chain, sends } = await uninterrupted();
    expect(expected.phase).toBe('done');
    const kinds = chain.map((_, at) => kindOf(chain, at));
    // Every kind of checkpoint the chain can hold.
    for (const kind of ['first', 'possible-effect', 'applied', 'before-effect-refused', 'rejected', 'report pending', 'done']) expect(kinds).toContain(kind);

    for (let at = 0; at < chain.length; at++) {
      const w = await world();
      let written = 0;
      const first = await tidy(w, 1, {
        applied: (call, process) => {
          if (isCheckpoint(call) && written++ === at) process.killed = true;
        },
      }).catch((e: unknown) => e);
      // Killed, it never tells the Worker the run is done.
      expect(first, `attempt 1 killed after checkpoint ${at} (${kinds[at] ?? ''})`).not.toMatchObject({ phase: 'done' });
      expect(w.wire.statuses.map((s) => s.phase)).not.toContain('done');
      expect((await chainOf(w.wire, w.root)).length, `checkpoint ${at}`).toBe(at + 1);

      const second = await tidy(w, 2);
      expect(second.phase, `resumed after checkpoint ${at} (${kinds[at] ?? ''})`).toBe('done');
      expect(await endOf(w), `resumed after checkpoint ${at} (${kinds[at] ?? ''})`).toEqual(expected);
      // No operation sent twice, and each sent as often as in the uninterrupted run.
      expect(new Map([...w.sends].filter(([, n]) => n > 0)), `sends after checkpoint ${at}`).toEqual(sends);
    }
  }, 60_000);
  it('a kill after every step still recovers with merged checkpoints', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w0 = await world();
    let steps = 0;
    expect((await tidy(w0, 1, { applied: () => void steps++ })).phase).toBe('done');
    const expected = await endOf(w0);
    // Each checkpoint is confirmed by the create's own answer (its stored checksum), never read back after it.
    const checkpoints = new Set((await w0.wire.drive.listAll(w0.root)).filter((f) => /^checkpoint-\d+-/.test(f.name)).map((f) => f.id));
    const readBack = w0.wire.requests.filter((r) => r.url.searchParams.get('alt') === 'media' && checkpoints.has(decodeURIComponent(r.url.pathname.split('/').at(-1) ?? '')));
    expect(readBack).toEqual([]);
    expect(steps).toBeGreaterThan(checkpoints.size);

    // Killed right after any write landed (a checkpoint, a record or an operation's effect), then taken over.
    for (let at = 0; at < steps; at++) {
      const w = await world();
      let written = 0;
      await tidy(w, 1, {
        applied: (_call, process) => {
          if (written++ === at) process.killed = true;
        },
      }).catch((e: unknown) => e);
      expect(w.wire.statuses.map((s) => s.phase), `step ${at}`).not.toContain('done');
      const second = await tidy(w, 2);
      expect(second.phase, `resumed after step ${at}`).toBe('done');
      expect(await endOf(w), `resumed after step ${at}`).toEqual(expected);
      // No operation sent twice, and each sent as often as in the uninterrupted run.
      expect(new Map([...w.sends].filter(([, n]) => n > 0)), `sends after step ${at}`).toEqual(w0.sends);
    }
  }, 120_000);
});
