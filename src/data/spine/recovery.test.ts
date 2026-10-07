/**
 * Recovery without the browser on the fake (TL-P3-23): the run service's attempt is killed right after each
 * checkpoint it can write, the page is gone (the service and the folder come back from what they kept), and the
 * service finishes the run as if it had never been interrupted. The runner's twin of this test runs the same claim on
 * the adapter's contract test (`runner/test/recovery.test.ts`, Drive v3 faked over fetch).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Checkpoint } from '../contracts/run-checkpoint';
import { FakeDrive, type FencedCall } from '../drive/fake-drive';
import { planRun } from '../fake/fake-runner';
import { FakeRunService } from '../fake/fake-run-service';
import { seedFakeDrive } from '../fake/seed';
import { sha256 } from '../vault/hashes';
import { SYSTEM } from '../vault/layout';
import { RunRecords } from './records';

const AT = Date.UTC(2026, 9, 7, 9);
const clock = (): number => AT;
const ACCOUNT = 'you@example.com';

afterEach(() => vi.restoreAllMocks());

interface Entry {
  path: string;
  folder: boolean;
  trashed: boolean;
  sha256: string | null;
  appProperties: Record<string, string>;
}

/** Names, parents (as paths), the Bin and content hashes; the run's own checkpoints say which attempt wrote them. */
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
    out.push({ path, folder: f.meta.folder, trashed: f.trashed, sha256: c === null ? null : await sha256(new Blob(['text' in c ? c.text : c.b64])), appProperties: f.meta.appProperties ?? {} });
  }
  return out.sort((a, b) => (a.path + String(a.trashed)).localeCompare(b.path + String(b.trashed)));
}

/** Alex's default folder on the fake, its run planned and admitted. */
async function admitted(drive: FakeDrive): Promise<{ root: string; runs: FakeRunService; runId: string }> {
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const runs = new FakeRunService({ drive, clock, scale: 'instant' });
  // The same ids each time, so two runs of the same plan are the same run.
  const runId = 'run-alex-1';
  const requestId = 'request-alex-1';
  const plan = await planRun(drive, root, { scope: 'all', allowWeb: false, runId, requestId, requestedAt: AT });
  await runs.admit({ account: ACCOUNT, rootId: root }, plan.manifest);
  return { root, runs, runId };
}

/** Asks the service how the run stands until it ends, as the Worker's alarm does; no client page is needed. */
async function finish(runs: FakeRunService, root: string): Promise<string | undefined> {
  for (let i = 0; i < 20; i++) {
    await runs.settled();
    const run = await runs.status({ account: ACCOUNT, rootId: root });
    if (run?.phase === 'done' || run?.phase === 'failed') {
      await runs.settled();
      return run.phase;
    }
  }
  return undefined;
}

async function endOf(drive: FakeDrive, root: string): Promise<{ state: Entry[]; view: unknown }> {
  const text = drive.dump(root).get(SYSTEM.lastRun);
  return { state: await stateOf(drive, root), view: text === undefined ? null : JSON.parse(text) };
}

async function chainOf(drive: FakeDrive, root: string, runId: string): Promise<Checkpoint[]> {
  const found = await new RunRecords(drive, root).found(runId);
  return found.kind === 'run' ? found.chain : [];
}

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

const isCheckpoint = (call: FencedCall): boolean => call.op === 'create-text' && call.name.startsWith('checkpoint-');

describe('recovery without the browser on the fake', () => {
  it('a run killed after any checkpoint ends like an uninterrupted run on the fake and on Drive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const whole = new FakeDrive({ clock: () => 0 });
    const once = await admitted(whole);
    expect(await finish(once.runs, once.root)).toBe('done');
    const expected = await endOf(whole, once.root);
    const chain = await chainOf(whole, once.root, once.runId);
    const kinds = chain.map((_, at) => kindOf(chain, at));
    for (const kind of ['first', 'possible-effect', 'applied', 'report pending', 'done']) expect(kinds).toContain(kind);

    for (let at = 0; at < chain.length; at++) {
      // The page that ran it: killed right after it wrote checkpoint `at`; nothing it tries after that lands.
      const drive = new FakeDrive({ clock: () => 0 });
      let written = 0;
      let killed = false;
      drive.fault = {
        before: () => (killed ? 'refuse' : 'pass'),
        applied: (call) => {
          if (isCheckpoint(call) && written++ === at) killed = true;
        },
      };
      const first = await admitted(drive);
      await first.runs.settled();
      expect((await chainOf(drive, first.root, first.runId)).length, `checkpoint ${at}`).toBe(at + 1);

      // What was kept: the folder and the service's rows. The service goes on alone.
      drive.fault = null;
      const kept = FakeDrive.restore(await drive.snapshot(), { clock: () => 0 });
      const runs = FakeRunService.restore(first.runs.toJSON(), { drive: kept, clock, scale: 'instant' });
      expect(await finish(runs, first.root), `resumed after checkpoint ${at} (${kinds[at] ?? ''})`).toBe('done');
      expect(await endOf(kept, first.root), `resumed after checkpoint ${at} (${kinds[at] ?? ''})`).toEqual(expected);
    }
    // One run per checkpoint of the whole chain.
  }, 120_000);
});
