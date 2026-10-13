/** B8a reds: the one readable monthly log line format (TL-P4-50 Q1-Q2), ported from b8-log a397198f. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { opKey } from './op-key';
import { timelineDate } from './note-edit';
import { parseRunManifestV2 } from './run-manifest';
import { parseRunCheckpoint } from './run-checkpoint';
import { RUNNER_WRITES } from '../vault/layout';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';

const utf8 = (text: string) => new TextEncoder().encode(text);
type Event = { rootId: string; runId: string; operationId: string; requestedAt: number; action: string; note: string; detail: string };
type LogFormat = {
  formatLogEvent(event: Event): { path: string; line: string };
  readLog(text: string): { text: string; keys: readonly string[] };
};
// The proposed seam in the allocated home; its absence is an assertion, never a collection crash.
async function logFormat(): Promise<LogFormat> {
  const load = import.meta.glob('./log-format.ts')['./log-format.ts'];
  expect(load, 'B8 has one production home for sanitized monthly log events').toBeTypeOf('function');
  const module = await (load as () => Promise<object>)();
  expect(Reflect.get(module, 'formatLogEvent')).toBeTypeOf('function');
  expect(Reflect.get(module, 'readLog')).toBeTypeOf('function');
  return module as LogFormat;
}
const event: Event = { rootId: 'FOLDER_ID', runId: 'made-up-run', operationId: 'made-up-op',
  requestedAt: Date.UTC(2026, 9, 31, 23, 59), action: 'create', note: 'Resources/Gardening/Options.md', detail: 'Alex saved mulch options.' };
afterEach(() => { vi.useRealTimers(); });

describe('B8a readable log contracts', () => {
  it('AC1 b8-log-field-roundtrip', async () => {
    const { formatLogEvent } = await logFormat();
    const input = { ...event, note: 'Options | "café" \\ 日本\r\nnext.md', detail: 'Alex | "quoted" \\ 🌿\nnext\rline' };
    const { line } = formatLogEvent(input);
    expect(line.split(' | ')).toEqual(['2026-10-31', 'create', 'Options / "café" \\ 日本 next.md',
      `Alex / "quoted" \\ 🌿 next line · op:${opKey(input.rootId, input.runId, input.operationId)}`]);
    expect(line).not.toMatch(/[\r\n]|\\u007c|\{"v":/);
    expect(formatLogEvent(input).line).toBe(line);
    for (const action of ['create', 'update', 'fix', 'ingest', 'move', 'decision']) {
      expect(formatLogEvent({ ...event, action }).line.split(' | ')[1]).toBe(action);
    }
  });
  it('AC1 control: the op suffix key is the unambiguous root/run/op hash', () => {
    expect(opKey(event.rootId, event.runId, event.operationId)).toMatch(/^[0-9a-f]{12}$/);
    expect(opKey('ab', 'c', 'd')).not.toBe(opKey('a', 'bc', 'd'));
  });

  it('AC2 b8-log-monthly-detail-bound', async () => {
    const { formatLogEvent } = await logFormat();
    const input = { ...event, detail: '🌿 é 日本 '.repeat(1200) };
    const first = formatLogEvent(input);
    expect(first.path).toBe('.bower/log/2026-10.md');
    expect(utf8(`${first.line}\n`).length).toBeLessThanOrEqual(4096);
    expect(first.line.split(' | ').slice(0, 3)).toEqual(['2026-10-31', event.action, event.note]);
    expect(first.line).toMatch(/… · op:[0-9a-f]{12}$/);
    expect(first.line).not.toContain('�');
    expect(formatLogEvent(input)).toEqual(first);
    // The frozen admission date picks the month, never the replay clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 1));
    expect(formatLogEvent(input).path).toBe('.bower/log/2026-10.md');
    expect(formatLogEvent({ ...event, requestedAt: Date.UTC(2026, 10, 1) }).path).toBe('.bower/log/2026-11.md');
  });
  it('AC2 control: the frozen admission date and the replay clock differ across the month end', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 1));
    expect(timelineDate(event.requestedAt)).toBe('2026-10-31');
    expect(timelineDate(Date.now())).toBe('2026-11-01');
  });

  it('AC3 b8-old-records-readable', async () => {
    const { readLog, formatLogEvent } = await logFormat();
    const legacy = '# Log\r\n2026-09-01 | create | Alex | saved\r\nLegacy line without fields\n';
    expect(readLog(legacy)).toEqual({ text: legacy, keys: [] });
    const line = formatLogEvent(event).line;
    expect(readLog(`${legacy}${line}\n`).keys).toEqual([opKey(event.rootId, event.runId, event.operationId)]);
    expect(() => formatLogEvent({ ...event, action: 'create\n2026-10-31 | update' })).toThrow();
    expect(() => formatLogEvent({ ...event, action: 'delete' })).toThrow();
    expect(() => formatLogEvent({ ...event, requestedAt: Number.NaN })).toThrow();
  });
  it('AC3 control: old manifests and checkpoints parse without migration', async () => {
    const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../testing/fixtures/run-recovery-contract/01-admission-reopen.json'), 'utf8')) as {
      input: { manifest: { scope: { rootId: string }; runId: string; captureId: string; operations: Array<{ operationId: string }> }; checkpoint0: { manifestHash: string } };
    };
    const m = fixture.input.manifest;
    expect((await parseRunManifestV2(utf8(JSON.stringify(m)), m.scope.rootId, RUNNER_WRITES)).ok).toBe(true);
    expect((await parseRunCheckpoint(utf8(JSON.stringify(fixture.input.checkpoint0)), { rootId: m.scope.rootId,
      runId: m.runId, captureId: m.captureId, manifestHash: fixture.input.checkpoint0.manifestHash,
      operationIds: m.operations.map((op) => op.operationId) })).ok).toBe(true);
  });
});

describe('B8a the app never writes a monthly log', () => {
  it('AC5 b8-app-refuses-monthly-log', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await drive.createFolder('root', 'Bower')).id;
    const sys = (await drive.createFolder(root, '.bower')).id;
    const logs = (await drive.createFolder(sys, 'log')).id;
    const month = await drive.createText(logs, '2026-10.md', '# Log\n- [ ] Keep\n');
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.refresh();
    const write = vi.spyOn(drive, 'writeText');
    // The one runner-file refusal, by its own words, not a missing-file error (R14).
    await expect(vault.toggleTask('.bower/log/2026-10.md', 0)).rejects.toMatchObject({ code: 'conflict', message: 'Bower keeps this file up to date.' });
    expect(write.mock.calls.filter(([id]) => id === month.id)).toEqual([]);
    expect(await drive.readText(month.id)).toBe('# Log\n- [ ] Keep\n');
  });
  it('AC5 control: the same refusal already guards the declared runner files', async () => {
    const drive = new FakeDrive({ clock: () => 0 });
    const root = (await drive.createFolder('root', 'Bower')).id;
    const sys = (await drive.createFolder(root, '.bower')).id;
    await drive.createText(sys, 'hot.md', '- [ ] Keep\n');
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.refresh();
    await expect(vault.toggleTask('.bower/hot.md', 0)).rejects.toMatchObject({ code: 'conflict', message: 'Bower keeps this file up to date.' });
  });
});
