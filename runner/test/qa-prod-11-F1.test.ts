/**
 * qa-prod-11-F1: a selection that wants its destination's hub, or names a kind not listed, reaches the execution call; Bower
 * adds the hub and the pins itself and counts each once, and an unlisted kind files as "unknown", as the instructions say
 * (specs/qa-prod-11/plan.md, F1). A want shown for no source, a duplicate and one over the limit are still refused, and a
 * refused attempt logs one line that classifies the reply with no id and none of the person's words. Every run goes
 * through production main over the made-up c04 folder with one words pile; only the model is replaced.
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFUSALS, type ClaudeSpawn } from '../src/claude';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, runWithClaude } from './corpus-run';

const CASE = resolve(import.meta.dirname, '../../testing/corpus/c04-offer-and-flat');
const WORDS = 'Saltmere library quiz night on Friday 28 November, team of six, 5 GBP each.';
const SOCIAL = 'Areas/Social';
const HUB = `${SOCIAL}/Social.md`;
const hubNote = '---\nsummary: Evenings out with friends.\nby: bower\n---\n\n## Current state\n- Nothing planned.\n';
const evidence = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`${SOCIAL}/Saltmere quiz ${i + 1}.md`,
  `---\nsummary: Saltmere library quiz night, round ${i + 1}.\n---\n\nSaltmere library quiz night notes.\n`]));
const REFUSED = 'Selection shape or ids refused';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

interface Frame {
  sources?: Array<{ itemId: string; candidates: Array<{ id: string }> }>;
  map?: Array<{ id: string; path: string; hub?: { id: string } }>;
  selection?: { items: Array<{ itemId: string; kind: string; wants: string[] }> };
  allowedTargets?: Record<string, string[]>;
}
type Item = { kind?: string; wants?: string[] };
type Ids = { source: string; folder: string; hub: string; listed: string[] };

/** c04's folder with Areas/Social and its hub (and `files`), and one words pile in place of its inbox. */
async function quizCase(files: Record<string, string> = {}): Promise<LoadedCase> {
  const c = await loadCase(CASE);
  return { ...c, inbox: [{ line: WORDS, files: [] }], folder: { ...c.folder, [HUB]: hubNote, ...files } };
}

/** One tidy-up: both selection attempts give the pile `item` (to Areas/Social), the execution files nothing; every frame is kept. */
async function press(item: (ids: Ids) => Item, files: Record<string, string> = {}) {
  const frames: Frame[] = [];
  let ids: Ids | undefined;
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, _attempt, phase) => {
    const frame = frameOf<Frame>(call);
    frames.push(frame);
    if (phase === 'execution') return reply({ kind: 'tidy-intent', v: 1, things: [] });
    const row = frame.map?.find((r) => r.path === SOCIAL);
    const source = frame.sources?.[0];
    ids = { source: source?.itemId ?? 'no source', folder: row?.id ?? 'no folder', hub: row?.hub?.id ?? 'no hub', listed: source?.candidates.map((card) => card.id) ?? [] };
    return reply({ items: [{ itemId: ids.source, kind: 'unknown', destination: ids.folder, wants: [], ...item(ids) }], asks: [] });
  }, undefined, true);
  const run = await runWithClaude(await quizCase(files), spawn);
  if (!ids) throw new Error('No selection call.');
  return { run, frames, ids, executed: frames.filter((f) => f.selection !== undefined) };
}
const errors = () => vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(' '));
const refusedLines = () => errors().filter((line) => line.includes(REFUSED));
const firstRefusal = () => errors().map((line) => /was refused \((\w+)\)/.exec(line)?.[1]).find(Boolean);

/** Refused for selectionWants on both attempts: no execution call, and the run fails. */
async function expectWantsRefused(item: (ids: Ids) => Item, files: Record<string, string> = {}) {
  const r = await press(item, files);
  expect(firstRefusal(), 'the first attempt is refused for its wants').toBe('selectionWants');
  expect(r.executed, 'no execution call').toEqual([]);
  expect(r.frames.filter((f) => f.selection === undefined), 'two selection calls').toHaveLength(2);
  expect(r.run.code).toBe(1);
  return r;
}

describe('qa-prod-11-F1: the selection takes the destination hub and an unlisted kind', () => {
  it('AC1 qa11-hub-in-wants: a selection wanting its destination hub reaches execution, with the hub among its targets', async () => {
    const r = await press((ids) => ({ wants: [ids.hub] }));
    expect(r.ids.listed, 'the hub is not a listed candidate for the pile').not.toContain(r.ids.hub);
    expect(r.ids.hub).not.toBe('no hub');
    expect(r.executed, 'one execution call, after one selection call').toHaveLength(1);
    expect(r.frames).toHaveLength(2);
    expect(refusedLines(), 'nothing is refused').toEqual([]);
    expect(firstRefusal()).toBeUndefined();
    expect(r.executed[0]?.allowedTargets?.[r.ids.source]).toContain(r.ids.hub);
    expect(r.executed[0]?.allowedTargets?.[r.ids.source]).toContain(r.ids.folder);
  });

  it('AC2 qa11-unlisted-kind: a selection naming a kind not listed reaches execution as kind "unknown"', async () => {
    const r = await press(() => ({ kind: 'quiz-night' }));
    expect(r.executed, 'one execution call, after one selection call').toHaveLength(1);
    expect(r.frames).toHaveLength(2);
    expect(refusedLines(), 'nothing is refused').toEqual([]);
    expect(r.executed[0]?.selection?.items.map((i) => i.kind)).toEqual(['unknown']);
  });

  it('AC3 qa11-guards: a want shown for no source, a duplicate hub and five notes besides the hub are still refused', async () => {
    await expectWantsRefused(() => ({ wants: ['f-none'] }));
    vi.mocked(console.error).mockClear();
    await expectWantsRefused((ids) => ({ wants: [ids.hub, ids.hub] }));
    vi.mocked(console.error).mockClear();
    const five = await expectWantsRefused((ids) => ({ wants: ids.listed.filter((id) => id !== ids.hub).slice(0, 5) }), evidence);
    expect(five.ids.listed.filter((id) => id !== five.ids.hub).length, 'five listed notes besides the hub').toBeGreaterThanOrEqual(5);
    expect(REFUSALS).not.toHaveProperty('selectionKind');
  });

  it('AC4 qa11-redacted-refusal-log: a refused attempt logs what the reply held by class, with no id and none of the words', async () => {
    const r = await expectWantsRefused(() => ({ wants: ['f-none'] }));
    const line = refusedLines()[0] ?? '';
    expect(line).toBe(`${REFUSED} (selectionWants): item 1: itemId listed, kind unknown, destination listed folder, wants 1 of 5: not shown.`);
    const shown = [...(r.frames[0]?.sources ?? []).flatMap((s) => [s.itemId, ...s.candidates.map((card) => card.id)]),
      ...(r.frames[0]?.map ?? []).flatMap((row) => [row.id, row.hub?.id ?? 'no hub'])];
    for (const id of ['f-none', ...shown]) expect(line.includes(id), `the line holds no id (${id})`).toBe(false);
    for (const word of WORDS.split(' ')) if (word.length > 3) expect(line.includes(word), `the line holds none of the words (${word})`).toBe(false);
    expect(refusedLines(), 'one line per refused attempt').toEqual([line, line]);
    // A refusal after the shape and ids passed (five listed notes and the hub over the limit) logs its line too.
    vi.mocked(console.error).mockClear();
    await expectWantsRefused((ids) => ({ wants: ids.listed.filter((id) => id !== ids.hub).slice(0, 5) }), evidence);
    const listed = Array.from({ length: 5 }, () => 'listed for this source').join(', ');
    expect(refusedLines()).toEqual(Array.from({ length: 2 }, () => `${REFUSED} (selectionWants): item 1: itemId listed, kind unknown, destination listed folder, wants 5 of 5: ${listed}.`));
  });
});
