import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { PILE_NOTE } from '../../src/data/piles';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { canonical } from '../../src/data/spine/records';
import { scriptedProvider } from '../../src/data/demo/script';
import { listedPiles } from '../../src/data/spine/scripted';
import { SYSTEM, isRunnerFile } from '../../src/data/vault/layout';
import { main } from '../src/main';
import { traceWrites } from './modelled';
import { RunnerDrive } from '../src/drive';
import { withMaintenance } from '../src/index';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);

afterEach(() => vi.restoreAllMocks());

/**
 * Alex's folder on a pretend Drive v3, admitted by the Worker's rules: two loose things the demo files into folders
 * not there yet (made by the run), and a pile with words whose folder goes to the Bin once its photo is filed.
 */
async function seeded(journal = false): Promise<{ drive: FakeDrive; root: string; admission: AdmissionManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  const changes = (await drive.createFolder(sys, 'changes')).id;
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  // One of your changes, when asked for: a note Alex made, as the app records it.
  if (journal) await drive.createText(changes, 'change-1.json', `${JSON.stringify({ v: 1, id: 'change-1', device: 'device-1', at: AT - 60_000, kind: 'create', what: 'Made Ideas.md', path: 'Projects/Ideas.md' })}\n`);
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
  await drive.createText(inbox, 'Dentist reminder.pdf', '%PDF dentist', { pile: 'p-dentist' });
  const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
  await drive.createText(pile, PILE_NOTE, 'The kitchen at the Wrenfield Road viewing.\n');
  await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  return { drive, root, admission: admitted.manifest };
}

/** The dispatch as Actions hands it to the job: the event file at `GITHUB_EVENT_PATH`. */
async function eventFile(payload: Record<string, unknown> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bower-runner-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false, ...payload } }));
  return file;
}

async function wired(journal = false): Promise<{ wire: DriveV3; root: string; admission: AdmissionManifest }> {
  const { drive, root, admission } = await seeded(journal);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admission;
  return { wire, root, admission };
}

/** The path of a file in the folder, from a listing. */
function pathOf(listing: readonly DriveFile[], root: string, id: string): string | null {
  const byId = new Map(listing.map((f) => [f.id, f]));
  const parts: string[] = [];
  for (let f = byId.get(id); f; f = byId.get(f.parents[0] ?? '')) {
    parts.unshift(f.name);
    if (f.parents[0] === root) return parts.join('/');
  }
  return null;
}

describe('the runner process', () => {
  it('main applies real Drive effects through the adapter and the folder changes', async () => {
    const { wire, root, admission } = await wired();
    const before = await wire.drive.listAll(root);
    // The things it took; a pile's note is its words, and goes to the Bin with its folder.
    const items = admission.piles.flatMap((p) => p.items.filter((i) => i.name !== PILE_NOTE).map((i) => i.fileId));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((id) => pathOf(before, root, id)?.startsWith('Inbox/'))).toBe(true);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: wire.fetch })).toBe(0);

    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    // The folder changed: every thing it took left the inbox, by writes Drive v3 received.
    const after = await wire.drive.listAll(root);
    const left = items.map((id) => pathOf(after, root, id));
    expect(left.filter((p) => p === null || p.startsWith('Inbox/'))).toEqual([]);
    expect(wire.requests.filter((r) => r.method === 'PATCH').length).toBeGreaterThanOrEqual(items.length);
    const anchor = admission.piles.find((p) => p.anchor)?.anchor;
    expect((await wire.drive.evidence(anchor?.fileId ?? ''))?.trashed).toBe(true);
    // The report landed last, and says what was filed.
    const lastRun = after.find((f) => pathOf(after, root, f.id) === SYSTEM.lastRun);
    expect(lastRun).toBeDefined();
    const value: unknown = JSON.parse(await wire.drive.readText(lastRun?.id ?? ''));
    expect(isRunnerFile(SYSTEM.lastRun, value) && value.run.id === RUN_ID && value.run.phase === 'done').toBe(true);
    if (!isRunnerFile(SYSTEM.lastRun, value)) return;
    expect(value.run.report?.filed.length).toBe(items.length);
  });

  it("every admitted item's disposition is readable after the run, journal lines included", async () => {
    const { wire, root, admission } = await wired(true);
    const things = admission.piles.flatMap((p) => p.items.map((i) => i.fileId));
    const lines = admission.journal.map((l) => l.fileId);
    expect(lines).toHaveLength(1);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: wire.fetch })).toBe(0);
    expect(wire.statuses.at(-1)?.phase).toBe('done');

    // In the run's own folder, with one line for every admitted item, none twice.
    const files = await wire.drive.listAll(root);
    const file = files.find((f) => !f.folder && pathOf(files, root, f.id) === `${SYSTEM.dir}/runs/${RUN_ID}/dispositions.json`);
    expect(file).toBeDefined();
    const value = JSON.parse(await wire.drive.readText(file?.id ?? '')) as { v: number; runId: string; items: Array<{ fileId: string; pileId: string | null; disposition: string }> };
    expect(value).toMatchObject({ v: 1, runId: RUN_ID });
    expect(value.items.map((i) => i.fileId).sort()).toEqual([...things, ...lines].sort());
    expect(value.items.every((i) => ['filed', 'set-aside', 'waiting'].includes(i.disposition))).toBe(true);
    // Every thing taken was filed, and your change was read and archived: filed too, with no pile.
    expect(value.items.filter((i) => things.includes(i.fileId)).map((i) => i.disposition)).toEqual(things.map(() => 'filed'));
    expect(value.items.find((i) => i.fileId === lines[0])).toEqual({ fileId: lines[0], pileId: null, disposition: 'filed' });
    // Written before last-run.json (the pretend Drive's clock rises with each create); both are confirmed by their
    // write's own answer, with no read after it (`write-once.ts`).
    const view = files.find((f) => pathOf(files, root, f.id) === SYSTEM.lastRun);
    const made = (f: DriveFile | undefined): number => Date.parse(f?.createdTime ?? '');
    expect(made(file)).toBeGreaterThan(0);
    expect(made(file)).toBeLessThan(made(view));
    const readBack = wire.requests.findIndex((r) => r.method === 'GET' && r.url.searchParams.get('alt') === 'media' && r.url.pathname.endsWith(`/${view?.id ?? ''}`));
    expect(readBack).toBe(-1);
  });

  it('main picks the scripted provider', async () => {
    // Unknown: it refuses to start, saying which names it knows, before any call.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refused = await wired();
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), BOWER_PROVIDER: 'model' }, { fetch: refused.wire.fetch })).toBe(1);
    expect(refused.wire.tokenCalls + refused.wire.attemptCalls + refused.wire.requests.length).toBe(0);
    expect(errors.mock.calls.flat().map(String).join('\n')).toMatch(/model.*scripted|scripted.*model/);
    errors.mockRestore();

    // Default and named: the scripted provider plans the run, with Q5's declared maintenance after its operations.
    for (const env of [{}, { BOWER_PROVIDER: 'scripted' }]) {
      const { wire, root, admission } = await wired();
      const twin = await seeded();
      const reads = fakeRead(twin.drive);
      const port = { ...reads, piles: (rootId: string) => listedPiles(reads, rootId), provenance: 'adapter-read' as const };
      const scripted = await scriptedProvider(port, { rootId: twin.root, runId: RUN_ID, allowWeb: false })({ taken: admission, deferred: [] });
      const twinWire = driveV3(twin.drive);
      twinWire.folderId = twin.root;
      twinWire.manifest = twin.admission;
      const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: twinWire.fetch, now: () => twinWire.now });
      const expected = await withMaintenance(new RunnerDrive({ token, attempt: 1, fetch: twinWire.fetch }), scripted);
      expect(expected.captureId).toBe((await canonical({ scope: scripted.scope, runScope: scripted.runScope, capture: expected.capture })).hash);
      // Maintenance adds captured places; keep every scripted field, resealing IDs and their references only.
      const ids = new Map<string, string>();
      const resealed: typeof scripted.operations = [];
      for (const op of scripted.operations) {
        const effect = 'parent' in op.effect && 'createdBy' in op.effect.parent
          ? { ...op.effect, parent: { createdBy: ids.get(op.effect.parent.createdBy) ?? '' } }
          : op.effect;
        const operationId = (await canonical({ runId: scripted.runId, captureId: expected.captureId, ordinal: op.ordinal, effect })).hash;
        ids.set(op.operationId, operationId);
        resealed.push({ ...op, operationId, effect, dependsOn: op.dependsOn.map((id) => ids.get(id) ?? '') });
      }
      expect(expected.operations.slice(0, -1)).toEqual(resealed);
      expect(expected.operations.at(-1)?.effect).toMatchObject({ kind: 'maintain', inputs: { operationIds: resealed.map((o) => o.operationId) } });
      for (const op of expected.operations) {
        expect(op.operationId).toBe((await canonical({ runId: expected.runId, captureId: expected.captureId, ordinal: op.ordinal, effect: op.effect })).hash);
      }
      expect(expected.operations.map((o) => o.effect.kind).sort()).toEqual(expect.arrayContaining(['bin', 'create-folder', 'create-text', 'move']));
      expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...env }, { fetch: wire.fetch })).toBe(0);
      const files = await wire.drive.listAll(root);
      const record = files.find((f) => f.name.startsWith('manifest-') && pathOf(files, root, f.id)?.startsWith(`${SYSTEM.dir}/runs/${RUN_ID}/`));
      expect(record).toBeDefined();
      expect(JSON.parse(await wire.drive.readText(record?.id ?? ''))).toEqual(JSON.parse(JSON.stringify(expected)));
    }
  });

  it('main reports reading with total before writing', async () => {
    const { wire, admission } = await wired(true);
    const n = admission.piles.reduce((sum, p) => sum + p.items.filter((i) => !(p.anchor && i.name === PILE_NOTE)).length, 0);
    expect(n).toBeGreaterThan(0);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: wire.fetch })).toBe(0);

    expect(wire.statuses.map((s) => [s.phase, s.total])).toEqual([['reading', n], ['writing', n], ['saving', n], ['done', n]]);
  });

  it('total counts things only', async () => {
    const { wire, root, admission } = await wired(true);
    // The things: every admitted file of a pile but its note; your changes are not things.
    const things = admission.piles.flatMap((p) => p.items.filter((i) => !(p.anchor && i.name === PILE_NOTE)));
    expect(things).toHaveLength(3);
    expect(admission.journal).toHaveLength(1);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: wire.fetch })).toBe(0);

    expect(wire.statuses.map((s) => [s.phase, s.total])).toEqual([['reading', 3], ['writing', 3], ['saving', 3], ['done', 3]]);
    // last-run.json says the same.
    const files = await wire.drive.listAll(root);
    const view = files.find((f) => pathOf(files, root, f.id) === SYSTEM.lastRun);
    const value: unknown = JSON.parse(await wire.drive.readText(view?.id ?? ''));
    expect(isRunnerFile(SYSTEM.lastRun, value) ? value.run.total : null).toBe(3);
  });

  it('a run whose piles are all held ends done with nothing filed', async () => {
    // Alex's inbox holds one pile, admitted ready; before the runner reads it, its note is damaged (a race).
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
    const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
    const note = await drive.createText(pile, PILE_NOTE, 'The kitchen at the Wrenfield Road viewing.\n');
    await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
    const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
    await drive.writeText(note.id, '---\nbower_format:  ownership/2\n---\nThe kitchen\n', note.modifiedTime);
    const wire = driveV3(drive);
    wire.folderId = root;
    wire.manifest = admitted.manifest;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: wire.fetch })).toBe(0);

    // Done, never failed, and nothing in the folder moved.
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'done']);
    expect(wire.statuses.some((s) => s.failure !== undefined)).toBe(false);
    const files = await drive.listAll(root);
    expect(pathOf(files, root, note.id)).toBe(`Inbox/Flat photos/${PILE_NOTE}`);
    // Its report says nothing was ready yet, and every admitted item waits.
    const view = files.find((f) => pathOf(files, root, f.id) === SYSTEM.lastRun);
    const value: unknown = JSON.parse(await drive.readText(view?.id ?? ''));
    if (!isRunnerFile(SYSTEM.lastRun, value)) throw new Error('no last-run.json');
    expect(value.run).toMatchObject({ id: RUN_ID, phase: 'done', total: 0 });
    expect(value.run.report).toMatchObject({ filed: [], setAside: [], nothingReady: true });
    const kept = files.find((f) => pathOf(files, root, f.id) === `${SYSTEM.dir}/runs/${RUN_ID}/dispositions.json`);
    const items = (JSON.parse(await drive.readText(kept?.id ?? '')) as { items: Array<{ disposition: string }> }).items;
    expect(items.length).toBe(2);
    expect(items.every((i) => i.disposition === 'waiting')).toBe(true);
  });
});

/** c4-retry-fence (TL-P4-24 finding 1): the runner's `main`, a fenced write answered 429 while a newer attempt took over. */
describe('the runner process under a rate limit', () => {
  it('main sends no fenced write again after a takeover during the rate limit wait', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { wire, root } = await wired();
    const patched: string[] = [];
    const trace = traceWrites();
    const attempts = new Map<number, number>();
    const sent: Array<number | undefined> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const owner = trace.current()?.id;
      if (url.origin === API && url.pathname.endsWith('/attempt')) {
        const answer = await wire.fetch(input, init);
        if (owner !== undefined) attempts.set(owner, (await answer.clone().json() as { attempt: number }).attempt);
        return answer;
      }
      if (url.origin === 'https://www.googleapis.com' && (init?.method ?? 'GET').toUpperCase() !== 'GET') sent.push(owner === undefined ? undefined : attempts.get(owner));
      if (url.origin === 'https://www.googleapis.com' && (init?.method ?? 'GET').toUpperCase() === 'PATCH') {
        patched.push(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
        if (patched.length === 1) {
          // The Worker starts attempt 2 while Drive answers this one's write with a rate limit.
          wire.attempt = 2;
          return new Response(JSON.stringify({ error: { code: 429, errors: [] } }), { status: 429 });
        }
      }
      return wire.fetch(input, init);
    };
    const before = await wire.drive.listAll(root);
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile() }, { fetch: fetchFn, pacing: { baseMs: 0, sleep: async () => {} } });
    // Siblings whose own fences already passed may land; no target is resent after takeover.
    expect(patched.length).toBeGreaterThan(0);
    expect(new Set(patched).size).toBe(patched.length);
    expect(sent.every((attempt) => attempt === 1)).toBe(true);
    expect([...attempts.values()]).toContain(2);
    const target = patched[0] ?? '';
    const after = await wire.drive.listAll(root);
    expect(after.find((f) => f.id === target)).toEqual(before.find((f) => f.id === target));
  });
});
