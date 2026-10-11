/**
 * The Claude provider on recorded replies (TL-P4-01, `claude-provider`): no live call and no model. The folder and
 * the admitted set are the scripted provider's contract fixtures (the same seeded folder `main.test.ts` runs), and
 * each reply is a `claude -p --output-format json` result recorded in `fixtures/claude/`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { parseRunManifestV2, type RunnerWrite } from '../../src/data/contracts/run-manifest';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import { serializeNote } from '../../src/data/vault/note-format';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import type { Admitted } from '../../src/data/spine/provider';
import type { ScriptedRead } from '../../src/data/spine/read';
import { scriptedProvider } from '../../src/data/demo/script';
import { listedPiles, runKeys } from '../../src/data/spine/scripted';
import { claudeProvider, type ClaudeCall, type ClaudeExit } from '../src/claude';
import { outsideAdmitted } from '../src/spine/admitted';
import { main } from '../src/main';
import { candidates, phaseAwareClaude, type PlanningFixture } from './b1-planning-support';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
/** A made-up credential: what the test looks for in every captured line. */
const TOKEN = 'sk-ant-oat01-made-up-token-for-tests-only';

afterEach(() => vi.restoreAllMocks());

const recorded = (name: string): string => readFileSync(new URL(`./fixtures/claude/${name}`, import.meta.url), 'utf8');

/**
 * Alex's folder on a pretend Drive v3, as `main.test.ts` seeds it: two loose things and a pile with words. `rich` adds
 * what the demo's folder has and the scripted plan does more for: two of Bower's hub notes it brings up to date, a
 * saved link filed as a note, an offer that gets its own note, and a pile of words only that becomes a note.
 */
const exhaustionBefore = new WeakMap<DriveV3, { files: Awaited<ReturnType<DriveV3['drive']['listAll']>>; logs: number; evidence: Record<string, unknown> }>();

async function wired(rich = false, withText = false): Promise<{ wire: DriveV3; root: string; admission: AdmissionManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
  await drive.createText(inbox, 'Dentist reminder.pdf', '%PDF dentist', { pile: 'p-dentist' });
  const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
  await drive.createText(pile, PILE_NOTE, 'The kitchen at the Wrenfield Road viewing.\n');
  await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
  if (withText) await drive.createText(inbox, 'Leek soup.txt', 'Leeks, potatoes and stock, simmered for twenty minutes.\n', { pile: 'p-soup' });
  if (rich) {
    const projects = (await drive.listAll(root)).find((f) => f.name === 'Projects')?.id ?? root;
    const hub = (summary: string): string => serializeNote({ summary, properties: [], tags: [], currentState: [], body: '', timeline: [], byBower: true });
    const flats = (await drive.createFolder(projects, 'Flat hunt')).id;
    await drive.createText(flats, 'Flat hunt.md', hub('Flats Alex is looking at.'));
    const jobs = (await drive.createFolder(projects, 'Job hunt')).id;
    await drive.createText(jobs, 'Job hunt.md', hub('Jobs Alex applied for.'));
    await drive.createText(inbox, 'listing-88213.example.url', '[InternetShortcut]\nURL=https://listing-88213.example\n', { pile: 'p-listing' });
    await drive.createText(inbox, 'Offer_letter_final(2).pdf', '%PDF offer', { pile: 'p-offer' });
    const words = (await drive.createFolder(inbox, 'Garden', { pile: 'p-garden' })).id;
    await drive.createText(words, PILE_NOTE, 'Ideas for the garden in spring.\n');
  }
  // Folders the recorded replies file into already exist: a new one under Areas or Projects needs a cited note (placement-check).
  const under = async (parent: string, name: string): Promise<string> => (await drive.createFolder(parent, name)).id;
  const at = async (name: string): Promise<string> => (await drive.listAll(root)).find((f) => f.name === name)?.id ?? root;
  const areas = await at('Areas');
  await under(await under(areas, 'Money'), 'Payslips');
  await under(areas, 'Health');
  const projectsId = await at('Projects');
  const jobs = (await drive.listAll(root)).find((f) => f.name === 'Job hunt')?.id;
  if (jobs) await under(jobs, 'Applications');
  const flat = (await drive.listAll(root)).find((f) => f.name === 'Flat hunt')?.id;
  await under(flat ?? await under(projectsId, 'Flat hunt'), 'Viewing photos');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  if (!vi.isMockFunction(console.log)) vi.spyOn(console, 'log').mockImplementation(() => {});
  const files = await drive.listAll(root);
  exhaustionBefore.set(wire, { files, logs: vi.mocked(console.log).mock.calls.length,
    evidence: Object.fromEntries(await Promise.all(files.map(async (file) => [file.id, await drive.evidence(file.id)] as const))) });
  return { wire, root, admission: admitted.manifest };
}

async function eventFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bower-runner-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false } }));
  return file;
}

/** A recorded execution reply after a fixture-bound selection, keeping every call. */
function recordedClaude(reply: Partial<ClaudeExit> & { stdout: string }, fixture: PlanningFixture): { calls: ClaudeCall[]; spawn: (call: ClaudeCall) => Promise<ClaudeExit> } {
  const calls: ClaudeCall[] = [];
  const respond = phaseAwareClaude(() => ({ code: 0, stderr: '', cut: null, ...reply }), () => fixture);
  return { calls, spawn: async (call) => { calls.push(call); return respond(call); } };
}

/** The recorded success with its intent changed by `edit`: a reply that is JSON but outside the intent. */
function edited(edit: (intent: Record<string, unknown>) => void, name = 'reply-ok.json'): string {
  const envelope = JSON.parse(recorded(name)) as { result: string };
  const intent = JSON.parse(envelope.result) as Record<string, unknown>;
  edit(intent);
  return JSON.stringify({ ...envelope, result: JSON.stringify(intent) });
}

async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/**
 * The recorded manifest reply (from before P4-2) edited by `edit`, then its capture id and operation ids made again as the planner makes them
 * (as `checkpoints.test.ts` does): a reply inside the contract that plans for another run, request or thing.
 */
async function rehashed(edit: (text: string) => string): Promise<string> {
  const envelope = JSON.parse(recorded('reply-manifest.json')) as { result: string };
  const value = JSON.parse(edit(envelope.result)) as RunManifest;
  value.captureId = await hash({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  const ref = (id: string): string => renamed.get(id) ?? id;
  for (const op of value.operations) {
    op.dependsOn = op.dependsOn.map(ref);
    if ('parent' in op.effect && 'createdBy' in op.effect.parent) op.effect.parent = { createdBy: ref(op.effect.parent.createdBy) };
    const next = await hash({ runId: value.runId, captureId: value.captureId, ordinal: op.ordinal, effect: op.effect });
    renamed.set(op.operationId, next);
    op.operationId = next;
  }
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return JSON.stringify({ ...envelope, result: JSON.stringify(value) });
}

const claudeEnv = (extra: Record<string, string> = {}): Record<string, string> => ({ BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: TOKEN, ...extra });

/** Ledger exhaustion leaves admitted work untouched for a later run. */
const claudeInput = (call: ClaudeCall | undefined): string => call?.input.split('\n').at(-1) ?? '{}';

async function expectLeavesForNextRun(wire: DriveV3): Promise<void> {
  const before = exhaustionBefore.get(wire);
  if (!before) throw new Error('Missing exhaustion baseline.');
  const files = await wire.drive.listAll(wire.folderId);
  const last = files.find((f) => f.name === 'last-run.json');
  expect.soft(last, 'exhaustion writes no new report row').toEqual(before.files.find((f) => f.name === 'last-run.json'));
  const report = JSON.parse(last ? await wire.drive.readText(last.id) : '{"run":{"report":{"filed":[],"setAside":[]}}}') as {
    run: { report: { filed: unknown[]; setAside: unknown[] } };
  };
  const sourceIds = new Set(wire.manifest?.piles.flatMap((pile) => pile.items.map((item) => item.fileId)));
  expect.soft(wire.requests.filter((request) => request.method !== 'GET'
    && sourceIds.has(request.url.pathname.split('/').at(-1) ?? ''))).toEqual([]);
  expect.soft(report.run.report.filed).toEqual([]);
  expect.soft(report.run.report.setAside).toEqual([]);
  expect.soft(files.filter((f) => /^manifest-.*\.json$/.test(f.name)))
    .toEqual(before.files.filter((f) => /^manifest-.*\.json$/.test(f.name)));
  for (const file of before.files) {
    const path = wire.drive.pathOf(file.id, wire.folderId);
    if (!path.startsWith('.bower/') || path.startsWith('.bower/changes/')) {
      expect.soft(await wire.drive.evidence(file.id), 'sources, declarations and requests remain').toEqual(before.evidence[file.id]);
    }
  }
  expect.soft(files.filter((f) => !wire.drive.pathOf(f.id, wire.folderId).startsWith('.bower/')))
    .toEqual(before.files.filter((f) => !wire.drive.pathOf(f.id, wire.folderId).startsWith('.bower/')));
  expect.soft(wire.statuses.at(-1)?.phase, 'waiting is a completed run with untouched inbox work').toBe('done');
  for (const source of wire.manifest?.piles.flatMap((pile) => pile.items) ?? []) {
    expect.soft(wire.drive.pathOf(source.fileId, wire.folderId), 'waiting source stays in the inbox').toMatch(/^Inbox\//);
    expect.soft(await wire.drive.evidence(source.fileId)).toEqual(before.evidence[source.fileId]);
  }
  const lines = vi.mocked(console.log).mock.calls.slice(before.logs).map((args) => args.map(String).join(' '))
    .filter((line) => /exhaust|next run|left.*inbox|wait/i.test(line) && !line.startsWith('timing:'));
  expect.soft(lines, 'one console line counts deferred items').toHaveLength(1);
  const count = wire.manifest?.piles.reduce((n, p) => n + Math.max(1, p.items.filter((i) => i.name !== PILE_NOTE).length), 0) ?? 0;
  expect.soft(lines[0] ?? '').toMatch(new RegExp(`\\b${count}\\b`));
  const admitted = await planAdmission(fakeRead(wire.drive), wire.folderId,
    { scope: 'all', clock: () => AT + 1, newId: () => 'exhaustion-next-run' });
  expect.soft(admitted.kind, 'next run takes the untouched items').toBe('manifest');
  if (admitted.kind === 'manifest') {
    expect.soft(admitted.manifest.piles).toEqual(wire.manifest?.piles);
    expect.soft(admitted.manifest.journal).toEqual(wire.manifest?.journal);
  }
}

describe('the Claude provider', () => {
  it('the prompt says a thing with no fitting folder goes to Resources', async () => {
    const { wire } = await wired();
    const claude = recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn });
    const prompt = claude.calls[0]?.input ?? '';
    expect(prompt).toMatch(/fits no folder below[^.]*goes to Resources/);
    expect(prompt).toMatch(/Projects hold a goal with an end date, Areas an ongoing responsibility with no end date/);
    expect(prompt).not.toMatch(/the rules/);
  });

  it('a new Area with no cited rule or note is refused and retried once', async () => {
    const { wire } = await wired();
    const newArea = edited((m) => { for (const t of (m.things as Array<{ to: string }>).slice(0, 1)) t.to = 'Areas/Community garden'; });
    const toResources = edited((m) => { for (const t of m.things as Array<{ to: string }>) t.to = 'Resources'; });
    const replies = [newArea, toResources];
    const calls: ClaudeCall[] = [];
    const respond = phaseAwareClaude((_call, _step, attempt, phase) => ({ code: 0, stderr: '', cut: null, stdout: replies[phase === 'selection' ? replies.length - 1 : attempt] ?? toResources }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => { calls.push(call); return respond(call); };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn })).toBe(0);

    // After selection, execution is retried once, told why; the corrected reply completes.
    expect(calls).toHaveLength(3);
    expect(calls[2]?.input).toContain('Areas/Community garden');
    expect(calls[2]?.input).toMatch(/refused/);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    const folders = (await wire.drive.listAll(wire.folderId)).filter((f) => f.name === 'Community garden');
    expect(folders).toEqual([]);
  });

  it('a new Area with a responsibility is made and the report says why', async () => {
    const { wire, admission } = await wired();
    const areas = (await wire.drive.listAll(wire.folderId)).find((f) => f.folder && f.name === 'Areas');
    const money = edited((m) => { for (const t of (m.things as Array<Record<string, string>>).slice(0, 1)) Object.assign(t, { to: 'Areas/Finance', responsibility: 'pay and tax records' }); });
    const calls: ClaudeCall[] = [];
    const respond = phaseAwareClaude(() => ({ code: 0, stderr: '', cut: null, stdout: money }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => { calls.push(call); return respond(call); };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn })).toBe(0);

    // Selection then execution: the responsibility is the basis for the new Area, and the report says why it was made.
    expect(calls).toHaveLength(2);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    const selectionContext = JSON.parse(claudeInput(calls[0])) as Record<string, unknown>;
    expect(candidates(calls[0] ? { call: calls[0], value: selectionContext, events: [] } : undefined, admission.piles[0]?.items[0]?.fileId ?? ''))
      .toContain(areas?.id);
    const listing = await wire.drive.listAll(wire.folderId);
    expect(listing.filter((f) => f.folder && f.name === 'Finance')).toHaveLength(1);
    const last = listing.find((f) => f.name === 'last-run.json');
    const report = JSON.parse(await wire.drive.readText(last?.id ?? '')) as unknown;
    expect(JSON.stringify(report)).toContain('"area":"New area Finance, for pay and tax records"');
  });

  it('a responsibility does not open a new Project', async () => {
    const { wire } = await wired();
    const project = edited((m) => { for (const t of (m.things as Array<Record<string, string>>).slice(0, 1)) Object.assign(t, { to: 'Projects/Garden', responsibility: 'the garden' }); });
    const calls: ClaudeCall[] = [];
    const respond = phaseAwareClaude(() => ({ code: 0, stderr: '', cut: null, stdout: project }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => { calls.push(call); return respond(call); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn });
    expect(calls).toHaveLength(3);
    expect(wire.statuses.at(-1)?.phase).toBe('done');
    await expectLeavesForNextRun(wire);
  });

  it('a cut Rules.md is marked as cut in the model input', async () => {
    const { wire, root } = await wired();
    const long = `---\nsummary: Rules.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n${'- Receipts go to Areas / Money / Receipts.\n'.repeat(200)}`;
    await wire.drive.createText(root, 'Rules.md', long, { by: 'bower' });
    const claude = recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn });
    const context = JSON.parse((claude.calls[0]?.input ?? '').split('\n').at(-1) ?? '{}') as { rules?: string };
    expect(context.rules?.length).toBeLessThan(long.length);
    expect(context.rules).toMatch(/\[cut here: \d+ more characters of the rules not shown; the list may go on\]$/);
  });

  it('the retry runs the model in a folder that still exists', async () => {
    const { wire } = await wired();
    const newArea = edited((m) => { for (const t of (m.things as Array<{ to: string }>).slice(0, 1)) t.to = 'Areas/Community garden'; });
    const toResources = edited((m) => { for (const t of m.things as Array<{ to: string }>) t.to = 'Resources'; });
    const replies = [newArea, toResources];
    const there: boolean[] = [];
    const home: boolean[] = [];
    const respond = phaseAwareClaude((_call, _step, attempt, phase) => ({ code: 0, stderr: '', cut: null, stdout: replies[phase === 'selection' ? replies.length - 1 : attempt] ?? toResources }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => {
      there.push(existsSync(call.cwd));
      home.push(existsSync(call.env.HOME ?? ''));
      return respond(call);
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn })).toBe(0);

    expect(there).toEqual([true, true]);
    expect(home).toEqual([true, true]);
  });

  it('a rule basis is a whole rules line, never part of one or the cut marker', async () => {
    const { wire, root } = await wired();
    const long = `---\nsummary: Rules.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n${'- Receipts go to Areas / Money / Receipts.\n'.repeat(200)}`;
    await wire.drive.createText(root, 'Rules.md', long, { by: 'bower' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const asks = async (basis: string): Promise<number> => {
      const reply = edited((m) => { for (const t of (m.things as Array<Record<string, string>>).slice(0, 1)) Object.assign(t, { to: 'Projects/Community garden', basis }); });
      const claude = recordedClaude({ stdout: reply }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
      await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn });
      return claude.calls.length;
    };
    
    expect(await asks('more characters of the rules not shown')).toBe(3);
    expect(await asks('Receipts go to Areas / Money')).toBe(3);
    expect(await asks('Receipts go to Areas / Money / Receipts.')).toBe(2);
  });

  it('a new subfolder of an existing Area is not reported as a new area', async () => {
    const { wire } = await wired();
    const sub = edited((m) => { for (const t of (m.things as Array<Record<string, string>>).slice(0, 1)) Object.assign(t, { to: 'Areas/Money/Statements', responsibility: 'bank statements' }); });
    const claude = recordedClaude({ stdout: sub }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);

    expect(claude.calls).toHaveLength(2);
    const last = (await wire.drive.listAll(wire.folderId)).find((f) => f.name === 'last-run.json');
    expect(JSON.stringify(JSON.parse(await wire.drive.readText(last?.id ?? '')))).not.toContain('New area');
  });

  it('a thing with text and no note or citing line is refused and retried once', async () => {
    const { wire } = await wired(false, true);
        const soup = async (): Promise<string> => (await wire.drive.listAll(wire.folderId)).find((f) => f.name === 'Leek soup.txt')?.id ?? '';
    const id = await soup();
    const plain = edited((m) => { (m.things as unknown[]).push({ fileId: id, to: 'Resources', name: 'Leek soup.txt' }); });
    const noted = edited((m) => { (m.things as unknown[]).push({ fileId: id, to: 'Resources', name: 'Leek soup.txt', note: { name: 'Leek soup.md', summary: 'A simple leek soup.', body: 'Leeks, potatoes and stock.' } }); });
    const replies = [plain, noted];
    const calls: ClaudeCall[] = [];
    const respond = phaseAwareClaude((_call, _step, attempt, phase) => ({ code: 0, stderr: '', cut: null, stdout: replies[phase === 'selection' ? replies.length - 1 : attempt] ?? noted }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => { calls.push(call); return respond(call); };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn })).toBe(0);

    expect(calls).toHaveLength(3);
    expect(calls[2]?.input).toMatch(/refused/);
    expect(calls[2]?.input).toMatch(/no note/);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);

    // Selection plus two execution attempts: exhausted items stay untouched for the next run.
    const again = await wired(false, true);
    const stuck: ClaudeCall[] = [];
    const respondStuck = phaseAwareClaude(() => ({ code: 0, stderr: '', cut: null, stdout: plain }),
      () => ({ drive: again.wire.drive, root: again.wire.folderId, admission: again.wire.manifest }));
    const never = async (call: ClaudeCall): Promise<ClaudeExit> => { stuck.push(call); return respondStuck(call); };
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: again.wire.fetch, claude: never })).toBe(0);
    expect(stuck).toHaveLength(3);
    expect(again.wire.statuses.at(-1)?.phase).toBe('done');
    await expectLeavesForNextRun(again.wire);
  });

  it('a thing cited by a Timeline line on an existing note needs no note', async () => {
    const { wire } = await wired(true, true);
    const id = (await wire.drive.listAll(wire.folderId)).find((f) => f.name === 'Leek soup.txt')?.id ?? '';
    const cited = edited((m) => {
      (m.things as unknown[]).push({ fileId: id, to: 'Resources', name: 'Leek soup.txt' });
      m.lines = [{ note: 'Projects/Flat hunt/Flat hunt.md', text: 'Matches what this note already says.', cites: id }];
    });
    const claude = recordedClaude({ stdout: cited }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);

    expect(claude.calls).toHaveLength(2);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
  });

  it('a photo with no text needs no note', async () => {
    const { wire } = await wired();
    const photo = edited((m) => { m.things = (m.things as Array<{ fileId: string }>).filter((t) => t.fileId === 'f14'); });
    const claude = recordedClaude({ stdout: photo }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);

    expect(claude.calls).toHaveLength(2);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
  });

  it('a second refusal ends the run honestly', async () => {
    const { wire } = await wired();
    const newArea = edited((m) => { for (const t of (m.things as Array<{ to: string }>).slice(0, 1)) t.to = 'Projects/Community garden'; });
    const calls: ClaudeCall[] = [];
    const respond = phaseAwareClaude(() => ({ code: 0, stderr: '', cut: null, stdout: newArea }),
      () => ({ drive: wire.drive, root: wire.folderId, admission: wire.manifest }));
    const spawn = async (call: ClaudeCall): Promise<ClaudeExit> => { calls.push(call); return respond(call); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = await wire.drive.listAll(wire.folderId);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: spawn })).toBe(0);

    // Selection plus two execution attempts; untouched sources stay in the inbox.
    expect(calls).toHaveLength(3);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    await expectLeavesForNextRun(wire);
    expect(wire.requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    const after = await wire.drive.listAll(wire.folderId);
    expect(after.filter((f) => !wire.drive.pathOf(f.id, wire.folderId).startsWith('.bower/')))
      .toEqual(before.filter((f) => !wire.drive.pathOf(f.id, wire.folderId).startsWith('.bower/')));
  });

  it('a recorded Claude reply becomes operations the spine validates', async () => {
    const { wire, admission } = await wired();
    const claude = recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);

    expect(claude.calls).toHaveLength(2);
    // The prepared context went in: the admitted set it took, never an instruction to touch Drive itself.
    expect(claude.calls[0]?.input).toContain(admission.id);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    // The spine applied the reply's operations: every thing it took left the inbox, and the report says so.
    const items = admission.piles.flatMap((p) => p.items.filter((i) => i.name !== PILE_NOTE).map((i) => i.fileId));
    const inbox = (await wire.drive.listAll(wire.folderId)).find((f) => f.name === 'Inbox')?.id;
    for (const id of items) expect((await wire.drive.evidence(id))?.file.parents).not.toContain(inbox);
    expect(wire.requests.filter((r) => r.method === 'PATCH').length).toBeGreaterThanOrEqual(items.length);
  });

  it('a malformed or out-of-schema Claude reply fails truthfully and writes nothing', async () => {
    const replies: Array<[string, Partial<ClaudeExit> & { stdout: string }]> = [
      ['prose instead of JSON', { stdout: recorded('reply-prose.json') }],
      ['the turn cap reached', { stdout: recorded('reply-max-turns.json') }],
      ['not a result at all', { stdout: 'Error: something went wrong', code: 1 }],
      ['cut at the size cap', { stdout: recorded('reply-ok.json'), cut: 'size' }],
      ['a run manifest instead of intent', { stdout: recorded('reply-manifest.json') }],
      ['intent of another version', { stdout: edited((m) => (m.v = 2)) }],
      ['a thing placed twice', { stdout: edited((m) => (m.things as unknown[]).push((m.things as unknown[])[0])) }],
      ['a name past the app\'s longest', { stdout: edited((m) => {
        for (const t of (m.things as Array<{ name: string }>).slice(0, 1)) t.name = `${'P'.repeat(121)}.pdf`;
      }) }],
      ['a name with a bidi control', { stdout: edited((m) => {
        for (const t of (m.things as Array<{ name: string }>).slice(0, 1)) t.name = 'Payslip \u202Efdp.pdf';
      }) }],
      ['a folder part with a trailing space', { stdout: edited((m) => {
        for (const t of (m.things as Array<{ to: string }>).slice(0, 1)) t.to = 'Areas/Money ';
      }) }],
      ['a folder part with a bidi control', { stdout: edited((m) => {
        for (const t of (m.things as Array<{ to: string }>).slice(0, 1)) t.to = 'Areas/\u2067Money';
      }) }],
      ['a name that turns a PDF into a picture', { stdout: edited((m) => {
        for (const t of (m.things as Array<{ name: string }>).slice(0, 1)) t.name = 'Payslip.jpg';
      }) }],
    ];
    for (const [what, reply] of replies) {
      const { wire } = await wired();
      const before = await wire.drive.listAll(wire.folderId);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude(reply, { drive: wire.drive, root: wire.folderId, admission: wire.manifest }).spawn }), what).toBe(0);

      // Truthful: the run ends failed, saying nothing changed, and nothing did.
      expect(wire.statuses.map((s) => s.phase), what).toEqual(['reading', 'writing', 'failed']);
      expect(wire.statuses.at(-1)?.failure, what).toBe(B_FAILURE);
      expect(wire.requests.filter((r) => r.method !== 'GET'), what).toEqual([]);
      expect(await wire.drive.listAll(wire.folderId), what).toEqual(before);
      expect(errors, what).toHaveBeenCalled();
      errors.mockRestore();
    }
  });

  it('the runner logs one timing line per run with the Claude reply\'s numbers', async () => {
    const { wire } = await wired();
    const said: string[] = [];
    const keep = (...args: unknown[]): void => void said.push(args.map(String).join(' '));
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation(keep);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest }).spawn })).toBe(0);

    const lines = said.filter((l) => l.startsWith('timing:'));
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';
    expect(line.length).toBeLessThan(460);
    // Numbers and phase names only: every field is name=number, but how the run ended.
    const fields = Object.fromEntries(line.replace(/^timing: /, '').split(' ').map((f) => f.split('=') as [string, string]));
    expect(Object.keys(fields)).toEqual(['end', 'total', 'start', 'token', 'reads', 'model', 'api', 'turns', 'in', 'out', 'input', 'sections', 'apply', 'checkpoints', 'report', 'status', 'drive', 'region']);
    expect(fields.end).toBe('done');
    for (const [name, value] of Object.entries(fields)) if (name !== 'end') expect(value, name).toMatch(name === 'checkpoints' ? /^\d+\/[1-9]\d*$/ : name === 'drive' ? /^(?:\w+:\d+\/\d+,?)+$/ : name === 'region' ? /^[\w-]+$/ : name === 'input' ? /^[0-9a-f]{12}$/ : name === 'sections' ? /^prompt:[0-9a-f]{6},tree:[0-9a-f]{6},things:[0-9a-f]{6},notes:[0-9a-f]{6}(?:,rules:[0-9a-f]{6})?$/ : /^\d+$/);
    // Both semantic calls return this recorded usage: sum wall/API time, turns and tokens.
    expect(fields).toMatchObject({ model: '82500', api: '81960', turns: '2', in: '10240', out: '7780' });
    expect(line).not.toContain(TOKEN);
    // No path or content: no folder or file name from the run.
    expect(line).not.toMatch(/Inbox|Payslip|Dentist|Flat photos|\.pdf|\.jpg/);
  });

  it('the timing line counts cache-read input tokens', async () => {
    const { wire } = await wired();
    const said: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void said.push(args.map(String).join(' ')));
    // A later turn reads most of its prompt from the cache: those tokens are input too.
    const envelope = JSON.parse(recorded('reply-ok.json')) as { usage: Record<string, number> };
    envelope.usage = { ...envelope.usage, input_tokens: 120, cache_creation_input_tokens: 1000, cache_read_input_tokens: 4000 };

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude({ stdout: JSON.stringify(envelope) }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest }).spawn })).toBe(0);

    const line = said.find((l) => l.startsWith('timing:')) ?? '';
    expect(line).toMatch(/ in=10240 /);
  });

  it('the Claude provider runs under the original permission policy and never logs the token', async () => {
    const { wire } = await wired();
    const said: string[] = [];
    const keep = (...args: unknown[]): void => void said.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation(keep);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (said.push(String(chunk)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (said.push(String(chunk)), true));
    // A failing reply that echoes the credential on both streams: still never repeated.
    const claude = recordedClaude({ stdout: `{"type":"result","subtype":"error_during_execution","is_error":true,"result":"bad ${TOKEN}"}`, stderr: `auth with ${TOKEN} failed`, code: 1 }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });

    const env = { BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), GITHUB_ACTIONS: 'true', HOME: '/home/runner', PATH: '/usr/bin', BOWER_API_KEY: 'not-for-claude', ...claudeEnv() };
    expect(await main(env, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);
    expect(wire.statuses.at(-1)?.phase).toBe('failed');

    const call = claude.calls[0];
    expect(call?.command).toBe('claude');
    const args = call?.args ?? [];
    const flag = (name: string): string | undefined => args[args.indexOf(name) + 1];
    expect(args[0]).toBe('-p');
    expect(flag('--output-format')).toBe('json');
    // Model and turn cap from the environment; the start is Sonnet and the original's DEFAULT_MAX_TURNS.
    expect(flag('--model')).toBe('claude-sonnet-5-5');
    expect(flag('--max-turns')).toBe('60');
    // No tool at all (so no Drive, no write, no shell), no MCP server, and nothing that may ask.
    expect(flag('--tools')).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(flag('--permission-mode')).toBe('dontAsk');
    // The original's settings (agent/claude-settings.json), its deny list kept, with every tool that writes, runs a
    // shell or reaches the network denied too.
    const settings = JSON.parse(flag('--settings') ?? '{}') as { permissions: { blockReadsOutsideWorkingDirectories: boolean; deny: string[] } };
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    for (const rule of ['Write(**/CLAUDE.md)', 'Edit(.claude/**)', 'Bash(*://*)', 'Read(../**)', 'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task']) {
      expect(settings.permissions.deny).toContain(rule);
    }
    // The credential reaches claude through its own small environment only: never in an argument or the input.
    expect(call?.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(Object.keys(call?.env ?? {}).sort()).toEqual(['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'GITHUB_ACTIONS', 'HOME', 'PATH']);
    expect(args.join(' ')).not.toContain(TOKEN);
    expect(call?.input).not.toContain(TOKEN);
    // Nothing said anywhere repeats it.
    expect(said.length).toBeGreaterThan(0);
    expect(said.filter((line) => line.includes(TOKEN))).toEqual([]);

    // The model and the turn cap are the environment's when it sets them.
    const other = await wired();
    const set = recordedClaude({ stdout: recorded('reply-prose.json') }, { drive: other.wire.drive, root: other.wire.folderId, admission: other.wire.manifest });
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv({ BOWER_MODEL: 'claude-opus-5-5', BOWER_MAX_TURNS: '12' }) }, { fetch: other.wire.fetch, claude: set.spawn });
    const setArgs = set.calls[0]?.args ?? [];
    expect(setArgs[setArgs.indexOf('--model') + 1]).toBe('claude-opus-5-5');
    expect(setArgs[setArgs.indexOf('--max-turns') + 1]).toBe('12');
  });
});

/** The scripted provider's reads over the pretend Drive, as the runner makes them over Drive v3 (`runnerScripted`). */
function fakeScripted(drive: FakeDrive): ScriptedRead {
  const reads = fakeRead(drive);
  return { ...reads, piles: (rootId) => listedPiles(reads, rootId), provenance: 'fake-stored' };
}

/** Runs the same folder through the scripted provider and the Claude provider (on a recorded reply). */
async function both(drive: FakeDrive, root: string, took: Admitted, reply: string): Promise<{ scripted: RunManifest; claude: RunManifest; calls: ClaudeCall[] }> {
  const run = { rootId: root, runId: RUN_ID, allowWeb: false };
  const claude = recordedClaude({ stdout: reply }, { drive, root, admission: took.taken });
  const scripted = await scriptedProvider(fakeScripted(drive), run)(took);
  const planned = await claudeProvider({ env: claudeEnv(), spawn: claude.spawn }, run, fakeScripted(drive))(took);
  return { scripted, claude: planned, calls: claude.calls };
}

/** One recorded reply through `main` on Alex's folder: it must end failed, saying nothing changed, with no write. */
async function refusedWhole(what: string, stdout: string, before?: (wire: DriveV3, root: string) => Promise<void>): Promise<void> {
  const { wire, root } = await wired();
  await before?.(wire, root);
  const listed = await wire.drive.listAll(wire.folderId);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude({ stdout }, { drive: wire.drive, root, admission: wire.manifest }).spawn }), what).toBe(0);
  expect(wire.statuses.map((s) => s.phase), what).toEqual(['reading', 'writing', 'failed']);
  expect(wire.statuses.at(-1)?.failure, what).toBe(B_FAILURE);
  expect(wire.requests.filter((r) => r.method !== 'GET'), what).toEqual([]);
  expect(await wire.drive.listAll(wire.folderId), what).toEqual(listed);
  expect(errors, what).toHaveBeenCalled();
  errors.mockRestore();
}

/** A recorded intent with `things` replaced. */
const intent = (things: unknown[], extra: Record<string, unknown> = {}): string =>
  edited((m) => Object.assign(m, { things, ...extra }));

describe('the Claude provider contract (TL-P4-01 P4-2)', () => {
  it('the Claude provider passes the scripted provider contract fixtures', async () => {
    // The folder with the demo's cases: the same intent the scripted plan carries files every thing and writes the
    // note from words exactly as the scripted plan does; the demo's own extras (hub lines, the offer's own note) are
    // the script's stand-in, never the model's, so they are left out (the next test).
    const seeded = await wired(true);
    const took = { taken: seeded.admission, deferred: [] };
    const onRich = await both(seeded.wire.drive, seeded.root, took, recorded('reply-rich.json'));
    const filed = (m: RunManifest): unknown[] => m.operations.flatMap((o) => (o.effect.kind === 'move' && o.effect.properties.bowerNew === '1' ? [[o.effect.before.fileId, o.effect.name]] : o.effect.kind === 'bin' ? [[o.effect.before.fileId]] : []));
    // The script keeps the payslip's name "(2)"; a model's reply gives it a plain one (the naming rule, addendum 5).
    const plain = (f: unknown): unknown => ((f as string[])[1] === 'Payslip August (2).pdf' ? [(f as string[])[0], 'Payslip August.pdf'] : f);
    expect(filed(onRich.claude)).toEqual(filed(onRich.scripted).filter((f) => !['f16', 'f18'].includes(String((f as string[])[0]))).map(plain));
    const { piles, members, journal } = onRich.scripted.capture;
    expect(onRich.claude.capture).toMatchObject({ piles, members, journal });
    const notes = (m: RunManifest): string[] => m.operations.flatMap((o) => (o.effect.kind === 'create-text' ? [o.effect.name] : []));
    expect(notes(onRich.claude)).toEqual(notes(onRich.scripted).filter((n) => n !== 'Industrial Designer, Ferrowick.md'));
    // Deterministic, as the scripted provider is: the same folder and reply give the same plan.
    expect(await claudeProvider({ env: claudeEnv(), spawn: recordedClaude({ stdout: recorded('reply-rich.json') }, { drive: seeded.wire.drive, root: seeded.wire.folderId, admission: seeded.wire.manifest }).spawn }, { rootId: seeded.root, runId: RUN_ID, allowWeb: false }, fakeScripted(seeded.wire.drive))(took)).toEqual(onRich.claude);

    // Alex's folder (main.test.ts's): the same, and the spine runs it to done.
    const { wire, admission } = await wired();
    const onAlex = await both(wire.drive, wire.folderId, { taken: admission, deferred: [] }, recorded('reply-ok.json'));
    // The same effects and capture, but for the payslip's plain name (the script keeps "(2)"), so their ids and hashes differ.
    const effects = (m: RunManifest): unknown => JSON.parse(JSON.stringify(m.operations.map((o) => o.effect).filter((e) => !('name' in e && e.name === 'hashes.json'))).split('Payslip August (2).pdf').join('Payslip August.pdf'));
    expect(effects(onAlex.claude)).toEqual(effects(onAlex.scripted));
    expect(onAlex.claude.capture).toEqual(onAlex.scripted.capture);
    const ran = await wired();
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: ran.wire.fetch, claude: recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: ran.wire.drive, root: ran.wire.folderId, admission: ran.wire.manifest }).spawn })).toBe(0);
    expect(ran.wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);

    // A thing the reply leaves out waits with its whole pile: the plan is the scripted one without that pile.
    const left = await wired();
    const partial = intent([{ fileId: 'f10', to: 'Areas/Money/Payslips', name: 'Payslip August.pdf' }]);
    const run = { rootId: left.wire.folderId, runId: RUN_ID, allowWeb: false };
    const planned = await claudeProvider({ env: claudeEnv(), spawn: recordedClaude({ stdout: partial }, { drive: left.wire.drive, root: left.root, admission: left.admission }).spawn }, run, fakeScripted(left.wire.drive))({ taken: left.admission, deferred: [] });
    expect(planned.capture.piles.map((p) => p.pileId)).toEqual(['p-payslip']);
    const alone = await scriptedProvider(fakeScripted(left.wire.drive), run)({ taken: { ...left.admission, piles: left.admission.piles.filter((p) => p.pileId === 'p-payslip') }, deferred: [] });
    expect(effects(planned)).toEqual(effects(alone));
  });

  it('a write the two runner lists judged differently is judged once by RUNNER_WRITES', async () => {
    // One list (TL-P4-14 addendum 20), on the provider's run path (TL-P4-17): the manifest contract and the runner's
    // admitted check judge Bower's own writes by the same files.
    const { wire, admission } = await wired();
    const own = (await wire.drive.listAll(wire.folderId)).find((f) => f.name === SYSTEM.dir)?.id ?? '';
    // suggestions.json and last-run.json there in Bower's own folder: the manifest contract never admitted a write to them.
    const files: Record<string, string> = { 'suggestions.json': '{ "v": 1, "suggestions": [] }', 'last-run.json': '{}', 'requests.json': '{ "v": 1, "done": [] }', 'hashes.json': '{ "v": 1, "hashes": {} }' };
    for (const [name, text] of Object.entries(files)) await wire.drive.createText(own, name, `${text}\n`);
    const listing = await wire.drive.listAll(wire.folderId);
    const run = { rootId: wire.folderId, runId: RUN_ID, allowWeb: false };
    const took = { taken: admission, deferred: [] };
    const planned = await claudeProvider({ env: claudeEnv(), spawn: recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest }).spawn }, run, fakeScripted(wire.drive))(took);
    // The run's own writes pass both checks, and each one names a file on the list.
    const writes = planned.operations.flatMap(({ effect: e }) => (e.kind === 'write-runner-json' ? [e.path] : []));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.filter((path) => !(RUNNER_WRITES as readonly string[]).includes(path))).toEqual([]);
    const writing = async (name: string): Promise<RunManifest> => {
      const f = listing.find((x) => x.name === name && x.parents.includes(own));
      if (!f) throw new Error(`no ${name}`);
      const content = { encoding: 'utf8' as const, size: 3, sha256: 'a'.repeat(64), provenance: 'fake-stored' as const, observedModifiedTime: f.modifiedTime };
      const effect = { kind: 'write-runner-json' as const, before: { fileId: f.id, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime }, beforeContent: content, path: `${SYSTEM.dir}/${name}` as RunnerWrite, text: '{}', content: { encoding: 'utf8' as const, size: 2, sha256: createHash('sha256').update('{}').digest('hex') } };
      const ordinal = planned.operations.length;
      const operationId = await hash({ runId: planned.runId, captureId: planned.captureId, ordinal, effect });
      return { ...planned, operations: [...planned.operations, { operationId, ordinal, dependsOn: [], effect }] };
    };
    const names = ['questions.json', 'requests.json', 'hashes.json', 'suggestions.json', 'last-run.json'];
    const admitted: Record<string, string | null> = {};
    const contract: Record<string, string> = {};
    for (const name of names) {
      const m = await writing(name);
      admitted[name] = outsideAdmitted(m, took, own);
      const parsed = await parseRunManifestV2((await canonical(m)).bytes, wire.folderId, RUNNER_WRITES);
      contract[name] = parsed.ok ? 'ok' : parsed.reason;
    }
    const not = "a write to a file that is not Bower's own";
    expect({ admitted, contract }).toEqual({
      admitted: { 'questions.json': null, 'requests.json': null, 'hashes.json': null, 'suggestions.json': not, 'last-run.json': not },
      contract: { 'questions.json': 'ok', 'requests.json': 'ok', 'hashes.json': 'ok', 'suggestions.json': 'shape', 'last-run.json': 'shape' },
    });
    // TL-P4-47 Q1: the type table uses the existing runner allowlist and effect.
    expect(RUNNER_WRITES).toEqual([SYSTEM.questions, SYSTEM.requests, SYSTEM.hashes, SYSTEM.retrieval, SYSTEM.index, SYSTEM.hot, SYSTEM.log, '.bower/type-table.json']);
  });

  it('a Claude reply that targets a thing not admitted is refused and writes nothing', async () => {
    const { wire, admission } = await wired();
    const listing = await wire.drive.listAll(wire.folderId);
    const id = (name: string): string => listing.find((f) => f.name === name)?.id ?? `no ${name}`;
    const ok = (JSON.parse((JSON.parse(recorded('reply-ok.json')) as { result: string }).result) as { things: unknown[] }).things;
    const note = admission.piles.flatMap((p) => p.items).find((i) => i.name === PILE_NOTE)?.fileId ?? '';
    expect(note).not.toBe('');
    // The recorded manifest reply with one more operation, its hashes made again: a Bin of Resources, never admitted.
    const resources = id('Resources');
    const binsResources = await rehashed((t) => {
      const m = JSON.parse(t) as RunManifest;
      m.operations.push({ operationId: 'x', ordinal: m.operations.length, dependsOn: [], effect: { kind: 'bin', before: { fileId: resources, name: 'Resources', parents: [wire.folderId], folder: true, modifiedTime: listing.find((f) => f.id === resources)?.modifiedTime ?? '' }, capturedChildIds: [] } });
      return JSON.stringify(m);
    });
    const cases: Array<[string, string]> = [
      ['a manifest that bins Resources', binsResources],
      ['an intent that bins Resources', intent(ok, { bin: [resources] })],
      ['Resources filed as a thing', intent([...ok, { fileId: resources, to: 'Archive', name: 'Resources' }])],
      ['the inbox filed as a thing', intent([...ok, { fileId: id('Inbox'), to: 'Archive', name: 'Inbox' }])],
      ["Bower's questions moved", intent([...ok, { fileId: id('questions.json'), to: 'Archive', name: 'questions.json' }])],
      ['a pile note filed as a thing', intent([...ok, { fileId: note, to: 'Archive', name: 'Pile note.md' }])],
      ['a pile not admitted', intent(ok, { notes: [{ pileId: 'p-other', to: 'Resources', name: 'Other.md' }] })],
      ['a thing filed in the inbox', intent([{ ...(ok[0] as object), to: 'Inbox' }, ...ok.slice(1)])],
      ["a thing filed in Bower's own files", intent([{ ...(ok[0] as object), to: '.bower/changes' }, ...ok.slice(1)])],
      ['a thing filed at the top', intent([{ ...(ok[0] as object), to: '' }, ...ok.slice(1)])],
      ['a thing filed up and out', intent([{ ...(ok[0] as object), to: 'Areas/../..' }, ...ok.slice(1)])],
    ];
    // Rules.md and a note outside the plan, there in the folder but never admitted.
    let rules = '';
    let other = '';
    const made = async (w: DriveV3, root: string): Promise<void> => {
      rules = (await w.drive.createText(root, 'Rules.md', '# Rules\n')).id;
      const areas = (await w.drive.listAll(root)).find((f) => f.name === 'Areas')?.id ?? root;
      other = (await w.drive.createText(areas, 'Car.md', 'My car.\n')).id;
    };
    for (const [what, stdout] of cases) await refusedWhole(what, stdout);
    // Their ids are known once made: the pretend Drive gives the same ids to the same folder made the same way.
    const probe = await wired();
    await made(probe.wire, probe.wire.folderId);
    for (const [what, fileId, name] of [['Rules.md filed as a thing', rules, 'Rules.md'], ['a note outside the plan filed', other, 'Car.md']] as const) {
      await refusedWhole(what, intent([...ok, { fileId, to: 'Archive', name }]), made);
    }

    // The runner's own check on every plan it builds: nothing but what the run took, Bower's files, and its marks.
    const run = { rootId: wire.folderId, runId: RUN_ID, allowWeb: false };
    const took = { taken: admission, deferred: [] };
    const planned = await scriptedProvider(fakeScripted(wire.drive), run)(took);
    const own = id('.bower');
    expect(outsideAdmitted(planned, took, own)).toBeNull();
    const seen = (f: (typeof listing)[number]) => ({ fileId: f.id, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime });
    const res = listing.find((f) => f.id === resources);
    if (!res) throw new Error('no Resources');
    const plus = (effect: RunManifest['operations'][number]['effect']): RunManifest => ({ ...planned, operations: [...planned.operations, { operationId: 'x', ordinal: planned.operations.length, dependsOn: [], effect }] });
    expect(outsideAdmitted(plus({ kind: 'bin', before: seen(res), capturedChildIds: [] }), took, own)).toMatch(/Bin/);
    expect(outsideAdmitted(plus({ kind: 'move', before: seen(res), parent: { fileId: id('Archive') }, name: 'Resources', properties: {} }), took, own)).toMatch(/move/);
    expect(outsideAdmitted(plus({ kind: 'move', before: seen(res), parent: { fileId: wire.folderId }, name: 'Resources', properties: { bowerNew: '1' } }), took, own)).toMatch(/move/);
    // A runner-JSON write only to Bower's own files: never one that names a note somewhere else.
    const questions = listing.find((f) => f.name === 'questions.json');
    if (!questions) throw new Error('no questions.json');
    const content = { encoding: 'utf8' as const, size: 1, sha256: 'a'.repeat(64), provenance: 'fake-stored' as const, observedModifiedTime: questions.modifiedTime };
    const json = { kind: 'write-runner-json' as const, path: '.bower/questions.json' as const, beforeContent: content, text: '{}', content: { encoding: 'utf8' as const, size: 2, sha256: 'b'.repeat(64) } };
    expect(outsideAdmitted(plus({ ...json, before: { ...seen(questions), parents: [id('Areas')] } }), took, own)).toMatch(/Bower's own/);
    expect(outsideAdmitted(plus({ ...json, before: seen(questions) }), took, own)).toBeNull();
  });

  it('the runner computes ids and digests, never the model', async () => {
    // A reply that brings its own id, hash or digest is refused whole: only the runner makes them.
    const ok = (JSON.parse((JSON.parse(recorded('reply-ok.json')) as { result: string }).result) as { things: Array<Record<string, unknown>> }).things;
    const first = ok[0] ?? {};
    const sha = 'a'.repeat(64);
    for (const [what, stdout] of [
      ['an operation id', intent([{ ...first, operationId: sha }, ...ok.slice(1)])],
      ['a content hash', intent([{ ...first, sha256: sha }, ...ok.slice(1)])],
      ['a capture id', intent(ok, { captureId: sha })],
      ['its own operations', intent(ok, { operations: [] })],
    ] as const) await refusedWhole(`a reply with ${what}`, stdout);

    // The plan from an intent: every id and digest is the runner's, made as the planner makes them.
    const { wire, admission } = await wired();
    const { claude, calls } = await both(wire.drive, wire.folderId, { taken: admission, deferred: [] }, recorded('reply-ok.json'));
    // The model is asked for no id or digest, and shown none.
    expect(calls[0]?.input).not.toMatch(/[a-f0-9]{64}/);
    expect(claude.captureId).toBe(await hash({ scope: claude.scope, runScope: claude.runScope, capture: claude.capture }));
    for (const op of claude.operations) expect(op.operationId).toBe(await hash({ runId: claude.runId, captureId: claude.captureId, ordinal: op.ordinal, effect: op.effect }));
    for (const m of claude.capture.members) expect({ size: m.content.size, sha256: m.content.sha256 }).toEqual(await wire.drive.storedDigest(m.file.fileId));
    // Create keys are minted from the run id (`runKeys`), never taken from a reply.
    const base = (await runKeys(RUN_ID))('k').slice('k-'.length, -4);
    const creates = claude.operations.flatMap((o) => ('createKey' in o.effect ? [o.effect.createKey] : []));
    expect(creates.length).toBeGreaterThan(0);
    for (const key of creates) expect(key).toMatch(new RegExp(`^[a-z]+-${base}[0-9a-f]{4}$`));
  });

  it('claude runs with no checkout or home settings and the secret only reaches the claude step', async () => {
    const { wire } = await wired();
    const claude = recordedClaude({ stdout: recorded('reply-ok.json') }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest });
    const env = { BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), HOME: '/home/runner', PATH: '/usr/bin', ...claudeEnv() };
    expect(await main(env, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);
    const call = claude.calls[0];
    const args = call?.args ?? [];
    // No user, project or local settings, so no CLAUDE.md, hooks or rules from the checkout or the home folder.
    expect(args).toContain('--setting-sources');
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as { claudeMdExcludes?: string[]; autoMemoryEnabled?: boolean; disableAllHooks?: boolean };
    expect(settings.claudeMdExcludes).toEqual(expect.arrayContaining(['**/CLAUDE.md', '**/CLAUDE.local.md']));
    expect(settings.autoMemoryEnabled).toBe(false);
    expect(settings.disableAllHooks).toBe(true);
    // Its home and config are an empty folder of the run's own, outside the checkout, gone once it answered.
    const home = call?.env.HOME ?? '';
    expect(home).not.toBe('/home/runner');
    expect(home.startsWith(tmpdir())).toBe(true);
    expect(call?.env.CLAUDE_CONFIG_DIR).toBe(join(home, '.claude'));
    expect(call?.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
    expect(call?.cwd.startsWith(process.cwd())).toBe(false);
    expect(join(call?.cwd ?? '', '..')).toBe(join(home, '..'));
    expect(existsSync(home)).toBe(false);
    expect(existsSync(call?.cwd ?? '')).toBe(false);

    // tidy.yml: the secret is read in one place, the env of the one step that runs when the provider is claude.
    const tidy = readFileSync(new URL('../workflows/tidy.yml', import.meta.url), 'utf8');
    const [head = '', ...steps] = tidy.split(/\n(?= {6}- )/);
    expect(head).not.toMatch(/secrets\./);
    const secret = steps.filter((s) => /secrets\./.test(s));
    expect(secret).toHaveLength(1);
    expect(secret[0]).toMatch(/\n {8}if: vars\.BOWER_PROVIDER == 'claude'\n/);
    expect(secret[0]).toMatch(/\n {10}CLAUDE_CODE_OAUTH_TOKEN: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}\n/);
    // Every other step that runs the runner runs only when the provider is not claude.
    const others = steps.filter((s) => s.includes('runner.mjs') && !/secrets\./.test(s));
    expect(others).toHaveLength(1);
    expect(others[0]).toMatch(/\n {8}if: vars\.BOWER_PROVIDER != 'claude'\n/);
  });
});

describe('the Claude provider writes only what it proposed (P4-2 review I1)', () => {
  it('a Claude run writes no hub line or demo extra it did not propose', async () => {
    // Alex's folder with Bower's own Job hunt hub, a Saltmere pile and one of each journal line the script acts on;
    // the reply files the payslip only. The demo's hub lines, own notes, questions and request answers are the
    // scripted stand-in's, never this reply's: none of them is written.
    const { wire, root } = await wired(true);
    const listing = await wire.drive.listAll(root);
    const jobHunt = listing.find((f) => f.name === 'Job hunt.md');
    const flatHunt = listing.find((f) => f.name === 'Flat hunt.md');
    if (!jobHunt || !flatHunt) throw new Error('no hub notes');
    const hubText = { job: await wire.drive.readText(jobHunt.id), flat: await wire.drive.readText(flatHunt.id) };
    const offer = { fileId: 'f20', to: 'Projects/Job hunt/Applications', name: 'Offer, Industrial Designer, Ferrowick.pdf' };
    const ok = (JSON.parse((JSON.parse(recorded('reply-ok.json')) as { result: string }).result) as { things: unknown[] }).things;
    // The offer filed exactly as the demo's plan would, the listing too: still no extra of the demo's.
    const reply = intent([...ok, offer, { fileId: 'f19', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' }], { notes: [{ pileId: 'p-garden', to: 'Resources/Ideas', name: 'Garden ideas.md' }] });
    const run = { rootId: root, runId: RUN_ID, allowWeb: true };
    const planned = await claudeProvider({ env: claudeEnv(), spawn: recordedClaude({ stdout: reply }, { drive: wire.drive, root: wire.folderId, admission: wire.manifest }).spawn }, run, fakeScripted(wire.drive))({ taken: (await wired(true)).admission, deferred: [] });
    expect(planned.operations.filter((o) => o.effect.kind === 'edit-text')).toEqual([]);
    const made = planned.operations.flatMap((o) => (o.effect.kind === 'create-text' ? [o.effect.name] : []));
    expect(made).not.toContain('Industrial Designer, Ferrowick.md');
    expect(made).toEqual(expect.arrayContaining(['Flat 9, Wrenfield Road.md', 'Garden ideas.md']));
    expect(planned.operations.filter((o) => o.effect.kind === 'write-runner-json' && o.effect.path === '.bower/questions.json')).toEqual([]);
    const said = JSON.stringify(planned.reportPlan);
    expect(said).not.toMatch(/Ferrowick, scored|fourth flat|Saltmere/);

    // Through the runner: the hub notes are as they were, and Bower asked nothing.
    const ran = await wired(true);
    const questions = (await ran.wire.drive.listAll(ran.root)).find((f) => f.name === 'questions.json');
    const asked = questions ? await ran.wire.drive.readText(questions.id) : '';
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: ran.wire.fetch, claude: recordedClaude({ stdout: reply }, { drive: ran.wire.drive, root: ran.wire.folderId, admission: ran.wire.manifest }).spawn })).toBe(0);
    expect(ran.wire.statuses.at(-1)?.phase).toBe('done');
    expect(await ran.wire.drive.readText(jobHunt.id)).toBe(hubText.job);
    expect(await ran.wire.drive.readText(flatHunt.id)).toBe(hubText.flat);
    expect(questions ? await ran.wire.drive.readText(questions.id) : '').toBe(asked);
  });
});
