/** F4-unread: the report follows the text the planner actually saw. */
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase } from '../src/corpus';
import * as extraction from '../src/extract';
import { LedgerExhausted } from '../src/timing';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import type { RunReport } from '../../src/data/types';
import { phaseAwareClaude, reply, report } from './b1-planning-support';
import { AT, frameOf, redispatchCase, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const UNREAD_WHY = "Bower couldn't read what's in this, so it filed it by its name.";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 65, 66]);
const pacing = { baseMs: 0, sleep: async () => {} };
type Thing = { fileId: string; name: string; text: string | null; cut: number };
type Frame = { piles: Array<{ things: Thing[] }>; sources?: Array<{ itemId: string }> };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function setup(name = 'Photo.heic', text?: string, budget = false) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b10-complete-tail'));
  c.inbox = budget ? Array.from({ length: 4 }, (_, i) => ({ line: 'a'.repeat(12000), files: i === 3 ? [name] : [] }))
    : [{ line: 'File these.', files: [name, 'Read.png', 'Words.txt', 'Partial.txt'] }];
  c.inboxBinary = { ...(text === undefined ? { [name]: name === 'Large.jpg' ? new Uint8Array([255, 216, 255, ...new Uint8Array(7_000_001 - 3)]) : PNG } : {}), ...(!budget ? { 'Read.png': new Uint8Array([...PNG, 67]) } : {}) };
  c.inboxFiles = { ...(text === undefined ? {} : { [name]: text }), ...(!budget ? { 'Words.txt': 'Alex labels trays.', 'Partial.txt': 'x'.repeat(13000) } : {}) };
  c.journal = [];
  const drive = fixedDrive(); const root = await seedCase(drive, c);
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'unread-admission' });
  if (admission.kind !== 'manifest') throw new Error('Expected admission');
  const files = await drive.listAll(root);
  const destination = files.find((f) => drive.pathOf(f.id, root) === 'Resources/Gardening')?.id ?? '';
  return { c, drive, root, admission: admission.manifest, destination, name };
}
type Base = Awaited<ReturnType<typeof setup>>;
function transport(b: Base, held = false, picture: 'read' | 'refused' | 'failed' = 'read') {
  const seen: Thing[] = [];
  const calls = vi.fn();
  const spawn = phaseAwareClaude((call, _step, _attempt, phase) => {
    calls();
    if (held) throw new LedgerExhausted(1);
    const frame = frameOf<Frame>(call);
    if (phase === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: b.destination, wants: [] })), asks: [] });
    seen.push(...frame.piles.flatMap((p) => p.things));
    return reply({ kind: 'tidy-intent', v: 1, things: frame.piles.flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: 'Resources/Gardening', name: `Filed ${t.name}`, ...(t.text !== null ? { note: { name: t.name.replace(/\.[^.]+$/, '.md'), summary: 'Alex labels trays.', body: 'Alex labels trays. [[Resources/Gardening/Gardening]]' } } : {}) })) });
  }, () => b, true, async () => { calls(); if (picture === 'failed') throw new Error('Made-up vision failure'); return reply({ text: picture === 'refused' ? ' ' : 'Alex labels trays. A photograph.' }); });
  return { spawn, seen, calls };
}
async function press(b: Base, t = transport(b), around?: (f: typeof fetch) => typeof fetch) {
  return runOnDrive(b.c, b.drive, b.root, { claude: t.spawn, admission: b.admission, pacing, ...(around ? { around } : {}) }, 1);
}
const rows = (r: ReturnType<typeof report> & Pick<RunReport, 'leftAsWritten'>) => r.leftAsWritten?.filter((r) => r.why === UNREAD_WHY) ?? [];

it.each([
  ['unsupported', 'Photo.heic', undefined],
  ['oversized', 'Large.jpg', undefined],
  ['failed vision', 'Failed.png', undefined],
  ['refused vision', 'Refused.png', undefined],
  ['unreadable', 'Broken.pdf', 'not a PDF'],
  ['scanned PDF', 'Scan.pdf', 'made-up scanned PDF'],
  ['empty', 'Empty.txt', ''],
  ['blank', 'Blank.txt', '  \n '],
  ['budget', 'Budget.png', undefined],
] as const)('AC1 U-3/9: %s is reported once with its filed path; read and partial text get none', async (kind, name, text) => {
  if (kind === 'scanned PDF') {
    const extract = extraction.extract;
    vi.spyOn(extraction, 'extract').mockImplementation((n, bytes, share) => n === name ? Promise.resolve({ text: null, why: 'a scanned PDF with no text layer' }) : extract(n, bytes, share));
  }
  const b = await setup(name, text, kind === 'budget');
  const t = transport(b, false, kind === 'failed vision' ? 'failed' : kind === 'refused vision' ? 'refused' : 'read'); const r = await press(b, t);
  const unread = t.seen.filter((t) => !t.text?.trim());
  expect(unread.some((t) => t.name === name), vi.mocked(console.error).mock.calls.flat().join(' ')).toBe(true);
  expect(report(r).filed, vi.mocked(console.error).mock.calls.flat().join(' ')).toHaveLength(t.seen.length);
  if (kind !== 'budget' && !['failed vision', 'refused vision'].includes(kind)) {
    expect(t.seen.find((t) => t.name === 'Read.png')?.text).toContain('What Bower read');
    expect(t.seen.find((t) => t.name === 'Partial.txt')?.cut).toBeGreaterThan(0);
  }
  expect(rows(report(r))).toHaveLength(unread.length);
  expect(new Set(rows(report(r)))).toEqual(new Set(unread.map((t) => ({ name: `Resources/Gardening/Filed ${t.name}`, fileId: t.fileId, why: UNREAD_WHY }))));
});

it('AC1 held run adds none; the same unread source gets a row when filed', async () => {
  const held = await setup(); const stopped = await press(held, transport(held, true));
  expect(report(stopped).filed).toEqual([]);
  expect(rows(report(stopped))).toEqual([]);
  const b = await setup(); const t = transport(b); const r = await press(b, t);
  expect(rows(report(r))).toEqual([{ name: 'Resources/Gardening/Filed Photo.heic', fileId: t.seen.find((t) => t.name === 'Photo.heic')?.fileId, why: UNREAD_WHY }]);
});

it('AC2 U-6: lost move reply resumes the persisted manifest with one row and no model call', async () => {
  const b = await setup(); const firstTransport = transport(b); let lost = false;
  const first = await press(b, firstTransport, (next) => async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (lost && url.origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection lost');
    const response = await next(input, init);
    if (init?.method === 'PATCH' && url.searchParams.has('addParents')) { lost = response.ok; throw new TypeError('Made-up lost answer'); }
    return response;
  });
  expect(lost).toBe(true);
  const t = transport(b); const resumed = await redispatchCase(b.c, first, 2, { claude: t.spawn, pacing });
  expect(t.calls).not.toHaveBeenCalled();
  expect(resumed.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(rows(report(resumed))).toEqual([{ name: 'Resources/Gardening/Filed Photo.heic', fileId: firstTransport.seen.find((t) => t.name === 'Photo.heic')?.fileId, why: UNREAD_WHY }]);
});
