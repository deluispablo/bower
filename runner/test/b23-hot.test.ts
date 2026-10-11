import { expect, it } from 'vitest';

interface HotInputs {
  today: string;
  openQuestions: { id: string; text: string }[];
  hubs: { path: string; lastSettledChange: string | null }[];
  changes: { id: string; at: string; text: string }[];
}

interface HotModule {
  renderHot(inputs: HotInputs): { text: string; provenance: Record<string, string[]> };
  sameExceptDate(a: string, b: string): boolean;
  boundHot(text?: string | null): string;
}

// A variable import keeps the unimplemented module out of static resolution and tsc.
// Only a missing target is converted to an assertion; other module failures remain visible.
async function hot(reason: string): Promise<HotModule> {
  const path = '../src/hot.ts';
  let loaded: unknown;
  try {
    loaded = await import(path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('hot.ts') || !/Cannot find module|Failed to load url|Cannot find package/.test(message)) throw error;
    expect.fail(`${reason}: missing runner/src/hot.ts implementation`);
  }
  for (const name of ['renderHot', 'sameExceptDate', 'boundHot']) {
    expect(Reflect.get(loaded as object, name), `${reason}: missing ${name} export`).toBeTypeOf('function');
  }
  return loaded as HotModule;
}

// Addendum 6: pin the suffix without inventing a second operation-key formatter.
const recentRow = (text: string) => expect.stringMatching(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · op:[a-f0-9]{12}$`));
const TODAY = '2026-10-10';
const inputs = (overrides: Partial<HotInputs> = {}): HotInputs => ({
  today: TODAY, openQuestions: [], hubs: [], changes: [], ...overrides,
});
const words = (word: string, count: number): string => Array.from({ length: count }, () => word).join(' ');
const question = (n: number) => ({ id: `q-${n}`, text: `Thread ${n}` });
const hub = (n: number) => ({ path: `Projects/Focus-${n}`, lastSettledChange: '2026-10-09' });
const change = (n: number) => ({ id: `c-${n}`, at: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`, text: `Change ${n}` });

// Nonempty-row helpers; the empty-input test checks the exact text, including whitespace.
const lines = (text: string): string[] => text.split('\n').filter((line) => line !== '');
function section(text: string, heading: string): string[] {
  const all = lines(text);
  const start = all.indexOf(`## ${heading}`);
  expect(start, `missing ${heading} heading`).toBeGreaterThanOrEqual(0);
  const next = all.findIndex((line, index) => index > start && line.startsWith('## '));
  return all.slice(start + 1, next === -1 ? undefined : next);
}
const wordCount = (text: string): number => text.trim().split(/\s+/).length;
const lists = (provenance: Record<string, string[]>): string[][] => Object.values(provenance);

it('B3a hot: exact section order and headings', async () => {
  const { renderHot } = await hot('exact section order and headings');
  const fixture = inputs({
    openQuestions: [{ id: 'q-control', text: 'Choose a next step' }],
    hubs: [{ path: 'Projects/Practice', lastSettledChange: '2026-10-08T09:00:00Z' }],
    changes: [{ id: 'c-control', at: '2026-10-09T12:00:00Z', text: 'Saved the outline' }],
  });
  const rendered = renderHot(fixture);
  // Positive control: ordinary primary evidence is actually displayed.
  expect(rendered.text).toContain('- Choose a next step');
  expect(lines(rendered.text)).toEqual([
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', '- Choose a next step',
    '## Current focus', '- Projects/Practice (2026-10-08)',
    '## Recent changes', recentRow('- 2026-10-09 Saved the outline'),
  ]);
  expect(renderHot(fixture)).toEqual(rendered);
  expect(fixture).toEqual(inputs({
    openQuestions: [{ id: 'q-control', text: 'Choose a next step' }],
    hubs: [{ path: 'Projects/Practice', lastSettledChange: '2026-10-08T09:00:00Z' }],
    changes: [{ id: 'c-control', at: '2026-10-09T12:00:00Z', text: 'Saved the outline' }],
  }));
});

it('B3a hot: empty inputs leave three bare headings', async () => {
  const { renderHot } = await hot('empty inputs leave three bare headings');
  expect(section(renderHot(inputs({ openQuestions: [question(1)] })).text, 'Open threads')).toEqual(['- Thread 1']);
  expect(renderHot(inputs()).text).toBe([
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', '## Current focus', '## Recent changes',
  ].join('\n'));
  expect(lists(renderHot(inputs()).provenance).flat()).toEqual([]);
});

it('B3a hot: row caps keep 10 threads 5 hubs and 10 changes with only a thread mark', async () => {
  const { renderHot } = await hot('row caps keep 10 threads 5 hubs and 10 changes with only a thread mark');
  const questions = Array.from({ length: 13 }, (_, i) => question(i + 1));
  const hubs = Array.from({ length: 7 }, (_, i) => hub(i + 1));
  const changes = Array.from({ length: 13 }, (_, i) => ({ ...change(1), id: `c-${String(i + 1).padStart(2, '0')}`, text: `Change ${i + 1}` }));
  const control = renderHot(inputs({ openQuestions: questions.slice(0, 10), hubs: hubs.slice(0, 5), changes: changes.slice(0, 10) }));
  expect(section(control.text, 'Open threads')).toHaveLength(10);
  expect(section(control.text, 'Current focus')).toHaveLength(5);
  expect(section(control.text, 'Recent changes')).toHaveLength(10);
  expect(control.text).not.toContain('more');
  const result = renderHot(inputs({ openQuestions: questions, hubs, changes })).text;
  expect(section(result, 'Open threads')).toEqual([...questions.slice(0, 10).map((q) => `- ${q.text}`), '- and 3 more waiting on Home']);
  expect.soft(section(result, 'Current focus')).toEqual(hubs.slice(0, 5).map((h) => `- ${h.path} (2026-10-09)`));
  expect(section(result, 'Recent changes')).toEqual(changes.slice(0, 10).map((c) => recentRow(`- 2026-10-01 ${c.text}`)));
});

it('B3a hot: 6 hubs and 11 changes keep exactly 300 capped words without marks', async () => {
  const { renderHot } = await hot('6 hubs and 11 changes keep exactly 300 capped words without marks');
  const hubs = Array.from({ length: 6 }, (_, i) => ({ path: `H${i}`, lastSettledChange: '2026-10-09' }));
  const changes = Array.from({ length: 11 }, (_, i) => ({
    id: `c${String(i).padStart(2, '0')}`, at: '2026-10-09', text: words(`change-${i}`, i === 0 ? 223 : 1),
  }));
  const expected = [
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', '## Current focus',
    ...hubs.slice(0, 5).map((h) => `- ${h.path} (2026-10-09)`), '## Recent changes',
    ...changes.slice(0, 10).map((c) => recentRow(`- 2026-10-09 ${c.text}`)),
  ];
  // Positive control: the same retained evidence without over-cap inputs needs no cut.
  const control = renderHot(inputs({ hubs: hubs.slice(0, 5), changes: changes.slice(0, 10) })).text;
  expect(control.split('\n')).toEqual(expected);
  expect(wordCount(control)).toBe(300);
  const result = renderHot(inputs({ hubs, changes }));
  expect.soft(section(result.text, 'Current focus')).toEqual(hubs.slice(0, 5).map((h) => `- ${h.path} (2026-10-09)`));
  expect(section(result.text, 'Recent changes')).toEqual(changes.slice(0, 10).map((c) => recentRow(`- 2026-10-09 ${c.text}`)));
  expect(result.text.split('\n')).toEqual(expected);
  expect(wordCount(result.text)).toBe(300);
  expect(result.text).not.toContain('more');
  expect(lists(result.provenance)).toContainEqual(hubs.slice(0, 5).map((h) => h.path));
  expect(lists(result.provenance)).toContainEqual(changes.slice(0, 10).map((c) => c.id));
});

it('B3a hot: day 30 is in day 31 and null are out', async () => {
  const { renderHot } = await hot('day 30 is in day 31 and null are out');
  const result = renderHot(inputs({ hubs: [
    { path: 'Projects/Today', lastSettledChange: '2026-10-10' },
    { path: 'Projects/Day-30', lastSettledChange: '2026-09-10T00:00:00Z' },
    { path: 'Projects/Day-31', lastSettledChange: '2026-09-09T23:59:59Z' },
    { path: 'Areas/Unsettled', lastSettledChange: null },
  ] })).text;
  expect(section(renderHot(inputs({ hubs: [hub(1)] })).text, 'Current focus')).toEqual(['- Projects/Focus-1 (2026-10-09)']);
  expect(section(result, 'Current focus')).toEqual([
    '- Projects/Today (2026-10-10)', '- Projects/Day-30 (2026-09-10)',
  ]);
});

it('B3a hot: newest first breaks ties by path and id', async () => {
  const { renderHot } = await hot('newest first breaks ties by path and id');
  const fixture = inputs({
    openQuestions: [question(3), question(1), question(2)],
    hubs: [
      { path: 'Projects/Zeta', lastSettledChange: '2026-10-09T12:00:00Z' },
      { path: 'Projects/Old', lastSettledChange: '2026-10-08T12:00:00Z' },
      { path: 'Areas/Alpha', lastSettledChange: '2026-10-09T12:00:00Z' },
      { path: 'Projects/New', lastSettledChange: '2026-10-10T12:00:00Z' },
    ],
    changes: [
      { id: 'c-z', at: '2026-10-09T12:00:00Z', text: 'Zeta change' },
      { id: 'c-old', at: '2026-10-08T12:00:00Z', text: 'Older change' },
      { id: 'c-a', at: '2026-10-09T12:00:00Z', text: 'Alpha change' },
      { id: 'c-new', at: '2026-10-09T18:00:00Z', text: 'Later same day' },
    ],
  });
  const text = renderHot(fixture).text;
  expect(section(renderHot(inputs({ changes: [change(2), change(1)] })).text, 'Recent changes')).toEqual([
    recentRow('- 2026-10-02 Change 2'), recentRow('- 2026-10-01 Change 1'),
  ]);
  expect(section(text, 'Open threads')).toEqual(['- Thread 3', '- Thread 1', '- Thread 2']);
  expect(section(text, 'Current focus')).toEqual([
    '- Projects/New (2026-10-10)', '- Areas/Alpha (2026-10-09)',
    '- Projects/Zeta (2026-10-09)', '- Projects/Old (2026-10-08)',
  ]);
  expect(section(text, 'Recent changes')).toEqual([
    recentRow('- 2026-10-09 Later same day'), recentRow('- 2026-10-09 Alpha change'),
    recentRow('- 2026-10-09 Zeta change'), recentRow('- 2026-10-08 Older change'),
  ]);
});

it('B3a hot: de-duplicates identities without merging equal text', async () => {
  const { renderHot } = await hot('de-duplicates identities without merging equal text');
  const q = { id: 'q-a', text: 'Same question' };
  const h = hub(1);
  const c = { id: 'c-a', at: '2026-10-09', text: 'Same change' };
  const control = inputs({ openQuestions: [q, { ...q, id: 'q-b' }], hubs: [h, hub(2)], changes: [c, { ...c, id: 'c-b' }] });
  const expected = renderHot(control);
  expect(section(expected.text, 'Open threads')).toEqual(['- Same question', '- Same question']);
  expect(section(expected.text, 'Current focus')).toHaveLength(2);
  expect(section(expected.text, 'Recent changes')).toEqual([recentRow('- 2026-10-09 Same change'), recentRow('- 2026-10-09 Same change')]);
  expect(renderHot(inputs({
    openQuestions: [q, q, { ...q, id: 'q-b' }],
    hubs: [h, h, hub(2)], changes: [c, c, { ...c, id: 'c-b' }],
  }))).toEqual(expected);
});

it('B3a hot: multiline and heading text stays one row', async () => {
  const { renderHot } = await hot('multiline and heading text stays one row');
  const plain = renderHot(inputs({ openQuestions: [{ id: 'q-a', text: 'One plain thread' }] })).text;
  expect(section(plain, 'Open threads')).toEqual(['- One plain thread']);
  const text = renderHot(inputs({
    openQuestions: [{ id: 'q-a', text: '  First\n## Injected\r\n- Extra\t row  ' }],
    hubs: [{ path: 'Projects/First\n## Fake\t Hub', lastSettledChange: '2026-10-09' }],
    changes: [{ id: 'c-a', at: '2026-10-09', text: 'Saved\n## Injected\n- Other\t change' }],
  })).text;
  expect(section(text, 'Open threads')).toEqual(['- First ## Injected - Extra row']);
  expect(section(text, 'Current focus')).toEqual(['- Projects/First ## Fake Hub (2026-10-09)']);
  expect(section(text, 'Recent changes')).toEqual([recentRow('- 2026-10-09 Saved ## Injected - Other change')]);
  expect(lines(text).filter((line) => line.startsWith('## '))).toEqual([
    '## Open threads', '## Current focus', '## Recent changes',
  ]);
});

// CommonMark 0.31.2 §4.6: all seven HTML-block starts, including all four type-1 tags.
// https://spec.commonmark.org/0.31.2/#html-blocks (offline reference; no page fetched).
const htmlBlockInputs = [
  { label: 'HTML type 1 script', text: '<script>injected</script>' },
  { label: 'HTML type 1 pre', text: '<pre>' },
  { label: 'HTML type 1 style', text: '<style>' },
  { label: 'HTML type 1 textarea', text: '<textarea>' },
  { label: 'HTML type 2 comment', text: '<!-- x' },
  { label: 'HTML type 3 processing instruction', text: '<?x' },
  { label: 'HTML type 4 declaration', text: '<!DOCTYPE' },
  { label: 'HTML type 5 CDATA', text: '<![CDATA[' },
  { label: 'HTML type 6 block tag', text: '<div>' },
  { label: 'HTML type 7 custom tag', text: '<custom-tag>' },
].flatMap(({ label, text }) => [
  { label, text },
  { label: `${label} after whitespace`, text: ` \t${text}\t ` },
  { label: `${label} after newlines`, text: ` \n\t\r\n${text}\r\n ` },
]);

// CommonMark 0.31.2 §2.4: escape the leading ASCII marker so list content starts literally.
const blockInputs = [
  { label: 'ATX heading', text: '## Injected' },
  { label: 'level-one heading', text: '# x' },
  { label: 'hyphen list', text: '- Extra row' },
  { label: 'asterisk list', text: '* x' },
  { label: 'plus list', text: '+ x' },
  { label: 'ordered list', text: '1. x' },
  { label: 'block quote', text: '> x' },
  { label: 'backtick fence', text: '```' },
  { label: 'tilde fence', text: '~~~' },
  { label: 'heading after newline', text: ' \n## Injected\r\n' },
  { label: 'list after newline', text: '\n- Extra\t row ' },
  ...htmlBlockInputs,
];

function literalRow(text: string, expected: string, prefix = ''): string {
  const rows = text.split('\n').filter((line) => line.startsWith('- '));
  expect(rows).toHaveLength(1);
  const row = rows[0] ?? '';
  expect(row.startsWith(`- ${prefix}`)).toBe(true);
  const content = row.slice(2 + prefix.length);
  // Check input content after the list marker and any generated date prefix.
  expect(content, 'row content must not start a CommonMark block').not.toMatch(
    /^(?:#{1,6}(?:\s|$)|[-*+](?:\s|$)|\d{1,9}[.)](?:\s|$)|>|`{3,}|~{3,}|<)/u,
  );
  if (expected.startsWith('<')) {
    expect(content.startsWith('\\<'), 'HTML opener must start with a literal escaped less-than sign').toBe(true);
  }
  // Accept any valid ASCII punctuation escape while preserving the literal input.
  expect(content.replace(/\\([!-/:-@[-`{-~])/gu, '$1')).toBe(expected);
  return row;
}

it.each(blockInputs)('B3a hot: question $label starts literally in one top-level row', async ({ text }) => {
  const { renderHot } = await hot('question block syntax starts literally in one top-level row');
  expect(section(renderHot(inputs({ openQuestions: [question(1)] })).text, 'Open threads')).toEqual(['- Thread 1']);
  const rendered = renderHot(inputs({ openQuestions: [{ id: 'q-block', text }] })).text;
  const parsedLines = rendered.split('\n');
  const row = literalRow(rendered, text.replace(/\s+/gu, ' ').trim());
  expect(parsedLines).toEqual([
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', row, '## Current focus', '## Recent changes',
  ]);
});

it.each(blockInputs)('B3a hot: hub $label starts literally in one top-level row', async ({ text }) => {
  const { renderHot } = await hot('hub block syntax starts literally in one top-level row');
  expect(section(renderHot(inputs({ hubs: [hub(1)] })).text, 'Current focus')).toEqual(['- Projects/Focus-1 (2026-10-09)']);
  const rendered = renderHot(inputs({ hubs: [{ path: text, lastSettledChange: '2026-10-09' }] })).text;
  const parsedLines = rendered.split('\n');
  const row = literalRow(rendered, `${text.replace(/\s+/gu, ' ').trim()} (2026-10-09)`);
  expect(parsedLines).toEqual([
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', '## Current focus',
    row, '## Recent changes',
  ]);
});

it.each(blockInputs)('B3a hot: change $label starts literally in one top-level row', async ({ text }) => {
  const { renderHot } = await hot('change block syntax starts literally in one top-level row');
  expect(section(renderHot(inputs({ changes: [change(1)] })).text, 'Recent changes')).toEqual([recentRow('- 2026-10-01 Change 1')]);
  const rendered = renderHot(inputs({ changes: [{ id: 'c-block', at: '2026-10-09', text }] })).text;
  const parsedLines = rendered.split('\n');
  const dated = section(rendered, 'Recent changes')[0] ?? '';
  expect(dated).toMatch(/ · op:[a-f0-9]{12}$/);
  const suffix = / · op:[a-f0-9]{12}$/.exec(dated)?.[0] ?? '';
  const row = literalRow(rendered, `${text.replace(/\s+/gu, ' ').trim()}${suffix}`, '2026-10-09 ');
  expect(parsedLines).toEqual([
    '# Hot', `_Updated: ${TODAY}_`, '## Open threads', '## Current focus', '## Recent changes', row,
  ]);
});

it('B3a hot: 300 words cuts changes then focus then threads with full counts', async () => {
  const { renderHot } = await hot('300 words cuts changes then focus then threads with full counts');
  const control = renderHot(inputs({ openQuestions: [question(1)], hubs: [hub(1)], changes: [change(1)] })).text;
  expect(wordCount(control)).toBeLessThanOrEqual(300);
  expect(control).not.toContain('more');
  // The fixed heading/date words plus this row total exactly 300.
  const atLimit = renderHot(inputs({ openQuestions: [{ id: 'q-limit', text: words('thread', 286) }] })).text;
  expect(wordCount(atLimit)).toBe(300);
  expect(section(atLimit, 'Open threads')).toEqual([`- ${words('thread', 286)}`]);
  const aboveLimit = renderHot(inputs({ openQuestions: [{ id: 'q-limit', text: words('thread', 287) }] })).text;
  expect(section(aboveLimit, 'Open threads')).toEqual(['- and 1 more waiting on Home']);
  expect(wordCount(aboveLimit)).toBeLessThanOrEqual(300);
  const longChanges = [1, 2, 3].map((n) => ({ ...change(n), text: words(`change-${n}`, 100) }));
  const cutChanges = renderHot(inputs({ openQuestions: [question(1)], hubs: [hub(1)], changes: longChanges })).text;
  expect(section(cutChanges, 'Open threads')).toEqual(['- Thread 1']);
  expect(section(cutChanges, 'Current focus')).toEqual(['- Projects/Focus-1 (2026-10-09)']);
  expect(section(cutChanges, 'Recent changes')).toEqual([
    recentRow(`- 2026-10-03 ${words('change-3', 100)}`), recentRow(`- 2026-10-02 ${words('change-2', 100)}`), '- (1 more)',
  ]);
  expect(wordCount(cutChanges)).toBeLessThanOrEqual(300);

  const longHubs = [1, 2, 3].map((n) => ({ path: `Projects/${words(`focus-${n}`, 100)}`, lastSettledChange: `2026-10-0${n}` }));
  const cutFocus = renderHot(inputs({ openQuestions: [question(1)], hubs: longHubs, changes: [change(1), change(2), change(3)] })).text;
  expect(section(cutFocus, 'Open threads')).toEqual(['- Thread 1']);
  expect(section(cutFocus, 'Current focus')).toEqual([
    `- Projects/${words('focus-3', 100)} (2026-10-03)`,
    `- Projects/${words('focus-2', 100)} (2026-10-02)`, '- (1 more)',
  ]);
  expect(section(cutFocus, 'Recent changes')).toEqual(['- (3 more)']);
  expect(wordCount(cutFocus)).toBeLessThanOrEqual(300);

  const longQuestions = Array.from({ length: 12 }, (_, i) => ({ id: `q-${i + 1}`, text: words(`thread-${i + 1}`, 30) }));
  const cutThreads = renderHot(inputs({ openQuestions: longQuestions, hubs: [hub(1)], changes: [change(1)] })).text;
  expect(section(cutThreads, 'Open threads')).toEqual([
    ...longQuestions.slice(0, 8).map((q) => `- ${q.text}`), '- and 4 more waiting on Home',
  ]);
  expect(section(cutThreads, 'Current focus')).toEqual(['- (1 more)']);
  expect(section(cutThreads, 'Recent changes')).toEqual(['- (1 more)']);
  expect(wordCount(cutThreads)).toBeLessThanOrEqual(300);

  const oversized = renderHot(inputs({ openQuestions: [{ id: 'q-huge', text: words('question', 400) }] })).text;
  expect(section(oversized, 'Open threads')).toEqual(['- and 1 more waiting on Home']);
  expect(wordCount(oversized)).toBeLessThanOrEqual(300);
});

it('B3a hot: provenance lists only displayed identities', async () => {
  const { renderHot } = await hot('provenance lists only displayed identities');
  const control = renderHot(inputs({ openQuestions: [question(1)], hubs: [hub(1)], changes: [change(1)] }));
  expect(lists(control.provenance)).toContainEqual(['q-1']);
  expect(lists(control.provenance)).toContainEqual(['Projects/Focus-1']);
  expect(lists(control.provenance)).toContainEqual(['c-1']);
  const questions = Array.from({ length: 11 }, (_, i) => question(i + 1));
  const hubs = Array.from({ length: 6 }, (_, i) => hub(i + 1));
  const changes = Array.from({ length: 11 }, (_, i) => ({ ...change(1), id: `c-${String(i + 1).padStart(2, '0')}` }));
  const capped = renderHot(inputs({
    openQuestions: [...questions, question(1)],
    hubs: [...hubs, hub(1), { path: 'Projects/Old', lastSettledChange: '2026-09-01' }],
    changes: [...changes, { ...change(1), id: 'c-01' }],
  }));
  expect(lists(capped.provenance)).toContainEqual(questions.slice(0, 10).map((q) => q.id));
  expect(lists(capped.provenance)).toContainEqual(hubs.slice(0, 5).map((h) => h.path));
  expect(lists(capped.provenance)).toContainEqual(changes.slice(0, 10).map((c) => c.id));
  expect(lists(capped.provenance).flat().sort()).toEqual([
    ...questions.slice(0, 10).map((q) => q.id), ...hubs.slice(0, 5).map((h) => h.path),
    ...changes.slice(0, 10).map((c) => c.id),
  ].sort());
  const cut = renderHot(inputs({
    openQuestions: [question(1)], hubs: [hub(1)],
    changes: [1, 2, 3].map((n) => ({ ...change(n), text: words(`change-${n}`, 100) })),
  }));
  expect(lists(cut.provenance)).toContainEqual(['c-3', 'c-2']);
  expect(lists(cut.provenance).flat()).not.toContain('c-1');
  const cutThreads = renderHot(inputs({
    openQuestions: Array.from({ length: 12 }, (_, i) => ({ id: `q-${i + 1}`, text: words('thread', 30) })),
    hubs: [hub(1)], changes: [change(1)],
  }));
  expect(lists(cutThreads.provenance).flat().sort()).toEqual(
    Array.from({ length: 8 }, (_, i) => `q-${i + 1}`).sort(),
  );
});

it('B3a hot: sameExceptDate ignores only the updated line', async () => {
  const { sameExceptDate, renderHot } = await hot('sameExceptDate ignores only the updated line');
  const a = renderHot(inputs({ openQuestions: [question(1)] })).text;
  const b = renderHot(inputs({ today: '2026-10-11', openQuestions: [question(1)] })).text;
  expect(sameExceptDate(a, a)).toBe(true);
  expect(sameExceptDate(a, b)).toBe(true);
  expect(sameExceptDate(b, a)).toBe(true);
  expect(sameExceptDate(a, b.replace('Thread 1', 'Thread 2'))).toBe(false);
  expect(sameExceptDate(a, b.replace('## Open threads', '## Other threads'))).toBe(false);
  expect(sameExceptDate(`${a}\n- _Updated: 2026-10-10_`, `${b}\n- _Updated: 2026-10-11_`)).toBe(false);
  expect(sameExceptDate('no stamp', 'no stamp')).toBe(true);
  expect(sameExceptDate('no stamp', 'different text')).toBe(false);
});

it('B3a hot: boundHot caps 3999 4000 4001 and preserves surrogate pairs', async () => {
  const { boundHot } = await hot('boundHot caps 3999 4000 4001 and preserves surrogate pairs');
  expect(boundHot('Short hot')).toBe('Short hot');
  expect(boundHot('')).toBe('');
  expect(boundHot()).toBe('');
  expect(boundHot(undefined)).toBe('');
  expect(boundHot(null)).toBe('');
  expect(boundHot('x'.repeat(3999))).toBe('x'.repeat(3999));
  expect(boundHot('x'.repeat(4000))).toBe('x'.repeat(4000));
  const mark = '\n(hot cut at 4,000 characters)';
  const cut = boundHot('x'.repeat(4001));
  expect(cut.length).toBeLessThanOrEqual(4000);
  expect(cut.endsWith(mark)).toBe(true);
  expect(cut.slice(0, -mark.length)).toMatch(/^x+$/);
  // Cover both the raw 4,000 edge and the edge after reserving room for the mark.
  for (const edge of [4000, 4000 - mark.length]) {
    const source = `${'x'.repeat(edge - 1)}\u{1F426}${'y'.repeat(100)}`;
    const bounded = boundHot(source);
    expect(bounded.length).toBeLessThanOrEqual(4000);
    expect(bounded.endsWith(mark)).toBe(true);
    const payload = bounded.slice(0, -mark.length);
    expect(payload.length).toBeGreaterThan(0);
    expect(source.startsWith(payload)).toBe(true);
    for (const character of payload) {
      const codePoint = character.codePointAt(0) ?? 0;
      expect(codePoint < 0xD800 || codePoint > 0xDFFF, 'no lone UTF-16 surrogate').toBe(true);
    }
  }
  const intact = `${'x'.repeat(3998)}\u{1F426}`;
  expect(boundHot(intact)).toBe(intact);
});
