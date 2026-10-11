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
import { MOVED_AWAY } from '../../src/data/spine/report';
import { SYSTEM } from '../../src/data/vault/layout';
import { runTidy, type TidyEnd } from '../src/main';
import { providerFor } from '../src/provider';
import { driveEffects, type Effects } from '../../src/data/spine/engine';
import { STAMP, stampOf } from '../../src/data/spine/write-once';
import { RunnerToken, isStaleAttempt } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
/** The thing someone renames before Bower moves it: its move is refused, and what waits on it stays. */
const RENAMED = 'Dentist reminder.pdf';
/** The existing signed-out sentence, as the runner says it when the person is gone. */
const GONE_SENTENCE = 'This tidy-up is no longer allowed to change your folder.';
/** A thing possibly moved, then emptied from the Bin before Bower read it back (TL-P4-14 addendum 7). */
const UNCONFIRMED_GONE = "Bower couldn't confirm this; the file is gone.";

afterEach(() => vi.restoreAllMocks());

/** Alex's folder on a pretend Drive v3, with one of Alex's changes in the journal, admitted by the Worker's rules. */
async function seeded(payslip: Record<string, string> = {}): Promise<{ wire: DriveV3; root: string }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  const changes = (await drive.createFolder(sys, 'changes')).id;
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  await drive.createText(changes, 'change-1.json', `${JSON.stringify({ v: 1, id: 'change-1', device: 'device-1', at: AT - 60_000, kind: 'create', what: 'Made Ideas.md', path: 'Projects/Ideas.md' })}\n`);
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip', ...payslip });
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

async function world(payslip: Record<string, string> = {}): Promise<World> {
  return { ...(await seeded(payslip)), sends: new Map() };
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
  /** Asks of the Worker's attempt route that fail as with no network. */
  failAttempt?: () => boolean;
  /** Told right after someone renamed `RENAMED`. */
  onRename?: () => void;
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
  const stamps = new Map<string, string>();
  const fetchFn: typeof fetch = async (input, init = {}) => {
    if (process.killed) throw new TypeError('The runner was killed.');
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== API && (init.method ?? 'GET').toUpperCase() === 'GET' && opts.failRead?.(url)) throw new TypeError('fetch failed');
    if (url.origin === API && (init.method ?? 'GET').toUpperCase() === 'GET' && url.pathname.endsWith('/attempt') && opts.failAttempt?.()) throw new TypeError('fetch failed');
    return wire.fetch(input, init);
  };
  const effects = (drive: Parameters<typeof driveEffects>[0]): Effects => {
    const real = driveEffects(drive);
    return {
      readBack: real.readBack,
      async apply(op, head, fenced, manifest, sending) {
        const e = op.effect;
        if (e.kind === 'move' && e.before.name === RENAMED) {
          const now = await wire.drive.get(e.before.fileId);
          if (now.name === RENAMED) {
            await wire.drive.update(e.before.fileId, { name: 'Dentist reminder (old).pdf' });
            opts.onRename?.();
          }
        }
        stamps.set(stampOf(RUN_ID, op.operationId), op.operationId);
        return real.apply(op, head, fenced, manifest, async () => {
          const reserved = await sending();
          await opts.afterIntent?.(op);
          return reserved;
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
    pacing: { baseMs: 0 },
    provider: (drive, rootId) => providerFor('scripted', drive, { rootId, runId: RUN_ID, allowWeb: false }),
    effects,
    clock: () => AT,
    newId: () => `attempt${attempt}-${++ids}`,
    onDrive: (d) => {
      d.fault = {
        before: (call) => {
          // Counted as sent when the request goes out (operations run together, so a kill can come while one waits
          // its turn): a killed runner sends nothing more.
          const stamp = (call.op === 'update' ? call.patch.appProperties : 'appProperties' in call ? call.appProperties : undefined)?.[STAMP];
          const id = typeof stamp === 'string' ? stamps.get(stamp) : undefined;
          if (id !== undefined && !process.killed) w.sends.set(id, (w.sends.get(id) ?? 0) + 1);
          return opts.loseReply?.(call) ? 'lose-reply' : 'pass';
        },
        applied: (call) => opts.applied?.(call, process),
      };
    },
  });
}

/** The folder a move goes into: its own, or the one a create of this run made (found by its create key). */
async function destinationFolder(w: World, op: OperationV2): Promise<string | undefined> {
  const e = op.effect;
  if (e.kind !== 'move') return undefined;
  if ('fileId' in e.parent) return e.parent.fileId;
  const by = 'createdBy' in e.parent ? e.parent.createdBy : '';
  const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
  const made = found.kind === 'run' ? found.manifest.operations.find((o) => o.operationId === by) : undefined;
  const key = made?.effect.kind === 'create-folder' ? made.effect.createKey : '';
  return (await w.wire.drive.listAll(w.root)).find((f) => f.folder && f.appProperties?.bowerItem === key)?.id;
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
    // A run folder's write-once key names the folder version its ended stamp was sent on, which differs by attempt.
    const { bowerOp: _key, ...ended } = f.meta.appProperties ?? {};
    const appProperties = f.meta.folder && /^\.bower\/runs\/[^/]+$/.test(path) ? ended : (f.meta.appProperties ?? {});
    out.push({ path, folder: f.meta.folder, trashed: f.trashed, sha256, appProperties });
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
  if ('before' in e && e.before) out.push(e.before.fileId);
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

  it('the runner drops its token and stops before the next write when the person is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const writes = (): number => w.wire.requests.filter((r) => r.url.origin !== API && r.method !== 'GET').length;
    // Delete me, or Google access revoked, right after the run made its first folder: the Worker answers 410 gone.
    let at = -1;
    const end = await tidy(w, 1, {
      applied: (call) => {
        if (at >= 0 || !madeFolder(call)) return;
        w.wire.tokenRefusal = { status: 410, error: 'gone' };
        at = writes();
      },
    });
    expect(at).toBeGreaterThan(0);
    // Nothing more is written, and the run ends failed with the signed-out sentence.
    expect(writes()).toBe(at);
    expect(end).toEqual({ phase: 'failed', why: GONE_SENTENCE });
    expect(w.wire.statuses.at(-1)).toMatchObject({ phase: 'failed', failure: GONE_SENTENCE });

    // The kept Drive token is dropped: once gone, it is never handed out again without asking the Worker.
    const wire = driveV3();
    const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
    await token.token(false);
    wire.tokenRefusal = { status: 410, error: 'gone' };
    await expect(token.attempt()).rejects.toMatchObject({ code: 'auth', message: GONE_SENTENCE });
    await expect(token.token(false)).rejects.toMatchObject({ code: 'auth', message: GONE_SENTENCE });
    expect(wire.tokenCalls).toBe(2);
  });

  it('a run whose Drive token Google revoked ends failed once the token route answers gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const writes = (): number => w.wire.requests.filter((r) => r.url.origin !== API && r.method !== 'GET').length;
    // Google access is revoked right after the run made its first folder, with no browser open: Drive answers 401 to
    // the kept token, and the token route that finds the refresh token refused answers 410 gone.
    let at = -1;
    const end = await tidy(w, 1, {
      applied: (call) => {
        if (at >= 0 || !madeFolder(call)) return;
        w.wire.revoked = true;
        at = writes();
      },
    });
    expect(at).toBeGreaterThan(0);
    expect(writes()).toBe(at);
    expect(end).toEqual({ phase: 'failed', why: GONE_SENTENCE });
    expect(w.wire.statuses.at(-1)).toMatchObject({ phase: 'failed', failure: GONE_SENTENCE });
  });

  it('a run killed after any checkpoint ends like an uninterrupted run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { end: expected, chain, sends } = await uninterrupted();
    expect(expected.phase).toBe('done');
    const kinds = chain.map((_, at) => kindOf(chain, at));
    // Every kind of checkpoint the chain can hold.
    // A batch: the first, its opening (operations named as possibly sent), its closing (with the report pending), done.
    expect(kinds).toEqual(['first', 'possible-effect', 'report pending', 'done']);

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

  it('a kill at every step including mid-batch ends equal to an uninterrupted run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w0 = await world();
    let steps = 0;
    expect((await tidy(w0, 1, { applied: () => void steps++ })).phase).toBe('done');
    const expected = await endOf(w0);

    // Killed right after every write that landed: a checkpoint, a record, or an effect inside an open batch.
    let midBatch = 0;
    for (let at = 0; at < steps; at++) {
      const w = await world();
      let written = 0;
      await tidy(w, 1, {
        applied: (_call, process) => {
          if (written++ === at) process.killed = true;
        },
      }).catch((e: unknown) => e);
      // Mid-batch: the head names more than one operation not yet closed.
      const head = (await chainOf(w.wire, w.root)).at(-1);
      if ((head?.outcomes.filter((o) => o.state === 'possible-effect').length ?? 0) > 1) midBatch++;
      expect(w.wire.statuses.map((s) => s.phase), `step ${at}`).not.toContain('done');
      const second = await tidy(w, 2);
      expect(second.phase, `resumed after step ${at}`).toBe('done');
      expect(await endOf(w), `resumed after step ${at}`).toEqual(expected);
      expect(new Map([...w.sends].filter(([, n]) => n > 0)), `sends after step ${at}`).toEqual(w0.sends);
    }
    // Every effect is written between the batch's opening and its closing: several steps fall inside the batch.
    expect(midBatch).toBeGreaterThan(2);
  }, 120_000);

  it('a rename inside a batch then a kill is kept and reported', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { end: expected } = await uninterrupted();
    const w = await world();
    const dentist = (await w.wire.drive.listAll(w.root)).find((f) => f.name === RENAMED);
    // Killed at the first write after the person renamed the thing (inside the batch, before its move is checked).
    let renamed = false;
    await tidy(w, 1, {
      onRename: () => {
        renamed = true;
      },
      applied: (_call, process) => {
        if (renamed) process.killed = true;
      },
    }).catch((e: unknown) => e);
    expect(renamed).toBe(true);
    const head = (await chainOf(w.wire, w.root)).at(-1);
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const move = found.kind === 'run' ? found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === dentist?.id) : undefined;
    // Its move was named by the open batch when the run was killed.
    expect(head?.outcomes.find((o) => o.operationId === move?.operationId)?.state).toBe('possible-effect');

    expect((await tidy(w, 2)).phase).toBe('done');
    // The person's rename is kept, the move never sent, and the report sets it aside as moved away.
    expect(await endOf(w)).toEqual(expected);
    expect(w.sends.get(move?.operationId ?? '') ?? 0).toBe(0);
    expect((await w.wire.drive.get(dentist?.id ?? '')).name).toBe('Dentist reminder (old).pdf');
    expect(JSON.stringify(expected.view)).toContain(MOVED_AWAY);
  });

  it('an undo of a landed effect then a kill is kept and reported', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const files = await w.wire.drive.listAll(w.root);
    const payslip = files.find((f) => f.name === 'Payslip_Aug.pdf');
    const inbox = files.find((f) => f.folder && f.name === 'Inbox');
    // Killed right after Bower filed the payslip.
    await tidy(w, 1, {
      applied: (call, process) => {
        if (call.op === 'update' && call.id === payslip?.id) process.killed = true;
      },
    }).catch((e: unknown) => e);
    const filed = await w.wire.drive.get(payslip?.id ?? '');
    expect(filed.parents).not.toEqual([inbox?.id]);
    // The person puts it back in the inbox before the run is taken over.
    await w.wire.drive.update(filed.id, { addParent: inbox?.id ?? '', removeParent: filed.parents[0] ?? '' });

    expect((await tidy(w, 2)).phase).toBe('done');
    const chain = await chainOf(w.wire, w.root);
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const move = found.kind === 'run' ? found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === payslip?.id) : undefined;
    // Sent once and never again: the person's undo is kept.
    expect(w.sends.get(move?.operationId ?? '')).toBe(1);
    expect((await w.wire.drive.get(payslip?.id ?? '')).parents).toEqual([inbox?.id]);
    // Reported as it is: applied, with the evidence of where the person put it.
    const outcome = chain.at(-1)?.outcomes.find((o) => o.operationId === move?.operationId);
    expect(outcome?.state).toBe('applied');
    expect(outcome?.state === 'applied' ? outcome.evidence.file.parents : null).toEqual([inbox?.id]);
  });

  it('a person change between the check and the send is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // After an operation's check and before its send (the pool runs four at once), the person changes what it touches:
    // a rename for a move, a move elsewhere for a Bin (an edit's case is in drive.test.ts). The change is kept; nothing is sent over it.
    const changed = new Set<string>();
    const w = await world();
    const drive = w.wire.drive;
    const outside = new Map<string, string>();
    await tidy(w, 1, {
      afterIntent: async (op) => {
        const e = op.effect;
        if ((e.kind !== 'move' && e.kind !== 'bin') || changed.has(e.kind)) return;
        changed.add(e.kind);
        const id = e.before.fileId;
        if (e.kind === 'move') {
          await drive.update(id, { name: 'Person renamed.pdf' });
          outside.set(e.kind, id);
        } else {
          const now = await drive.get(id);
          const other = (await drive.listAll(w.root)).find((f) => f.folder && !now.parents.includes(f.id));
          await drive.update(id, { addParent: other?.id ?? '', removeParent: now.parents[0] ?? '' });
          outside.set(e.kind, id);
        }
      },
    }).catch((e: unknown) => e);
    expect([...changed].sort()).toEqual(['bin', 'move']);
    expect((await drive.get(outside.get('move') ?? '')).name).toBe('Person renamed.pdf');
    expect((await drive.evidence(outside.get('bin') ?? ''))?.trashed).toBe(false);
  });

  it('a create into a folder binned since the run read it is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Right before the first create into a folder this run made, the person puts that folder in the Bin.
    let binned: string | null = null;
    const end = await tidy(w, 1, {
      afterIntent: async (op) => {
        const e = op.effect;
        if (binned !== null || (e.kind !== 'create-folder' && e.kind !== 'create-text') || 'fileId' in e.parent) return;
        const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
        const by = found.kind === 'run' ? found.manifest.operations.find((o) => o.operationId === ('createdBy' in e.parent ? e.parent.createdBy : '')) : undefined;
        const key = by?.effect.kind === 'create-folder' ? by.effect.createKey : '';
        const folder = (await w.wire.drive.listAll(w.root)).find((f) => f.folder && f.appProperties?.bowerItem === key);
        if (!folder) return;
        binned = folder.id;
        await w.wire.drive.trash(folder.id);
      },
    });
    expect(end.phase).toBe('done');
    expect(binned).not.toBeNull();
    // Nothing was made in it: the create's fence read the folder again and refused it.
    const data = JSON.parse(await w.wire.drive.snapshot()) as { files: Array<{ meta: { parents: string[] } }> };
    expect(data.files.filter((f) => f.meta.parents.includes(binned ?? '')).length).toBe(0);
  });

  it('a move into a folder binned since the run read it is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Right before the first move into another folder is sent (its checks done), the person puts that folder in the Bin.
    let binned: { folder: string; thing: string; from: string[]; op: string } | null = null;
    const end = await tidy(w, 1, {
      afterIntent: async (op) => {
        const e = op.effect;
        if (binned !== null || e.kind !== 'move') return;
        let folder: string | undefined;
        if ('fileId' in e.parent) folder = e.parent.fileId;
        else {
          const by = 'createdBy' in e.parent ? e.parent.createdBy : '';
          const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
          const made = found.kind === 'run' ? found.manifest.operations.find((o) => o.operationId === by) : undefined;
          const key = made?.effect.kind === 'create-folder' ? made.effect.createKey : '';
          folder = (await w.wire.drive.listAll(w.root)).find((f) => f.folder && f.appProperties?.bowerItem === key)?.id;
        }
        if (folder === undefined || e.before.parents.includes(folder)) return;
        binned = { folder, thing: e.before.fileId, from: [...e.before.parents], op: op.operationId };
        await w.wire.drive.trash(folder);
      },
    });
    const b = binned as { folder: string; thing: string; from: string[]; op: string } | null;
    expect(b).not.toBeNull();
    // Refused before it was sent, as a run that found the folder gone: the thing stays where it was, out of the Bin.
    expect(end.phase).toBe('done');
    const outcome = (await chainOf(w.wire, w.root)).at(-1)?.outcomes.find((o) => o.operationId === b?.op);
    expect(outcome?.state === 'rejected' ? outcome.failure.code : outcome?.state).toBe('not-found');
    const thing = await w.wire.drive.evidence(b?.thing ?? '');
    expect(thing?.trashed).toBe(false);
    expect(thing?.file.parents).toEqual(b?.from);
  });

  it('a fence that cannot read stops the attempt for recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Right before the first move into another folder is sent, Drive stops answering reads of that folder: the fence
    // cannot read it. Nothing is sent, nothing is refused: the attempt stops, and the next one reads it back and goes on.
    let failing: { folder: string; thing: string; from: string[]; op: string } | null = null;
    let down = true;
    const first = await tidy(w, 1, {
      afterIntent: async (op) => {
        const e = op.effect;
        if (failing !== null || e.kind !== 'move' || e.before.name === RENAMED) return;
        const folder = await destinationFolder(w, op);
        if (folder === undefined || e.before.parents.includes(folder)) return;
        failing = { folder, thing: e.before.fileId, from: [...e.before.parents], op: op.operationId };
      },
      failRead: (url) => down && failing !== null && url.pathname.endsWith(`/files/${failing.folder}`),
    });
    const f = failing as { folder: string; thing: string; from: string[]; op: string } | null;
    if (!f) throw new Error('no move into another folder');
    expect(first.phase).toBe('saving');
    const stopped = (await chainOf(w.wire, w.root)).at(-1);
    expect(stopped?.outcomes.find((o) => o.operationId === f.op)?.state).toBe('possible-effect');
    expect(stopped?.outcomes.some((o) => o.state === 'rejected' && o.failure.code === 'offline')).toBe(false);
    expect(w.sends.get(f.op)).toBeUndefined();
    expect((await w.wire.drive.evidence(f.thing))?.file.parents).toEqual(f.from);

    // Recovery: the next attempt reads it back by its stamp (not there), sends it once, and the run ends done.
    down = false;
    const second = await tidy(w, 2);
    expect(second.phase).toBe('done');
    const last = (await chainOf(w.wire, w.root)).at(-1);
    expect(last?.outcomes.map((o) => o.state)).not.toContain('possible-effect');
    expect(last?.outcomes.find((o) => o.operationId === f.op)?.state).toBe('applied');
    expect(w.sends.get(f.op)).toBe(1);
    expect((await w.wire.drive.evidence(f.thing))?.file.parents).toEqual([f.folder]);
  });

  it('a fence whose attempt check cannot read stops the attempt for recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Right after the first operation's intent is committed, the Worker's attempt route gives no answer for a few asks
    // (more than the transport retries): the fence cannot read the attempt. Drive answers throughout. Nothing is
    // refused as offline; the attempt stops, and the next one reads back what it opened and sends each once.
    let left = -1;
    const first = await tidy(w, 1, {
      afterIntent: async () => {
        if (left < 0) left = 4;
      },
      failAttempt: () => left > 0 && left-- > 0,
    });
    expect(left).toBe(0);
    expect(first.phase).toBe('saving');
    const stopped = (await chainOf(w.wire, w.root)).at(-1);
    expect(stopped?.outcomes.some((o) => o.state === 'rejected' && o.failure.code === 'offline')).toBe(false);
    const opened = (stopped?.outcomes ?? []).filter((o) => o.state === 'possible-effect').map((o) => o.operationId);
    expect(opened.length).toBeGreaterThan(0);

    const second = await tidy(w, 2);
    expect(second.phase).toBe('done');
    const last = (await chainOf(w.wire, w.root)).at(-1);
    expect(last?.outcomes.map((o) => o.state)).not.toContain('possible-effect');
    expect(last?.outcomes.some((o) => o.state === 'rejected' && o.failure.code === 'offline')).toBe(false);
    // Each opened operation read back or sent once: applied, or set aside as the person's rename of `RENAMED` asks.
    for (const op of opened) {
      const o = last?.outcomes.find((x) => x.operationId === op);
      expect(['applied', 'conflict']).toContain(o?.state === 'rejected' ? o.failure.code : o?.state);
      expect(w.sends.get(op) ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it('a fence that reads a real change sets the operation aside', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Right before the first filing move is sent (its checks done), the person renames the thing: the fence reads it.
    let renamed: { thing: string; name: string; from: string[]; op: string } | null = null;
    const end = await tidy(w, 1, {
      afterIntent: async (op) => {
        const e = op.effect;
        if (renamed !== null || e.kind !== 'move' || e.before.name === RENAMED) return;
        const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
        const filing = found.kind === 'run' && found.manifest.capture.members.some((m) => m.file.fileId === e.before.fileId);
        if (!filing) return;
        renamed = { thing: e.before.fileId, name: e.before.name, from: [...e.before.parents], op: op.operationId };
        await w.wire.drive.update(e.before.fileId, { name: 'Renamed by Alex.pdf' });
      },
    });
    const r = renamed as { thing: string; name: string; from: string[]; op: string } | null;
    if (!r) throw new Error('no move');
    expect(end.phase).toBe('done');
    const outcome = (await chainOf(w.wire, w.root)).at(-1)?.outcomes.find((o) => o.operationId === r.op);
    expect(outcome?.state === 'rejected' ? outcome.failure.code : outcome?.state).toBe('conflict');
    expect(w.sends.get(r.op)).toBeUndefined();
    const thing = await w.wire.drive.evidence(r.thing);
    expect(thing?.file.name).toBe('Renamed by Alex.pdf');
    expect(thing?.file.parents).toEqual(r.from);
    const { view } = await endOf(w);
    expect((view as { run: { report: { setAside: { name: string }[] } } }).run.report.setAside.map((a) => a.name)).toContain(r.name);
  });

  it('a landed move later purged is reported as applied', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    let purged: string | null = null;
    const end = await tidy(w, 1, {
      applied: (call) => {
        if (purged !== null || call.op !== 'update' || call.patch.addParent === undefined) return;
        // Drive answered the move; the person then empties it from the Bin before Bower reads anything more of it.
        purged = call.id;
        (w.wire.drive as unknown as { files: Map<string, unknown> }).files.delete(call.id);
      },
    });
    expect(purged).not.toBeNull();
    expect(end.phase).toBe('done');
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const move = found.kind === 'run' ? found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === purged) : undefined;
    expect((await chainOf(w.wire, w.root)).at(-1)?.outcomes.find((o) => o.operationId === move?.operationId)?.state).toBe('applied');
  });

  it('a lost-answer move purged before the read-back is reported as unconfirmed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    let purged: string | null = null;
    // The payslip's filing move: a thing the report names.
    const payslip = (await w.wire.drive.listAll(w.root)).find((f) => f.name === 'Payslip_Aug.pdf')?.id;
    const isMove = (call: FencedCall): boolean => call.op === 'update' && call.id === payslip && call.patch.addParent !== undefined;
    const end = await tidy(w, 1, {
      loseReply: (call) => purged === null && isMove(call),
      applied: (call) => {
        if (purged !== null || !isMove(call) || !('id' in call)) return;
        // The move landed and its answer is lost; the person empties it from the Bin before Bower reads it back.
        purged = call.id;
        (w.wire.drive as unknown as { files: Map<string, unknown> }).files.delete(call.id);
      },
    });
    expect(purged).not.toBeNull();
    expect(end.phase).toBe('done');
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const move = found.kind === 'run' ? found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === purged) : undefined;
    const outcome = (await chainOf(w.wire, w.root)).at(-1)?.outcomes.find((o) => o.operationId === move?.operationId);
    // Neither applied nor moved away: Bower cannot tell whether it landed, and says so.
    expect(outcome?.state === 'rejected' ? outcome.failure : outcome?.state).toEqual({ code: 'unknown', message: UNCONFIRMED_GONE });
    // On its own line, never counted as set aside.
    const view = (await endOf(w)).view as { run: { report: { setAside: Array<{ name: string }>; unconfirmed?: Array<{ name: string; why: string }> } } };
    expect(view.run.report.unconfirmed?.find((r) => r.name === 'Payslip_Aug.pdf')?.why).toBe(UNCONFIRMED_GONE);
    expect(view.run.report.setAside.map((r) => r.name)).not.toContain('Payslip_Aug.pdf');
  });

  it('the bowerOp stamp is never accumulated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // An earlier run's stamp is already on the payslip.
    const w = await world({ bowerOp: 'older-run:0000' });
    const payslip = (await w.wire.drive.listAll(w.root)).find((f) => f.name === 'Payslip_Aug.pdf');
    expect((await tidy(w, 1)).phase).toBe('done');
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const ops = found.kind === 'run' ? found.manifest.operations : [];
    const move = ops.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === payslip?.id);
    expect((await w.wire.drive.get(payslip?.id ?? '')).appProperties?.bowerOp).toBe(stampOf(RUN_ID, move?.operationId ?? ''));
    // The stamp is the first 32 hex characters of SHA-256(run_id:op id) (TL-P4-05 addendum 2).
    expect(stampOf(RUN_ID, move?.operationId ?? '')).toBe(createHash('sha256').update(`${RUN_ID}:${move?.operationId ?? ''}`).digest('hex').slice(0, 32));
    // One stamp key on every file, overwritten by the run's last write to it, never one per run or per operation.
    const stamped = (await stateOf(w.wire.drive, w.root)).filter((e) => Object.keys(e.appProperties).some((k) => k.startsWith('bowerOp')));
    expect(stamped.length).toBeGreaterThan(1);
    for (const e of stamped) {
      expect(Object.keys(e.appProperties).filter((k) => k.startsWith('bowerOp')), e.path).toEqual(['bowerOp']);
      // Outside `.bower`, the stamp of one of the run's operations; Bower's own files carry their own write's stamp.
      if (!e.path.startsWith('.bower/')) expect(ops.some((o) => stampOf(RUN_ID, o.operationId) === e.appProperties.bowerOp), e.path).toBe(true);
    }
  });

  it('a made thing the person moves after a kill is not made twice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    // Killed right after the run made its first folder, inside the batch.
    let made: { name: string; key: string } | null = null;
    await tidy(w, 1, {
      applied: (call, process) => {
        if (made || !madeFolder(call) || call.op !== 'create-folder') return;
        made = { name: call.name, key: call.appProperties?.bowerItem ?? '' };
        process.killed = true;
      },
    }).catch((e: unknown) => e);
    const key = (made as { key: string } | null)?.key ?? '';
    expect(key).not.toBe('');
    const folder = (await w.wire.drive.listAll(w.root)).find((f) => f.folder && f.appProperties?.bowerItem === key);
    expect(folder).toBeDefined();
    // The person moves it elsewhere before the run is taken over.
    await w.wire.drive.update(folder?.id ?? '', { addParent: w.root, removeParent: folder?.parents[0] ?? '' });

    expect((await tidy(w, 2)).phase).toBe('done');
    // Found by its stamp where the person put it: kept there, and never made a second time.
    const all = (await w.wire.drive.listAll(w.root)).filter((f) => f.folder && f.appProperties?.bowerItem === key);
    expect(all.map((f) => f.id)).toEqual([folder?.id]);
    expect((await w.wire.drive.get(folder?.id ?? '')).parents).toEqual([w.root]);
  });

  it('a possibly-sent thing purged after a kill is reported as unconfirmed, as in one attempt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await world();
    const payslip = (await w.wire.drive.listAll(w.root)).find((f) => f.name === 'Payslip_Aug.pdf');
    // Killed right after the batch's opening, before any of its effects was sent.
    await tidy(w, 1, {
      applied: (call, process) => {
        if (isCheckpoint(call) && call.op === 'create-text' && call.text.includes('"possible-effect"')) process.killed = true;
      },
    }).catch((e: unknown) => e);
    // The person puts the payslip in the Bin and empties it: Drive no longer has it.
    (w.wire.drive as unknown as { files: Map<string, unknown> }).files.delete(payslip?.id ?? '');

    expect((await tidy(w, 2)).phase).toBe('done');
    const found = await new RunRecords(w.wire.drive, w.root).found(RUN_ID);
    const move = found.kind === 'run' ? found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === payslip?.id) : undefined;
    const outcome = (await chainOf(w.wire, w.root)).at(-1)?.outcomes.find((o) => o.operationId === move?.operationId);
    // Never sent, but the new attempt cannot tell that: named as possibly sent, and gone. The same sentence as a lost
    // answer read back in one attempt, since Drive keeps nothing to tell the two apart.
    expect(w.sends.get(move?.operationId ?? '') ?? 0).toBe(0);
    expect(outcome?.state === 'rejected' ? outcome.failure : outcome?.state).toEqual({ code: 'unknown', message: UNCONFIRMED_GONE });
    expect(JSON.stringify((await endOf(w)).view)).toContain(UNCONFIRMED_GONE);
  });
});
