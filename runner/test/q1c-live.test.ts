import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import p2Manifest from '../../src/data/contracts/fixtures/p2/run-manifest.json';
import p2Checkpoints from '../../src/data/contracts/fixtures/p2/run-checkpoint.json';
import p2Report from '../../src/data/contracts/fixtures/p2/run-report.json';
import { parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseRunCheckpoint, parseRunReport } from '../../src/data/contracts/run-checkpoint';
import { canonicalRecordJson } from '../../src/data/contracts/record-json';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import { main } from '../src/main';
import { API, TICKET, driveV3 } from './drive-v3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { ORIGIN, realWorld } from './real-world';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {
  constructor(readonly ctx: unknown, readonly env: unknown) {}
} }));

const AT = Date.UTC(2026, 9, 10, 12);
const JSON_HEADERS = { 'content-type': 'application/json' };
interface PublicQuestion { id: string; text: string; askedAt: number }
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

async function mixed() {
  let clearId = '', waitingId = '', calls = 0;
  const model: ClaudeSpawn = async () => {
    calls++;
    const intent = { kind: 'tidy-intent', v: 1,
      things: [{ fileId: clearId, to: 'Resources', name: 'Clear.md' }],
      asks: [{ fileId: waitingId, text: 'Where should Alex keep this?', yes: 'In projects', no: 'Keep here' }],
    };
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success',
      is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1, result: JSON.stringify(intent),
      usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
  const w = await realWorld({ claude: model, seed: async (drive) => {
    const root = (await drive.createFolder('root', 'Bower')).id;
    const inbox = (await drive.createFolder(root, 'Inbox')).id;
    for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
    const sys = (await drive.createFolder(root, '.bower')).id;
    await drive.createFolder(sys, 'changes');
    await drive.createText(sys, 'questions.json', JSON.stringify({ v: 1, questions: [] }));
    clearId = (await drive.createText(inbox, 'Clear.md', 'Made-up clear words.', { pile: 'CLEAR' })).id;
    waitingId = (await drive.createText(inbox, 'Waiting.md', 'Made-up waiting words.', { pile: 'WAITING' })).id;
    return root;
  } });
  const lease = await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ place: 'Q1C_TAB', action: 'check', gen: 0 }) })).json() as { epoch: number };
  const res = await w.api.browser(`${ORIGIN}/process`, { method: 'POST',
    headers: { ...JSON_HEADERS, 'x-bower-place': 'Q1C_TAB', 'x-bower-epoch': String(lease.epoch) },
    body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'q1c-production-press-1' }) });
  expect(res.status).toBe(200);
  expect(w.dispatched).toHaveLength(1);
  const status = async (): Promise<Status> => await (await w.api.browser(`${ORIGIN}/status`)).json() as Status;
  return { w, clearId, waitingId, status, calls: () => calls };
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
      expect(calls()).toBe(1);
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
    expect(calls()).toBe(1);
    const reported = wire.statuses.at(-1) as { questions?: PublicQuestion[] } | undefined;
    expect(reported?.questions).toEqual(questions.questions.map(({ id, text, askedAt }) =>
      expect.objectContaining({ id, text, askedAt })));
    expect((await status()).run?.id).toBe(wire.runId);
  });
});
