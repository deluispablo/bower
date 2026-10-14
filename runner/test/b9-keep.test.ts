import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { empty, note, setup } from './b1-planning-support';
import { replySequence, runWithClaude } from './corpus-run';
import { undoEdit } from '../../src/data/contracts/note-edit';
import { parseRunManifestV2, type EditText } from '../../src/data/contracts/run-manifest';
import { RUNNER_WRITES } from '../../src/data/vault/layout';
import { parseNote } from '../../src/data/contracts/note-format';

// B9a (TL-P4-50 B9 Q5): keeping one note for two carries a marked line with its label, qualifier and citation link.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const TARGET = 'Projects/Garden visit/Visit.md';
const OTHER = 'Projects/Garden visit/Second visit.md';
const BODY = '## My thoughts\nAlex keeps the sketchbook.\n\n## Timeline\n';

async function keep(history: string, { words = '', source = 'Later notice.txt' } = {}) {
  const other = `## My thoughts\nAlex keeps the sketchbook.${words}\n\n## Timeline\n- 2026-10-02 · ${history} · [[${source}]]\n`;
  const base = await setup({ folder: {
    [TARGET]: note('Alex records one visit.', BODY, true),
    [OTHER]: note('Alex records the same visit.', other, true),
    'Projects/Garden visit/Earlier notice.txt': 'The garden may close.',
    'Projects/Garden visit/Later notice.txt': 'The booking is still open.',
    'Projects/Garden visit/Ordinary reference.md': note('Alex keeps an ordinary reference.'),
  }, inbox: [{ line: 'Alex wants the two garden visit notes together.', files: [] }] });
  const ask = { ...empty, asks: [{ notes: [TARGET, OTHER], text: 'Keep one visit note?', yes: 'Write it', no: 'Keep mine' }] };
  base.c.presses = [{ between: [{ kind: 'answer', question: { kind: 'pair', notes: [TARGET, OTHER] }, yes: true }] }];
  const result = await runWithClaude(base.c, replySequence([ask, { ...empty, keep: [{ kept: TARGET, other: OTHER }] }]));
  expect(result.code).toBe(0);
  expect(result.after[OTHER], 'the other note went to the Bin').toBeUndefined();
  const manifests = Object.entries(result.after).filter(([path]) => /\/manifest-[^/]+\.json$/.test(path));
  for (const [, text] of manifests) expect((await parseRunManifestV2(new TextEncoder().encode(text), result.root, RUNNER_WRITES)).ok).toBe(true);
  const merged = manifests.flatMap(([, text]) => (JSON.parse(text) as { operations: Array<{ effect: EditText }> }).operations)
    .map((operation) => operation.effect)
    .find((effect) => effect.kind === 'edit-text' && effect.path === TARGET && effect.beforeText !== undefined);
  expect(merged, 'the keep keeps its C13 inverse before-image').toBeDefined();
  if (merged) {
    const inverse = await undoEdit(merged, new TextEncoder().encode(result.after[TARGET]));
    expect(inverse.ok).toBe(true);
    if (inverse.ok) expect(inverse.text).toBe(base.c.folder[TARGET]);
    expect(await undoEdit(merged, new TextEncoder().encode(`${result.after[TARGET]}\nAlex changed it.`))).toEqual({ ok: false, reason: 'person-edited' });
  }
  return parseNote(TARGET, result.after[TARGET] ?? '').timeline;
}

it('AC6 control: an ordinary link in a carried line becomes its words', async () => {
  const carried = await keep('Alex copied [[Ordinary reference]] into the note.');
  expect(carried.map((e) => [e.text, e.source])).toContainEqual(['From 2026-10-02: Alex copied Ordinary reference into the note.', 'Later notice.txt']);
});

it.each([
  ['inferred', 'The visit may be affected. (inferred) (also from [[Earlier notice.txt]])'],
  ['contradiction', 'Contradiction: Earlier notes give 1,450; later notes give 1,580. (also from [[Earlier notice.txt]])'],
  ['uncertain', 'Uncertain: The garden may close. (also from [[Earlier notice.txt]])'],
])('AC6 b9-keep-citation-and-qualifier: a carried %s line keeps its label, qualifier, citation and source', async (_marker, history) => {
  const carried = await keep(history);
  expect(carried.map((e) => [e.text, e.source]), 'keep carries the canonical citation as a link').toContainEqual([`From 2026-10-02: ${history}`, 'Later notice.txt']);
});

it.each([
  ['an ordinary link before the citation', 'Alex copied [[Ordinary reference]]; the visit may be affected. (inferred) (also from [[Earlier notice.txt]])',
    'From 2026-10-02: Alex copied Ordinary reference; the visit may be affected. (inferred) (also from [[Earlier notice.txt]])'],
  ['an aliased citation', 'The visit may be affected. (inferred) (also from [[Earlier notice.txt|the notice]])',
    'From 2026-10-02: The visit may be affected. (inferred) (also from the notice)'],
  ['a citation not at the end', 'The visit may be affected. (also from [[Earlier notice.txt]]) Alex agrees.',
    'From 2026-10-02: The visit may be affected. (also from Earlier notice.txt) Alex agrees.'],
  ['two citations', 'Uncertain: A. (also from [[Earlier notice.txt]]) (also from [[Ordinary reference]])',
    'From 2026-10-02: Uncertain: A. (also from Earlier notice.txt) (also from [[Ordinary reference]])'],
])('AC6 b9-keep-mixed-links: %s keeps only one canonical end citation as a link (R17)', async (_name, history, carried) => {
  expect((await keep(history)).map((e) => [e.text, e.source])).toContainEqual([carried, 'Later notice.txt']);
});

it('AC6 b9-keep-citation-follows-kept-name: a carried citation of the binned note names the kept note (R18)', async () => {
  const carried = await keep('Uncertain: The two notes may be one visit. (also from [[Second visit]])');
  expect(carried.map((e) => [e.text, e.source]), 'the citation follows the keep rename, as every other link does')
    .toContainEqual(['From 2026-10-02: Uncertain: The two notes may be one visit. (also from [[Visit]])', 'Later notice.txt']);
});

it('AC6 b9-keep-stored-separators: stored line and paragraph separators carry as spaces, so keep never stalls (R16)', async () => {
  const carried = await keep('The visit\u2029may be affected. (inferred) (also from [[Earlier notice.txt]])', { words: ' Alex\u2028sketches.' });
  expect(carried.map((e) => e.text)).toContain('Alex keeps the sketchbook. Alex sketches.');
  expect(carried.map((e) => [e.text, e.source])).toContainEqual(['From 2026-10-02: The visit may be affected. (inferred) (also from [[Earlier notice.txt]])', 'Later notice.txt']);
  // A stored source name that cannot be written carries no source, as an unlinkable name does today.
  const unnamed = await keep('The garden may close.', { source: 'Later\u2028notice.txt' });
  expect(unnamed.map((e) => [e.text, e.source ?? null])).toContainEqual(['From 2026-10-02: The garden may close.', null]);
});
