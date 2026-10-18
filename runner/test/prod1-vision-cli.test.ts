import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { claudeProvider, type ClaudeExit } from '../src/claude';
import { RunTiming } from '../src/timing';
import { loadCase } from '../src/corpus';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { AT, frameOf, seedCase } from './corpus-run';
import { fixedDrive, RUN_ID } from './drive-v3';

const TEXT = 'Boiler service 2 Nov. Ref BW-2209. A sticky note.';
const result = { type: 'result', subtype: 'success', is_error: false, num_turns: 1,
  result: JSON.stringify({ text: TEXT }), duration_ms: 30, duration_api_ms: 20,
  usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 } };
const stats = { wallMs: 30, apiMs: 20, turns: 1, inputTokens: 60, outputTokens: 40, cacheReadTokens: 30, cacheWriteTokens: 20 };
const assistant = { ...result, type: 'assistant', result: JSON.stringify({ text: 'Assistant decoy' }),
  usage: { input_tokens: 9999 }, message: { role: 'assistant', content: [{ type: 'text', text: 'Assistant decoy' }] } };
const stream = (...events: unknown[]) => events.map((event) => JSON.stringify(event)).join('\n');
const exit = (stdout: string, overrides: Partial<ClaudeExit> = {}): ClaudeExit => ({ code: 0, stdout, stderr: '', cut: null, ...overrides });
type Thing = { text: string | null; why?: string; fileId: string; name: string };
type Frame = { piles: Array<{ things: Thing[] }>; sources?: Array<{ itemId: string }> };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function picture(pictureExit: () => ClaudeExit) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b10-complete-tail'));
  c.inbox = [{ line: 'File this.', files: ['Photo.png'] }];
  c.inboxFiles = {}; c.journal = [];
  c.inboxBinary = { 'Photo.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 65, 66]) };
  const drive = fixedDrive(); const root = await seedCase(drive, c);
  const read = fakeRead(drive);
  const a = await planAdmission(read, root, { scope: 'all', clock: () => AT, newId: () => 'vision-admission' });
  if (a.kind !== 'manifest') throw new Error('Picture fixture was not admitted');
  const files = await drive.listAll(root);
  const destination = files.find((file) => drive.pathOf(file.id, root) === 'Resources/Gardening')?.id;
  const seen: Thing[] = [];
  const spawn = phaseAwareClaude((call, _step, _attempt, phase) => {
    const frame = frameOf<Frame>(call);
    seen.push(...frame.piles.flatMap((pile) => pile.things));
    return phase === 'selection'
      ? reply({ items: frame.sources?.map(({ itemId }) => ({ itemId, kind: 'unknown', destination, wants: [] })), asks: [] })
      : reply({ kind: 'tidy-intent', v: 1, things: frame.piles.flatMap((pile) => pile.things).map((thing) => ({ fileId: thing.fileId, name: thing.name, to: 'Resources/Gardening',
        ...(thing.text !== null ? { note: { name: 'Photo.md', summary: TEXT, body: TEXT + ' [[Resources/Gardening/Gardening]]' } } : {}) })) });
  }, () => ({ drive, root, admission: a.manifest }), true, pictureExit);
  const timing = new RunTiming(); const accounting = vi.spyOn(timing, 'addModel');
  await claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn, timing }, { rootId: root, runId: RUN_ID, allowWeb: false },
    { ...read, piles: (id) => listedPiles(read, id), provenance: 'fake-stored' })({ taken: a.manifest, deferred: [] });
  expect(accounting).toHaveBeenCalledTimes(3);
  expect(seen).toHaveLength(2);
  return { seen, stats: accounting.mock.calls[0]?.[0] };
}

it.each([
  ['events and final newline', stream({ type: 'system' }, assistant, result) + '\n'],
  ['complete final line without newline', stream({ type: 'system' }, assistant, result)],
  ['result only', stream(result)],
  ['blank lines', '\n \n' + stream(assistant, result) + '\n\n'],
])('AC2 stream_result_supplies_picture_and_usage: %s', async (_name, stdout) => {
  const r = await picture(() => exit(stdout));
  for (const thing of r.seen) {
    expect(thing.text).toBe('What Bower read in the picture:\n' + TEXT);
    expect(thing.why).toBeUndefined();
  }
  expect(r.stats).toEqual(stats);
});

it('AC2 stream_result_supplies_picture_and_usage: sanitizes only result numbers', async () => {
  const r = await picture(() => exit(stream(assistant, { ...result, duration_ms: -1, duration_api_ms: '20',
    usage: { input_tokens: -10, cache_creation_input_tokens: '20', cache_read_input_tokens: 30, output_tokens: null } })));
  expect(r.stats).toEqual({ ...stats, wallMs: 0, apiMs: 0, inputTokens: 30, outputTokens: 0, cacheWriteTokens: 0 });
});

it.each([
  ['missing result', exit(stream({ type: 'system' }, assistant)), null],
  ['assistant only', exit(stream(assistant)), null],
  ['empty stream', exit(''), null],
  ['malformed result', exit(stream(assistant) + '\n{"type":"result"'), null],
  ['malformed preceding JSON', exit('broken\n' + stream(result)), null],
  ['non-object event', exit(stream(null, result)), null],
  ['array event', exit(stream([], result)), null],
  ['missing event type', exit(stream({}, result)), null],
  ['non-string event type', exit(stream({ type: 1 }, result)), null],
  ['success followed by error', exit(stream(result, { ...result, subtype: 'error', is_error: true })), null],
  ['duplicate successes', exit(stream(result, result)), null],
  ['trailing partial JSON', exit(stream(result) + '\n{"type":'), null],
  ['event after result', exit(stream(result, assistant)), null],
  ['error result', exit(stream(assistant, { ...result, subtype: 'error', is_error: true })), stats],
  ['error flag', exit(stream({ ...result, is_error: true })), stats],
  ['nonzero exit', exit(stream(result), { code: 1 }), stats],
  ['null exit', exit(stream(result), { code: null }), stats],
  ['size cut', exit(stream(result), { cut: 'size' }), stats],
  ['timeout', exit(stream(result), { cut: 'time' }), stats],
  ['turn limit error', exit(stream({ ...result, subtype: 'error_max_turns' })), stats],
  ['turn count exceeded', exit(stream({ ...result, num_turns: 61 })), { ...stats, turns: 61 }],
  ['missing result text', exit(stream({ ...result, result: undefined })), stats],
  ['malformed picture JSON', exit(stream({ ...result, result: 'broken' })), stats],
  ['blank picture', exit(stream({ ...result, result: JSON.stringify({ text: ' ' }) })), stats],
  ['unknown picture key', exit(stream({ ...result, result: JSON.stringify({ text: TEXT, extra: true }) })), stats],
  ['oversized picture', exit(stream({ ...result, result: JSON.stringify({ text: 'x'.repeat(2001) }) })), stats],
] as const)('AC3 missing_error_or_cut_result_is_not_success: %s', async (_name, output, expectedStats) => {
  const r = await picture(() => output);
  for (const thing of r.seen) expect(thing).toMatchObject({ text: null, why: 'a picture Bower could not read' });
  expect(r.stats).toEqual(expectedStats);
});

it('AC3 missing_error_or_cut_result_is_not_success: thrown spawn still accounted', async () => {
  const r = await picture(() => { throw new Error('Synthetic spawn failure'); });
  for (const thing of r.seen) expect(thing).toMatchObject({ text: null, why: 'a picture Bower could not read' });
  expect(r.stats).toBeNull();
});
