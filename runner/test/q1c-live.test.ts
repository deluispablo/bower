import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import p2Manifest from '../../src/data/contracts/fixtures/p2/run-manifest.json';
import p2Checkpoints from '../../src/data/contracts/fixtures/p2/run-checkpoint.json';
import p2Report from '../../src/data/contracts/fixtures/p2/run-report.json';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, parseRunReport } from '../../src/data/contracts/run-checkpoint';
import { stateMark } from '../../src/data/contracts/note-edit';
import { canonicalRecordJson } from '../../src/data/contracts/record-json';
import { isQuestionSnapshot, publicQuestion } from '../../src/data/contracts/questions';
import type { Question } from '../../src/data/types';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import { main } from '../src/main';
import { API, TICKET, driveV3 } from './drive-v3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { ORIGIN, realWorld } from './real-world';
import type { RealWorld } from './real-world-types';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {
  constructor(readonly ctx: unknown, readonly env: unknown) {}
} }));

const AT = Date.UTC(2026, 9, 10, 12);
const JSON_HEADERS = { 'content-type': 'application/json' };
interface PublicQuestion { id: string; text: string; askedAt: number }
interface StoredQuestion extends PublicQuestion {
  options?: Array<{ id: string; label: string; action: { kind: 'file-to'; folderId: string } }>;
}
interface Status { revision: number; run: { id: string; phase: string; questions?: PublicQuestion[] } | null }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function mixed(count = 1, withOptions = false, setup?: (w: RealWorld) => Promise<void>) {
  let clearId = '', waitingId = '', calls = 0;
  const waitingIds: string[] = [], folderIds: string[] = [];
  const model: ClaudeSpawn = async () => {
    calls++;
    const intent = { kind: 'tidy-intent', v: 1,
      things: [{ fileId: clearId, to: 'Resources', name: 'Clear.md' }],
      asks: waitingIds.map((fileId) => ({ fileId, text: 'Where should Alex keep this?', yes: 'In projects', no: 'Keep here',
        ...(withOptions ? { options: folderIds.slice(0, 2).map((folderId, i) => ({ folderId, label: `Place ${i + 1}` })) } : {}),
      })),
    };
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1, result: JSON.stringify(intent),
      usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
  const w = await realWorld({ claude: model, seed: async (drive) => {
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) folderIds.push((await drive.createFolder(root, name)).id);
    if (withOptions) {
      const projects = (await drive.createFolder(folderIds[0] ?? '', 'Made-up project')).id;
      const area = (await drive.createFolder(folderIds[1] ?? '', 'Made-up area')).id;
      folderIds.splice(0, folderIds.length, projects, area);
    }
    const sys = (await drive.createFolder(root, '.bower')).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', JSON.stringify({ v: 1, questions: [] }));
    clearId = (await drive.createText(inbox, 'Clear.md', 'Made-up clear words.', { pile: 'CLEAR' })).id;
    waitingId = (await drive.createText(inbox, 'Waiting.md', 'Made-up waiting words.', { pile: 'WAITING' })).id;
    waitingIds.push(waitingId);
    for (let i = 1; i < count; i++) {
      waitingIds.push((await drive.createText(inbox, `Waiting ${i + 1}.md`, `Made-up waiting words ${i + 1}.`, { pile: `WAITING_${i}` })).id);
    }
    return root;
  } });
  await setup?.(w);
  const lease = await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ place: 'Q1C_TAB', action: 'check', gen: 0 }) })).json() as { epoch: number };
  const res = await w.api.browser(`${ORIGIN}/process`, { method: 'POST',
    headers: { ...JSON_HEADERS, 'x-bower-place': 'Q1C_TAB', 'x-bower-epoch': String(lease.epoch) },
    body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'q1c-production-press-1' }) });
  expect(res.status).toBe(200);
  expect(w.dispatched).toHaveLength(1);
  const status = async (): Promise<Status> => await (await w.api.browser(`${ORIGIN}/status`)).json() as Status;
  return { w, clearId, waitingId, waitingIds, folderIds, model, status, calls: () => calls };
}

async function legacyRecords() {
  const bytes = (value: unknown): Uint8Array => {
    const result = canonicalRecordJson(value);
    expect(result.ok).toBe(true);
    return result.ok ? result.value : new Uint8Array();
  };
  const record = p2Manifest.files[0];
  expect(record).toBeDefined();
  if (!record) return;
  const parsed = await parseRunManifestV2(bytes(record.content), record.content.scope.rootId, RUNNER_WRITES);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.value).toEqual(record.content);
  const expected = { rootId: parsed.value.scope.rootId, runId: parsed.value.runId, captureId: parsed.value.captureId,
    manifestHash: parsed.sha256, operationIds: parsed.value.operations.map((o) => o.operationId) };
  for (const row of p2Checkpoints.files) {
    const checkpoint = await parseRunCheckpoint(bytes(row.content), expected);
    expect(checkpoint.ok).toBe(true);
    if (checkpoint.ok) expect(checkpoint.value).toEqual(row.content);
  }
  const report = p2Report.files[0];
  expect(report).toBeDefined();
  if (report) {
    const read = await parseRunReport(bytes(report.content), expected);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toEqual(report.content);
  }
}

describe('Q1c durable publication through main and createApp().request', () => {
  it('q1-live-snapshot-over-64kib-trims', async () => {
    const words = 'W'.repeat(7000);
    const { w, clearId, status } = await mixed(10, false, async (w) => {
      const files = await w.drive.listAll(w.rootId);
      const waiting = files.filter((f) => /^Inbox\/Waiting(?: \d+)?\.md$/.test(w.drive.pathOf(f.id, w.rootId)));
      expect(waiting).toHaveLength(10);
      for (const file of waiting) {
        const folder = await w.drive.createFolder(file.parents[0] ?? '', `Context ${file.id}`, file.appProperties);
        await w.drive.update(file.id, { addParent: folder.id, removeParent: file.parents[0] ?? '' });
        await w.drive.createText(folder.id, 'Pile note.md', words);
      }
    });
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
      .map((spy) => spy.mockImplementation(() => {}));
    const reports: Array<{ phase: string; questions?: Question[] }> = [];
    const bodies: string[] = [];
    const code = await w.runJob(0, async (url, init, next) => {
      if (url.origin === ORIGIN && url.pathname.endsWith('/status') && init.method === 'POST') {
        bodies.push(String(init.body));
        reports.push(JSON.parse(String(init.body)) as typeof reports[number]);
      }
      return next();
    });
    const files = await w.drive.listAll(w.rootId);
    const manifestFile = files.find((f) => /^manifest-.*\.json$/.test(f.name));
    expect(manifestFile).toBeDefined();
    const manifest = JSON.parse(await w.drive.readText(manifestFile?.id ?? '')) as {
      operations: Array<{ effect: { kind: string; path?: string; text?: string } }>;
    };
    const effect = manifest.operations.find(({ effect }) => effect.kind === 'write-runner-json'
      && effect.path === '.bower/questions.json')?.effect;
    expect(effect).toBeDefined();
    const planned = (JSON.parse(effect?.text ?? '{}') as { questions: Question[] }).questions;
    expect(planned).toHaveLength(10);
    expect(planned.every((q) => q.words === words)).toBe(true);
    const full = planned.map(publicQuestion);
    expect(isQuestionSnapshot(full)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify({ attempt: 1, seq: 3, phase: 'writing', questions: full }))
      .byteLength).toBeGreaterThan(64 * 1024);
    const expected = [...full].sort((a, b) => a.askedAt - b.askedAt).slice(0, 9);
    // Fresh askings share requestedAt; stable order breaks the tie, so the final card is removed first.
    expect(new Set(full.map((q) => q.askedAt)).size).toBe(1);
    expect(new TextEncoder().encode(JSON.stringify({ attempt: 1, seq: 3, phase: 'writing', questions: expected }))
      .byteLength).toBeLessThanOrEqual(64 * 1024);
    expect.soft(code).toBe(0);
    expect.soft((await status()).run?.phase).toBe('done');
    expect.soft(w.drive.pathOf(clearId, w.rootId)).toBe('Resources/Clear.md');
    const stored = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
    expect.soft(JSON.parse(await w.drive.readText(stored?.id ?? '')).questions).toEqual(planned);
    expect.soft((await status()).run?.questions).toEqual(expected);
    const publication = reports.findIndex((r) => r.questions !== undefined);
    expect.soft(publication).toBeGreaterThanOrEqual(0);
    const later = reports.slice(publication + 1);
    expect.soft(later.length).toBeGreaterThan(0);
    expect.soft(later.at(-1)?.phase).toBe('done');
    for (const report of reports.slice(Math.max(0, publication))) expect.soft(report.questions).toEqual(expected);
    for (const body of bodies) expect.soft(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(64 * 1024);
    const lines = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
      .filter((line) => /question|snapshot/i.test(line));
    expect.soft(lines).toHaveLength(1);
    expect.soft(lines[0] ?? '').toMatch(/omit|trim|left out/i);
    expect.soft(lines[0] ?? '').not.toContain('\n');
  });

  it('q1-live-publication-transport-failure-keeps-the-run', async () => {
    // Only Date is frozen; the fixture's zero-delay retry waits can resolve without waiting on real time.
    vi.useFakeTimers({ toFake: ['Date'] });
    const { w, clearId, status } = await mixed(2);
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
      .map((spy) => spy.mockImplementation(() => {}));
    const reports: Array<{ seq: number; phase: string; questions?: Question[] }> = [];
    const replies: number[] = [];
    let publicationSeq: number | undefined;
    const code = await w.runJob(0, async (url, init, next) => {
      if (url.origin !== ORIGIN || !url.pathname.endsWith('/status') || init.method !== 'POST') return next();
      const report = JSON.parse(String(init.body)) as typeof reports[number];
      reports.push(report);
      if (publicationSeq === undefined && report.questions?.length) publicationSeq = report.seq;
      if (report.seq === publicationSeq) {
        replies.push(503);
        return new Response(JSON.stringify({ error: { code: 'server-busy' } }), { status: 503, headers: JSON_HEADERS });
      }
      const response = await next();
      replies.push(response.status);
      return response;
    });
    const files = await w.drive.listAll(w.rootId);
    const manifestFile = files.find((f) => /^manifest-.*\.json$/.test(f.name));
    expect(manifestFile).toBeDefined();
    const manifest = JSON.parse(await w.drive.readText(manifestFile?.id ?? '')) as {
      operations: Array<{ effect: { kind: string; path?: string; text?: string } }>;
    };
    const effect = manifest.operations.find(({ effect }) => effect.kind === 'write-runner-json'
      && effect.path === '.bower/questions.json')?.effect;
    expect(effect).toBeDefined();
    const planned = (JSON.parse(effect?.text ?? '{}') as { questions: Question[] }).questions;
    expect(planned).toHaveLength(2);
    const expected = planned.map(publicQuestion).sort((a, b) => a.askedAt - b.askedAt);
    expect(isQuestionSnapshot(expected)).toBe(true);
    const failed = reports.filter((r) => r.seq === publicationSeq);
    expect(failed).toHaveLength(4);
    expect(failed.every((r) => r.phase === 'writing')).toBe(true);
    for (const report of failed) expect(report.questions).toEqual(expected);
    expect(replies.filter((s) => s === 503)).toHaveLength(4);
    expect.soft(code).toBe(0);
    expect.soft((await status()).run?.phase).toBe('done');
    expect.soft(w.drive.pathOf(clearId, w.rootId)).toBe('Resources/Clear.md');
    const stored = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
    expect.soft(JSON.parse(await w.drive.readText(stored?.id ?? '')).questions).toEqual(planned);
    const next = reports.findIndex((r) => publicationSeq !== undefined && r.seq > publicationSeq);
    expect.soft(next).toBeGreaterThanOrEqual(0);
    expect.soft(reports[next]?.questions).toEqual(expected);
    expect.soft(replies[next]).toBe(200);
    expect.soft(reports[next]?.phase).not.toBe('failed');
    expect.soft(reports.at(-1)?.phase).toBe('done');
    expect.soft((await status()).run?.questions).toEqual(expected);
    const lines = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
      .filter((line) => line.startsWith('Live question publication failed; the next status report will carry the snapshot again. '));
    expect.soft(lines).toHaveLength(1);
    expect.soft(lines[0] ?? '').toMatch(/503|publish|question|snapshot/i);
    expect.soft(lines[0] ?? '').not.toContain('\n');
  });

  it.each([
    { test: 'q1-live-question-long-note-name-publishes', name: 'N'.repeat(80), lines: ['Alex has two tasks.'] },
    // Empty shown text is accepted in storage, but is an invalid shape for the public card.
    { test: 'q1-live-question-invalid-shape-publishes', name: 'Tasks', lines: [''] },
  ])('$test', async ({ name, lines: shownLines }) => {
    let questionId = '', storedId = '', noteId = '';
    const noteText = `---\nsummary: Alex's tasks.\nby: bower\nbower_state: ${stateMark(['Alex had one task.'])}\n---\n\n## Current state\n- Alex changed this after the update was shown.\n`;
    const { w, clearId, status } = await mixed(1, false, async (w) => {
      const files = await w.drive.listAll(w.rootId);
      const resources = files.find((f) => w.drive.pathOf(f.id, w.rootId) === 'Resources');
      const stored = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
      const changes = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/changes');
      expect(resources).toBeDefined();
      expect(stored).toBeDefined();
      expect(changes).toBeDefined();
      noteId = (await w.drive.createText(resources?.id ?? '', `${name}.md`, noteText)).id;
      questionId = `q-state-${noteId}`;
      storedId = stored?.id ?? '';
      await w.drive.writeText(storedId, JSON.stringify({ v: 1, questions: [{
        id: questionId, text: 'Should Bower write its update there?', yes: 'Write it', no: 'Keep mine',
        about: `Resources/${name}.md`, state: stateMark(['Alex had one task.']), askedAt: AT - 1,
        shown: { lines: shownLines, md5: '0'.repeat(32) },
      }] }), stored?.modifiedTime ?? '');
      await w.drive.createText(changes?.id ?? '', 'answer-reask.json', JSON.stringify({
        v: 1, id: 'answer-reask', device: 'device-2', at: AT, kind: 'answer',
        what: 'Answered a question', questionId, askedAt: AT - 1, answer: true,
      }));
    });
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')]
      .map((spy) => spy.mockImplementation(() => {}));
    const code = await w.runJob(0);
    const current = await status();
    const { questions } = JSON.parse(await w.drive.readText(storedId)) as { questions: StoredQuestion[] };
    const text = `The current state of ${name} changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?`;
    if (name.length === 80) {
      expect(name).toHaveLength(80);
      expect(text).toHaveLength(209);
    }
    const manifests = (await w.drive.listAll(w.rootId)).filter((f) => /^manifest-.*\.json$/.test(f.name));
    expect(manifests).toHaveLength(1);
    const manifest = JSON.parse(await w.drive.readText(manifests[0]?.id ?? '')) as {
      operations: Array<{ effect: { kind: string; path?: string; text?: string } }>;
    };
    const effect = manifest.operations.find(({ effect }) => effect.kind === 'write-runner-json'
      && effect.path === '.bower/questions.json')?.effect;
    expect(effect).toBeDefined();
    const planned = JSON.parse(effect?.text ?? '{}') as { questions: StoredQuestion[] };
    expect(planned.questions).toHaveLength(2);
    expect(planned.questions).toContainEqual(expect.objectContaining({ id: questionId, text, askedAt: AT,
      shown: expect.objectContaining({ lines: shownLines }) }));
    expect.soft(code).toBe(0);
    expect.soft(current.run?.phase).toBe('done');
    expect.soft(w.drive.pathOf(clearId, w.rootId)).toBe('Resources/Clear.md');
    expect.soft(questions).toContainEqual(expect.objectContaining({ id: questionId, text, askedAt: AT,
      shown: expect.objectContaining({ lines: shownLines }) }));
    expect.soft(await w.drive.readText(noteId)).toBe(noteText);
    const other = questions.filter((q) => q.id !== questionId);
    expect.soft(other).toHaveLength(1);
    expect.soft(current.run?.questions).toEqual(other.map(({ id, text, askedAt }) =>
      expect.objectContaining({ id, text, askedAt })));
    expect.soft((current.run?.questions ?? []).map((q) => q.id)).not.toContain(questionId);
    const lines = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
      .filter((line) => /question/i.test(line));
    expect.soft(lines).toHaveLength(1);
    expect.soft(lines[0] ?? '').toMatch(/live|snapshot/i);
    expect.soft(lines[0] ?? '').toMatch(/omit|skip|trim|left out|not.*(?:publish|share)|cannot.*(?:publish|share)/i);
    expect.soft(lines[0] ?? '').not.toContain('\n');
  });

  it('Q1c fix 1: eleven askings keep clear work and publish the first ten by askedAt', async () => {
    const { w, clearId, status } = await mixed(11);
    expect(await w.runJob(0)).toBe(0);
    const manifests = (await w.drive.listAll(w.rootId)).filter((f) => /^manifest-.*\.json$/.test(f.name));
    expect(manifests).toHaveLength(1);
    const manifest = JSON.parse(await w.drive.readText(manifests[0]?.id ?? '')) as {
      operations: Array<{ effect: { kind: string; path?: string; text?: string } }>;
    };
    const effect = manifest.operations.find(({ effect }) => effect.kind === 'write-runner-json'
      && effect.path === '.bower/questions.json')?.effect;
    expect(effect).toBeDefined();
    const planned = JSON.parse(effect?.text ?? '{}') as { questions: StoredQuestion[] };
    expect(planned.questions).toHaveLength(11);
    expect((await status()).run?.phase).toBe('done');
    expect(w.drive.pathOf(clearId, w.rootId)).toBe('Resources/Clear.md');
    const stored = (await w.drive.listAll(w.rootId)).find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
    expect(stored).toBeDefined();
    const { questions } = JSON.parse(await w.drive.readText(stored?.id ?? '')) as { questions: StoredQuestion[] };
    expect(questions).toHaveLength(11);
    expect(new Set(questions.map((q) => q.id))).toEqual(new Set(planned.questions.map((q) => q.id)));
    const ordered = [...questions].sort((a, b) => a.askedAt - b.askedAt);
    const snapshot = (await status()).run?.questions;
    expect(snapshot).toHaveLength(10);
    expect(snapshot).toEqual(ordered.slice(0, 10)
      .map(({ id, text, askedAt }) => expect.objectContaining({ id, text, askedAt })));
    const eleventh = ordered[10];
    expect(eleventh).toBeDefined();
    expect(questions).toContainEqual(eleventh);
    expect(snapshot?.map((q) => q.id)).not.toContain(eleventh?.id);
  });

  it('Q1c fix 1: a crash after manifest persistence recovers questions with stored option actions intact', async () => {
    const { w, clearId, waitingId, folderIds, model, status, calls } = await mixed(1, true);
    const before = await w.drive.get(waitingId);
    const bytes = await w.drive.readText(waitingId);
    let crashed = false;
    expect(await w.runJob(0, async (url, init, next) => {
      if (url.origin === ORIGIN && url.pathname.endsWith('/status') && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { questions?: PublicQuestion[] };
        if (body.questions?.length) crashed = true;
      }
      // Stop at the onPlan publication boundary, before a checkpoint or any planned effect can be sent.
      if (crashed) throw new Error('Simulated runner crash after manifest persistence');
      return next();
    })).toBe(1);
    expect(crashed).toBe(true);
    const files = await w.drive.listAll(w.rootId);
    const manifests = files.filter((f) => /^manifest-.*\.json$/.test(f.name));
    expect(manifests).toHaveLength(1);
    expect(files.filter((f) => /^checkpoint-.*\.json$/.test(f.name))).toHaveLength(0);
    const manifest = JSON.parse(await w.drive.readText(manifests[0]?.id ?? '')) as {
      operations: Array<{ effect: { kind: string; path?: string; text?: string } }>;
    };
    const effect = manifest.operations.find(({ effect }) => effect.kind === 'write-runner-json'
      && effect.path === '.bower/questions.json')?.effect;
    expect(effect).toBeDefined();
    const planned = JSON.parse(effect?.text ?? '{}') as { questions: StoredQuestion[] };
    expect(planned.questions).toHaveLength(1);
    expect(planned.questions[0]?.options?.map(({ action }) => action).sort((a, b) => a.folderId.localeCompare(b.folderId))).toEqual(folderIds.slice(0, 2)
      .sort().map((folderId) => ({ kind: 'file-to', folderId })));
    const stored = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
    expect(stored).toBeDefined();
    expect(JSON.parse(await w.drive.readText(stored?.id ?? ''))).toEqual({ v: 1, questions: [] });
    expect(w.drive.pathOf(clearId, w.rootId)).toBe('Inbox/Clear.md');
    expect(await w.drive.get(waitingId)).toEqual(before);
    expect(await w.drive.readText(waitingId)).toBe(bytes);
    expect((await status()).run?.questions ?? []).toEqual([]);

    const wire = driveV3(w.drive, 2, w.dispatched[0]?.run_id);
    wire.folderId = w.rootId;
    const dir = join(tmpdir(), 'bower-q1c-tests');
    await mkdir(dir, { recursive: true });
    const event = join(dir, `q1c-crash-recovery-event-${crypto.randomUUID()}.json`);
    await writeFile(event, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: wire.runId,
      attempt: 2, ticket: TICKET, scope: 'all', allow_web: false } }));
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: event,
      BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' }, { fetch: wire.fetch,
      claude: model, pacing: { baseMs: 0, sleep: async () => {} } })).toBe(0);
    expect(calls()).toBe(2);
    expect(wire.statuses.at(-1)?.phase).toBe('done');
    expect(w.drive.pathOf(clearId, w.rootId)).toBe('Resources/Clear.md');
    expect(JSON.parse(await w.drive.readText(stored?.id ?? ''))).toEqual(planned);
    const reported = wire.statuses.at(-1) as { questions?: StoredQuestion[] } | undefined;
    expect(reported?.questions).toEqual(planned.questions.map(({ options, ...q }) => ({ ...q,
      options: options?.map(({ id, label }) => ({ id, label })),
    })));
    expect(JSON.stringify(reported?.questions)).not.toContain('action');
    expect(await w.drive.get(waitingId)).toEqual(before);
    expect(await w.drive.readText(waitingId)).toBe(bytes);
  });

  it('Q1c q1-live-question-before-clear-effects-end: durable publication', async () => {
    const { w, clearId, waitingId, status, calls } = await mixed();
    const before = await w.drive.get(waitingId);
    const bytes = await w.drive.readText(waitingId);
    const reached = latch(), release = latch();
    let captured: Status | null = null;
    let plans = 0;
    const plannedQuestions: PublicQuestion[] = [];
    const job = w.runJob(0, async (url, init, next) => {
      if (url.origin === 'https://www.googleapis.com' && init.method === 'PATCH' && url.pathname.endsWith(`/${clearId}`)) {
        const records = (await w.drive.listAll(w.rootId)).filter((f) => /^manifest-.*\.json$/.test(f.name));
        plans = records.length;
        for (const record of records) {
          const plan = JSON.parse(await w.drive.readText(record.id)) as { operations: Array<{ effect: { kind: string; path?: string; name?: string; text?: string } }> };
          for (const { effect } of plan.operations) {
            if ((effect.kind === 'write-runner-json' && effect.path === '.bower/questions.json')
              || (effect.kind === 'create-text' && effect.name === 'questions.json')) {
              const value = JSON.parse(effect.text ?? '{}') as { questions: PublicQuestion[] };
              plannedQuestions.push(...value.questions);
            }
          }
        }
        captured = await status();
        reached.resolve();
        await release.promise;
      }
      return next();
    });
    try {
      const boundary = await Promise.race([reached.promise.then(() => 'effect'), job.then(() => 'ended')]);
      expect(boundary).toBe('effect');
      // Positive control: a valid production plan exists and the waiting subject has no effects.
      expect(plans).toBe(1);
      expect(calls()).toBe(2);
      expect(plannedQuestions).toHaveLength(1);
      expect(plannedQuestions[0]).toMatchObject({ text: 'Where should Alex keep this?', askedAt: AT });
      expect(await w.drive.get(waitingId)).toEqual(before);
      expect(await w.drive.readText(waitingId)).toBe(bytes);
      expect((captured as Status | null)?.run?.phase).not.toBe('done');
      expect((captured as Status | null)?.run?.questions).toEqual([
        expect.objectContaining({ id: plannedQuestions[0]?.id, text: 'Where should Alex keep this?', askedAt: AT }),
      ]);
    } finally {
      release.resolve();
      expect(await job).toBe(0);
      expect(await w.paths()).toContain('Resources/Clear.md');
    }
  });

  it('Q1c q1-live-question-before-clear-effects-end: same-run recovery republishes without a second model reply', async () => {
    await legacyRecords();
    const { w, status, calls } = await mixed();
    expect(await w.runJob(0)).toBe(0);
    const files = await w.drive.listAll(w.rootId);
    const stored = files.find((f) => w.drive.pathOf(f.id, w.rootId) === '.bower/questions.json');
    expect(stored).toBeDefined();
    const questions = JSON.parse(await w.drive.readText(stored?.id ?? '')) as { questions: PublicQuestion[] };
    expect(questions.questions).toHaveLength(1);
    // A redispatched job's token adapter supplies the same folder and run id after the report barrier.
    // Persistence and ticket takeover are separately pinned through the actual API routes in q1-questions.test.ts.
    const wire = driveV3(w.drive, 2, w.dispatched[0]?.run_id);
    wire.folderId = w.rootId;
    const dir = join(tmpdir(), 'bower-q1c-tests');
    await mkdir(dir, { recursive: true });
    const event = join(dir, `q1c-recovery-event-${crypto.randomUUID()}.json`);
    await writeFile(event, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: wire.runId,
      attempt: 2, ticket: TICKET, scope: 'all', allow_web: false } }));
    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: event }, { fetch: wire.fetch,
      pacing: { baseMs: 0, sleep: async () => {} } })).toBe(0);
    expect(calls()).toBe(2);
    const reported = wire.statuses.at(-1) as { questions?: PublicQuestion[] } | undefined;
    expect(reported?.questions).toEqual(questions.questions.map(({ id, text, askedAt }) =>
      expect.objectContaining({ id, text, askedAt })));
    expect((await status()).run?.id).toBe(wire.runId);
  });
});
