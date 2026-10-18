/** F4: made-up picture bytes, one isolated preparation call before planning. */
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as provider from '../src/claude';
import type { ClaudeCall, ClaudeExit } from '../src/claude';
import { LedgerExhausted } from '../src/timing';
import { BowerError } from '../../src/data/types';
import { loadCase, type LoadedCase } from '../src/corpus';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { phaseAwareClaude, reply, report } from './b1-planning-support';
import { AT, frameOf, redispatchCase, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive, RUN_ID } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 65, 66]);
const LABEL = 'What Bower read in the picture:\n';
const TEXT = 'Boiler service 2 Nov 9am. Brightwater Heating engineer. Ref BW-2209. A sticky note.';
const UNREAD = 'a picture Bower could not read';
const BUDGET = "past this run's text budget: not read";
const pacing = { baseMs: 0, sleep: async () => {} };
// Structural test types let the new assertions run against the pre-F4 implementation.
type Call = ClaudeCall & { images?: Array<{ mediaType: string; data: string }> };
type Thing = { fileId: string; name: string; text: string | null; why?: string; sentences?: Array<{ text: string }> };
type Frame = { piles: Array<{ pileId: string; words: string; things: Thing[] }>; sources?: Array<{ itemId: string; candidates: Array<{ id: string; path: string }> }>; selection?: unknown;
  synopsis?: unknown; consolidation?: { facts: Array<{ n: number }> }; judge?: { lines: Array<{ n: number }> } };
type Seen = { call: Call; phase: string; frame: Frame };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture(binary: Record<string, Uint8Array> = { 'Photo.png': PNG }, words = 'File this.', text: Record<string, string> = {}) {
  const c = await loadCase(resolve(ROOT, 'c17-b10-complete-tail'));
  c.inbox = [{ line: words, files: [...Object.keys(binary), ...Object.keys(text)] }];
  c.inboxFiles = text; c.inboxBinary = binary; c.journal = [];
  c.folder['Areas/Home/Brightwater Heating.md'] = '---\nsummary: Brightwater Heating maintains boilers.\n---\nBrightwater Heating engineer.\n';
  return c;
}
async function seeded(c: LoadedCase) {
  const drive = fixedDrive(); const root = await seedCase(drive, c);
  const a = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'f4-admission' });
  if (a.kind !== 'manifest') throw new Error('F4 fixture was not admitted');
  const files = await drive.listAll(root);
  const id = (path: string) => files.find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
  return { c, drive, root, admission: a.manifest, id };
}
type Base = Awaited<ReturnType<typeof seeded>>;
function transport(b: Base, o: { picture?: (call: Call) => ClaudeExit | Promise<ClaudeExit>; note?: boolean; noteName?: string; crash?: boolean; profile?: boolean } = {}) {
  const seen: Seen[] = [];
  const spawn = phaseAwareClaude((call, _step, attempt, phase) => {
    const frame = frameOf<Frame>(call);
    const kind = frame.synopsis ? 'synopsis' : frame.consolidation ? 'consolidation' : frame.judge ? 'judge' : phase;
    seen.push({ call, frame, phase: kind });
    if (frame.synopsis) return reply({ statements: [{ text: 'Alex labels trays.', parts: [1] }] });
    if (frame.consolidation) return reply({ lines: [{ text: 'I like short written updates.', facts: frame.consolidation.facts.map((f) => f.n), form: 'current' }] });
    if (frame.judge) return reply({ verdicts: frame.judge.lines.map(({ n }) => ({ n, supported: true, reason: 'Supported by the facts.' })) });
    if (phase === 'selection') {
      if (o.crash) throw new Error('Made-up selection crash.');
      return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: o.profile ? 'cv' : 'unknown',
        destination: o.profile ? { parentId: b.id('Areas/Career'), name: 'Originals' } : b.id('Resources/Gardening'),
        wants: o.profile ? [b.id('Areas/Career/Career profile.md'), b.id('Areas/Career/Career.md')] : [] })), asks: [] });
    }
    return reply({ kind: 'tidy-intent', v: 1, observations: frame.piles.filter((p) => p.words.startsWith('Remember this: ')).map((p) => ({ source: { pileId: p.pileId }, section: 'about-preferences', category: 'preference', text: p.words.slice('Remember this: '.length).trim() })), things: frame.piles.flatMap((p) => p.things).map((t) => ({ fileId: t.fileId,
      to: o.profile ? 'Areas/Career/Originals' : 'Resources/Gardening', name: t.name,
      ...(o.note || o.profile || t.text !== null ? { note: { name: o.noteName ?? t.name.replace(/\.[^.]+$/, '.md'), summary: o.profile ? 'Alex keeps career evidence.' : o.note ? 'Boiler service 2 Nov 9am, ref BW-2209.' : 'Alex labels trays.',
        body: o.profile ? 'Alex keeps career evidence. [[Areas/Career/Career profile]] [[Areas/Career/Career]]' : o.note ? 'Boiler service 2 Nov 9am. Ref BW-2209. [[Resources/Gardening/Gardening]]' : 'Alex labels trays. [[Resources/Gardening/Gardening]]', ...(o.profile ? { typeRow: 'cv' } : {}) } } : {}),
      ...(o.profile && !attempt ? { profile: [{ source: t.fileId, sentence: 1 }] } : {}) })) });
  }, () => b, true, async (call: Call) => {
    seen.push({ call, phase: 'picture', frame: {} as Frame });
    return o.picture ? o.picture(call) : reply({ text: TEXT });
  });
  return { spawn, seen };
}
async function press(b: Base, t = transport(b), around?: (f: typeof fetch) => typeof fetch) {
  return { ...await runOnDrive(b.c, b.drive, b.root, { claude: t.spawn, admission: b.admission, pacing, ...(around ? { around } : {}) }, 1), seen: t.seen };
}
function direct(b: Base, t: ReturnType<typeof transport>) {
  const read = fakeRead(b.drive);
  return provider.claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: t.spawn }, { rootId: b.root, runId: RUN_ID, allowWeb: false },
    { ...read, piles: (root) => listedPiles(read, root), provenance: 'fake-stored' })({ taken: b.admission, deferred: [] });
}
const phases = (seen: Seen[]) => seen.map((s) => s.phase);
const things = (seen: Seen[], phase = 'selection') => seen.find((s) => s.phase === phase)?.frame.piles.flatMap((p) => p.things) ?? [];
const pics = (seen: Seen[]) => seen.filter((s) => s.phase === 'picture');

it('AC1 f4-picture-call-shape', async () => {
  const b = await seeded(await fixture()); const r = await press(b);
  expect(phases(r.seen)).toEqual(['picture', 'selection', 'execution']);
  const call = r.seen[0]?.call;
  if (!call) throw new Error('The picture call is missing.');
  expect(call.args).toEqual(expect.arrayContaining(['--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', 'claude-haiku-5-5']));
  expect(call.args).not.toContain('--system-prompt-file');
  expect(call.images).toEqual([{ mediaType: 'image/png', data: Buffer.from(PNG).toString('base64') }]);
  expect(call.input.split('\n').some((l) => l.startsWith('{'))).toBe(false);
  const stdin = (provider as unknown as { claudeStdin: (call: Call) => string }).claudeStdin(call);
  expect(stdin.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(stdin)).toEqual({ type: 'user', message: { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(PNG).toString('base64') } }, { type: 'text', text: call.input }] } });
  expect(pics(r.seen)).toHaveLength(1);
});
it.each([
  ['Photo.md', false, 'Photo.md'],
  ['Boiler service.md', false, 'Boiler service.md'],
  ['Boiler service.md', true, 'Boiler service (2).md'],
])('AC2 f4-picture-text-reaches-planning: %s collision %s', async (noteName, collision, savedName) => {
  const c = await fixture();
  const existing = 'Alex keeps the earlier service record.\n';
  if (collision) c.folder[`Resources/Gardening/${noteName}`] = existing;
  const b = await seeded(c); const r = await press(b, transport(b, { note: true, noteName }));
  expect(things(r.seen)[0]).toMatchObject({ text: LABEL + TEXT });
  for (const phase of ['selection', 'execution']) { expect(things(r.seen, phase)[0]?.text).toBe(LABEL + TEXT); expect(things(r.seen, phase)[0]?.why).toBeUndefined(); }
  expect(pics(r.seen)).toHaveLength(1);
  expect(r.seen.filter((s) => s.phase !== 'picture').every((s) => !s.call.images)).toBe(true);
  expect(r.after[`Resources/Gardening/${savedName}`]).toContain('2 Nov 9am');
  expect(r.after[`Resources/Gardening/${savedName}`]).toContain('BW-2209');
  if (collision) expect(r.after[`Resources/Gardening/${noteName}`]).toBe(existing);
  expect(report(r).filed).toEqual([expect.objectContaining({ name: 'Photo.png', title: 'Photo', to: 'Resources/Gardening' })]);
  expect(report(r).filed[0]).not.toHaveProperty('note');
  const manifest = Object.entries(r.after).find(([p]) => /manifest-/.test(p))?.[1] ?? '';
  expect(manifest).toContain(savedName);
  expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('(numbers)');
});
it('AC3 f4-transcription-finds-candidate', async () => {
  const b = await seeded(await fixture()); const r = await press(b);
  const source = r.seen.find((s) => s.phase === 'selection')?.frame.sources?.find((s) => s.itemId === things(r.seen)[0]?.fileId);
  expect(source?.candidates.map((c) => c.path)).toContain('Areas/Home/Brightwater Heating.md');
  expect(phases(r.seen)).toEqual(['picture', 'selection', 'execution']);
});
it.each([
  ['Photo.heic', PNG, 10, 'a kind of photo Bower cannot look at yet', false],
  ['Photo.jpg', PNG, 7_000_001, 'a photo too big for Bower to look at', false],
  ['Photo.jpg', new Uint8Array([255, 216, 255, ...new Uint8Array(7_000_001 - 3)]), undefined, 'a photo too big for Bower to look at', true],
  ['Photo.png', new TextEncoder().encode('made-up text'), 12, UNREAD, true],
] as const)('AC4 f4-picture-limits: case %# %s', async (name, bytes, size, why, downloaded) => {
  const b = await seeded(await fixture({ [name]: bytes }));
  const list = b.drive.listAll.bind(b.drive);
  vi.spyOn(b.drive, 'listAll').mockImplementation(async (...args) => (await list(...args)).map((f) => f.name === name ? { ...f, size } : f));
  const reads = vi.spyOn(b.drive, 'readBytes'); const t = transport(b); await direct(b, t);
  expect(things(t.seen)[0]?.why).toBe(why);
  const id = things(t.seen)[0]?.fileId;
  expect(reads.mock.calls.some(([file]) => file === id)).toBe(downloaded);
  expect(phases(t.seen)).toEqual(['selection', 'execution']);
});
const SECRET = 'SECRET_PICTURE_MARKER';
// The one log line each failure leaves: a call that exited with a failure adds only its exit code and stderr length.
const failures: Array<[string, () => ClaudeExit, string]> = [
  ['not json', () => ({ ...reply({}), stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'not json' }) }), 'picture refused'],
  ['blank', () => reply({ text: '  ' }), 'picture unreadable'],
  ['1969', () => reply({ text: 'x'.repeat(1969) }), 'picture unreadable'],
  ['exit', () => ({ ...reply({ text: SECRET }), code: 1, stderr: SECRET }), `picture failed; claude exited 1 with ${SECRET.length} characters on stderr`],
  ['cut', () => ({ ...reply({ text: SECRET }), cut: 'size' }), 'picture cut'],
  ['subtype secret', () => ({ ...reply({ text: SECRET }), stdout: JSON.stringify({ type: 'result', subtype: SECRET, is_error: true, result: SECRET }) }),
    'picture failed; claude exited 0 with 0 characters on stderr'],
  ['unknown schema key', () => reply({ text: SECRET, [SECRET]: SECRET }), 'picture unreadable'],
  ['throw', () => { throw new BowerError('unknown', SECRET); }, 'picture failed'],
];
it.each(failures)('AC5 f4-picture-reply-failures: %s', async (_name, picture, reason) => {
  const b = await seeded(await fixture()); const r = await press(b, transport(b, { picture }));
  expect(phases(r.seen)).toEqual(['picture', 'selection', 'execution']);
  expect(things(r.seen)[0]).toMatchObject({ text: null, why: UNREAD });
  expect(report(r).filed).toHaveLength(1);
  const logs = vi.mocked(console.error).mock.calls.flat().join(' ');
  expect(logs).not.toContain(SECRET); expect(logs).not.toContain(Buffer.from(PNG).toString('base64')); expect(logs).not.toContain('Photo.png');
  expect(logs).not.toMatch(/plan for run .* is refused: picture/);
  expect(vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(' '))).toEqual([`A picture was not read: ${reason}`]);
});
it('AC5 f4-picture-reply-failures: 1968 accepted', async () => {
  const b = await seeded(await fixture()); const r = await press(b, transport(b, { picture: () => reply({ text: 'x'.repeat(1968) }) }));
  expect(things(r.seen)[0]?.text).toHaveLength(2000); expect(phases(r.seen)).toEqual(['picture', 'selection', 'execution']);
});
it('AC6 f4-picture-ledger-exhausted', async () => {
  const b = await seeded(await fixture()); const t = transport(b, { picture: () => { throw new LedgerExhausted(1); } });
  await expect(direct(b, t)).rejects.toBeInstanceOf(LedgerExhausted);
  expect(phases(t.seen)).toEqual(['picture']);
});
it('AC7 f4-download-failure-stops', async () => {
  const b = await seeded(await fixture()); const original = b.drive.readBytes.bind(b.drive);
  const id = b.admission.piles.flatMap((p) => p.items).find((i) => i.name === 'Photo.png')?.fileId;
  if (!id) throw new Error('The fixture photo is missing.');
  const failure = new Error('Made-up download failure');
  vi.spyOn(b.drive, 'readBytes').mockImplementation((file) => file === id ? Promise.reject(failure) : original(file));
  const t = transport(b); await expect(direct(b, t)).rejects.toBe(failure); expect(t.seen).toEqual([]);
});
it('AC8 f4-picture-budget: 25 pictures', async () => {
  const b = await seeded(await fixture(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`Photo-${i}.png`, PNG])), ''));
  const reads = vi.spyOn(b.drive, 'readBytes'); const t = transport(b, { picture: () => reply({ text: 'x'.repeat(1968) }) }); await direct(b, t);
  const shown = things(t.seen);
  expect(shown.filter((t) => t.text?.length === 2000)).toHaveLength(24);
  expect(shown.reduce((n, t) => n + (t.text?.length ?? 0), 0)).toBe(48_000);
  expect(shown[24]?.why).toBe(BUDGET);
  expect(reads.mock.calls.some(([id]) => id === shown[24]?.fileId)).toBe(false);
  expect(phases(t.seen).slice(0, 24)).toEqual(Array(24).fill('picture')); expect(pics(t.seen)).toHaveLength(24);
  expect(pics(t.seen).map((s) => s.call.images?.[0]?.data)).toEqual(Array(24).fill(Buffer.from(PNG).toString('base64')));
});
it('AC8 f4-picture-budget: words leave 1500', async () => {
  const c = await fixture(); c.inbox = Array.from({ length: 4 }, (_, i) => ({ line: 'a'.repeat(i === 3 ? 10500 : 12000), files: i === 3 ? ['Photo.png'] : [] }));
  const b = await seeded(c); const reads = vi.spyOn(b.drive, 'readBytes'); const t = transport(b); await direct(b, t);
  expect(things(t.seen)[0]?.why).toBe(BUDGET); expect(pics(t.seen)).toHaveLength(0);
  expect(reads.mock.calls.some(([id]) => id === things(t.seen)[0]?.fileId)).toBe(false);
});
it('AC9 f4-c04-offer-photo', async () => {
  const b = await seeded(await loadCase(resolve(ROOT, 'c04-offer-and-flat'))); const r = await press(b);
  expect(things(r.seen).find((t) => t.name === 'IMG_2301.jpg')?.why).toBe(UNREAD);
  expect(pics(r.seen)).toHaveLength(0); expect(r.seen.every((s) => !s.call.images)).toBe(true);
});
it('AC10 f4-memory-calls-no-images', async () => {
  const c = await fixture({ 'Photo.png': PNG }, 'Remember this: I like short written updates.', { 'Long.txt': 'Alex labels trays. '.repeat(1100) });
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  c.folder['.bower/observations.jsonl'] = Array.from({ length: 8 }, (_, i) => JSON.stringify({ v: 1, kind: 'observation', eventId: `e-${i}`, factId: `f-${i}`, date: '2026-10-06', section: 'about-preferences',
    text: `I like short written updates that say what changed, why it changed and what comes next, in plain words, so I can follow a change without opening other notes${' '.repeat(i)}.`, category: 'preference',
    source: { fileId: `w-${i}`, sha256: sha('words') }, origin: { kind: 'words', runId: 'history-run', captureId: sha('history'), pileId: `p-${i}` } })).join('\n') + '\n';
  const b = await seeded(c); const r = await press(b);
  expect(phases(r.seen), vi.mocked(console.error).mock.calls.flat().join(' ')).toEqual(['picture', 'synopsis', 'selection', 'execution', 'consolidation', 'judge']);
  expect(pics(r.seen)).toHaveLength(1); expect(r.seen.slice(1).every((s) => !s.call.images)).toBe(true);
});
it('AC11 f4-replay-before-plan', async () => {
  const b = await seeded(await fixture()); const first = await press(b, transport(b, { crash: true }));
  const t = transport(b); await redispatchCase(b.c, first, 2, { claude: t.spawn, pacing });
  expect(phases(t.seen)).toEqual(['picture', 'selection', 'execution']); expect(phases(first.seen)).toEqual(['picture', 'selection']);
});
it('AC12 f4-replay-after-plan (guard)', async () => {
  const b = await seeded(await fixture()); let lost = false;
  const first = await press(b, transport(b, { note: true }), (next) => async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (lost && url.origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection lost');
    const response = await next(input, init);
    if (init?.method === 'PATCH' && url.searchParams.has('addParents')) { lost = response.ok; throw new TypeError('Made-up lost answer'); }
    return response;
  });
  expect(lost).toBe(true); const t = transport(b);
  const resumed = await redispatchCase(b.c, first, 2, { claude: t.spawn, pacing });
  expect(t.seen).toEqual([]); expect(resumed.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(phases(first.seen)).toEqual(['picture', 'selection', 'execution']);
  expect(Object.entries(resumed.after).filter(([path]) => path.startsWith('Resources/Gardening/') && path.endsWith('.md') && !Object.hasOwn(b.c.folder, path)))
    .toEqual([['Resources/Gardening/Photo.md', expect.stringContaining('2 Nov 9am')]]);
  expect(resumed.after['Resources/Gardening/Photo.md']).toContain('BW-2209');
  expect(report(resumed).filed).toEqual([expect.objectContaining({ name: 'Photo.png', title: 'Photo', to: 'Resources/Gardening' })]);
  expect(report(resumed).filed[0]).not.toHaveProperty('note');
});
it('AC13 f4-no-picture-same-calls (guard)', async () => {
  const b = await seeded(await fixture({}, 'File this.', { 'Words.txt': 'Alex labels trays.' })); const r = await press(b);
  expect(phases(r.seen)).toEqual(['selection', 'execution']);
  for (const { call } of r.seen) { expect(call.images).toBeUndefined(); expect(call.args).not.toContain('--input-format'); expect(call.args).toContain('--system-prompt-file'); }
});
it('F4R-13 picture text is neither offered nor stored as profile sentences', async () => {
  const c = await loadCase(resolve(ROOT, 'c17-b56-cv-profile'));
  c.inbox = [{ line: 'File my CV.', files: ['Alex CV.png'] }]; c.inboxFiles = {}; c.inboxBinary = { 'Alex CV.png': PNG };
  const b = await seeded(c);
  await b.drive.update(b.id('Areas/Career/Career profile.md'), { appProperties: { profile: 'cv' } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{ id: 'cv', match: ['cv'], template: 'source', properties: {}, table: [], profile: { template: 'profile' } }] }));
  const text = 'Alex built map tools. A photograph of a career document.';
  const r = await press(b, transport(b, { profile: true, picture: () => reply({ text }) }));
  expect(things(r.seen, 'execution')[0]?.sentences ?? []).toEqual([]);
  expect(phases(r.seen)).toEqual(['picture', 'selection', 'execution', 'execution']);
  const stored = r.after['Areas/Career/Career profile.md'] ?? '';
  for (const fragment of [LABEL.trim(), 'Alex built map tools.', 'A photograph of a career document.']) expect(stored).not.toContain(fragment);
  expect(stored).toContain('Alex uses JavaScript.');
});
