/** The two B5/B6 template cases land and score through production main with scripted replies (corpus-fix-b56-templates). */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { typeTableOk } from '../../src/data/contracts/note-format';
import type { LastRunFile } from '../../src/data/vault/layout';
import { AT, caseReplies, runWithClaude, type CaseRun } from './corpus-run';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const DIR = (slug: string): string => new URL(`../../testing/corpus/${slug}/`, import.meta.url).pathname;
const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const read = (slug: string, path: string): string => readFileSync(join(DIR(slug), path), 'utf8');
const fresh = (run: CaseRun, c: LoadedCase): string[] => Object.keys(run.after)
  .filter((p) => p.endsWith('.md') && !p.startsWith('.bower/') && !(p in c.folder)).sort();
type Reply = Array<{ things: Array<{ note: { typeRow?: unknown; template?: string } }> }>;
type Table = { rows: Array<{ match: string[]; template: string }> };
type Report = NonNullable<LastRunFile['run']['report']>;

/** Shape reds (R6): the Markdown specimen is gone before anything is read, then the JSON table and replies exist. */
function shape(slug: string, table: unknown, replies: unknown): { table: Table; replies: Reply } {
  expect(existsSync(join(DIR(slug), 'folder/.bower/type-table.md')), 'no Markdown type-table specimen').toBe(false);
  expect(existsSync(join(DIR(slug), 'folder/.bower/type-table.json')), 'a JSON type table').toBe(true);
  expect(existsSync(join(DIR(slug), 'replies.json')), 'scripted replies').toBe(true);
  const bytes = read(slug, 'folder/.bower/type-table.json');
  const value = JSON.parse(bytes) as unknown;
  expect(typeTableOk(value), 'strict type table').toBe(true);
  expect(bytes).toBe(json(value));
  expect(bytes).toBe(json(table));
  const said = read(slug, 'replies.json');
  expect(said).toBe(json(replies));
  const parsed = JSON.parse(said) as Reply;
  expect(parsed[0]?.things[0]?.note.typeRow, 'no typeRow').toBeUndefined();
  return { table: value as Table, replies: parsed };
}

/** Wording reds (R4, R7). */
function wording(slug: string, caseJson: unknown, expectedJson: unknown, rubric: string, stale: RegExp): void {
  const kase = JSON.parse(read(slug, 'case.json')) as { source: string; covers: string; bowerOwned: string[] };
  expect(kase.source).not.toMatch(/pending/i);
  expect(kase.source).toContain('runner/test/b56-corpus.test.ts');
  expect(kase.covers).toBe('model');
  expect(kase.bowerOwned).toContain('.bower/type-table.json');
  expect(kase.bowerOwned).not.toContain('.bower/type-table.md');
  const want = JSON.parse(read(slug, 'expected.json')) as { unchanged: string[]; report: Record<string, unknown> };
  expect(want.unchanged).toContain('.bower/type-table.json');
  expect(want.unchanged).not.toContain('.bower/type-table.md');
  expect(read(slug, 'case.json')).toBe(json(caseJson));
  // The fixture keeps the middle dot escaped, as on main (R4).
  expect(read(slug, 'expected.json')).toBe(json(expectedJson).replaceAll('·', '\\u00b7'));
  expect(read(slug, 'rubric.md')).toBe(rubric);
  expect(read(slug, 'rubric.md')).not.toMatch(stale);
}

const paths = (rows: Array<{ path: string }>): string[] => [...new Set(rows.map((r) => r.path))].sort();

it('corpus-fix-b56-templates AC1: clear-topic fixture uses current useful-output contracts', async () => {
  const slug = 'c17-b56-clear-topic-templates';
  const { replies } = shape(slug, CLEAR.table, CLEAR.replies);
  expect(replies[0]?.things[0]?.note.template).toBe('moc');

  const paper = read(slug, 'folder/Resources/Paper craft/Paper craft.md');
  expect(paper).toBe(CLEAR.paper);
  expect(paper).not.toMatch(/^type:/m);

  wording(slug, CLEAR.case, CLEAR.expected, CLEAR.rubric, /three named templates|lead must approve|draft corpus conventions|pending/i);
  const want = JSON.parse(read(slug, 'expected.json')) as { files: { absent: string[] }; report: Record<string, unknown> };
  expect(want.report.createdAtLeast).toBeUndefined();
  expect(JSON.stringify({ ...want, files: { ...want.files, absent: [] } })).not.toContain('Sources/');

  const c = await loadCase(resolve(DIR(slug)));
  const run = await runWithClaude(c, caseReplies(slug));
  expect(run.code).toBe(0);
  expect(run.score).toEqual({ pass: true, unmet: [] });
  const report = (run.lastRun as LastRunFile).run.report as Report;
  expect(paths(report.created)).toEqual(['Bower health.md', 'Resources/Rainwater/Rainwater.md']);
  expect(report.updated).toEqual([]);
  expect(report.filed).toHaveLength(1);
  expect(c.expected.report?.created).toEqual(['Resources/Rainwater/Rainwater.md', 'Bower health.md']);
  expect(c.expected.report?.updated).toEqual([]);

  expect(fresh(run, c)).toEqual(['Bower health.md', 'Resources/Rainwater/Rainwater.md']);
  expect(run.after['Resources/Rainwater/Rainwater article.txt']).toBe(c.inboxFiles['Rainwater article.txt']);
  expect(run.after['Resources/Rainwater/Rainwater.md'])
    .toContain('## Overview\nA covered rainwater container keeps leaves out. A removable screen catches twigs.\n');

  for (const p of ['Resources/Paper craft/Paper craft.md', 'Rules.md', '.bower/type-table.json']) expect(run.after[p], p).toBe(c.folder[p]);
});

it('corpus-fix-b56-templates AC2: personal-sale fixture proves project fit without adopting personal content', async () => {
  const slug = 'c17-b56-personal-sale-project';
  const HUB = 'Projects/Bicycle sale/Bicycle sale.md';
  const NOTE = 'Projects/Bicycle sale/Bicycle sale details.md';
  const { table, replies } = shape(slug, SALE.table, SALE.replies);
  const row = table.rows[0];
  expect(table.rows).toHaveLength(1);
  expect(replies[0]?.things[0]?.note.template).toBe('source');
  expect(replies[0]?.things[0]?.note.template).toBe(row?.template);
  expect(row?.match).toEqual(['sale']);
  expect('bicycle sale details.txt'.includes(row?.match[0] ?? '?')).toBe(true);

  wording(slug, SALE.case, SALE.expected, SALE.rubric, /B1d|script candidate list|manifest evidence|five-note budget|pending/i);

  const c = await loadCase(resolve(DIR(slug)));
  const run = await runWithClaude(c, caseReplies(slug));
  expect(run.code).toBe(0);
  expect(run.score).toEqual({ pass: true, unmet: [] });
  const report = (run.lastRun as LastRunFile).run.report as Report;
  expect(paths(report.created)).toEqual(['Bower health.md', NOTE]);
  expect(paths(report.updated)).toEqual([HUB]);
  expect(c.expected.report?.created).toEqual([NOTE, 'Bower health.md']);
  expect(c.expected.report?.updated).toEqual([HUB]);
  expect(fresh(run, c)).toEqual(['Bower health.md', NOTE]);

  expect(c.folder[HUB]).toContain('## My notes\nAlex will keep the bell.\n');
  expect(run.after[HUB]).toBe(`${c.folder[HUB]}- 2026-10-07 · The bicycle asking price is 240; collection is in Saltmere; reply by 2026-10-12. · [[Bicycle sale details]]\n`);
  for (const p of ['Resources/Ideas/Ideas.md', 'Rules.md', '.bower/type-table.json']) expect(run.after[p], p).toBe(c.folder[p]);

  const note = run.after[NOTE] ?? '';
  expect(note).toContain(SALE.replies[0]?.things[0]?.note.body);
  expect(note).toContain('bower_template: source');
  expect(note).not.toContain('Alex will keep the bell.');
  expect(Object.keys(run.after).filter((p) => p.startsWith('Resources/Ideas/'))).toEqual(['Resources/Ideas/Ideas.md']);
});

// The pinned bytes of the rulings (R1-R4, R7), held here so each fixture is checked byte for byte.
const CLEAR = {
  paper: '---\nsummary: Reference notes about folded paper.\nstatus: active\nby: bower\n---\n\n## Overview\nFolded paper reference.\n\n## Notes\n\n## Sources\n\n## Timeline\n- 2026-10-02 · Started the paper craft topic.\n',
  table: { v: 1, rows: [{ id: 'article', match: ['article', 'web clip'], template: 'source', properties: {}, table: [] }] },
  replies: [{ kind: 'tidy-intent', v: 1, things: [{ fileId: '$file:Rainwater article.txt', to: 'Resources/Rainwater', name: 'Rainwater article.txt',
    note: { name: 'Rainwater.md', template: 'moc', summary: 'Keeping leaves and twigs out of a rainwater container.',
      body: 'A covered rainwater container keeps leaves out. A removable screen catches twigs.' } }] }],
  case: { id: 'c17-b56-clear-topic-templates', capability: 'C17', title: 'A clear new reference topic starts with its own MOC hub', covers: 'model',
    source: 'new (TL-P4-38 B6 preparation; scripted through production main in runner/test/b56-corpus.test.ts, not semantic model evidence)',
    scope: 'all', allowWeb: false,
    inbox: [{ line: 'Save this rainwater article as reference for a new Rainwater topic; it is not a project or ongoing responsibility.', files: ['Rainwater article.txt'] }],
    journal: [], questions: [], bowerOwned: ['Rules.md', '.bower/type-table.json', 'Resources/Paper craft/Paper craft.md'] },
  expected: {
    files: {
      present: ['Resources/Rainwater/Rainwater article.txt', 'Resources/Rainwater/Rainwater.md'],
      absent: ['Inbox/*', 'Areas/Rainwater/*', 'Projects/Rainwater/*', 'Resources/Rainwater/Sources/*', 'Resources/Rainwater/*concept*', 'Resources/Paper craft/*ainwater*'],
    },
    unchanged: ['Rules.md', '.bower/type-table.json', 'Resources/Paper craft/Paper craft.md'],
    notes: [{ path: 'Resources/Rainwater/Rainwater.md',
      contains: ['summary: Keeping leaves and twigs out of a rainwater container.', 'type: moc', 'status: evergreen',
        '## Overview\nA covered rainwater container keeps leaves out. A removable screen catches twigs.\n', '## Notes', '## Sources\nRainwater article.txt\n'],
      excludes: ['Paper craft', '## Timeline'] }],
    linksResolve: true,
    report: { filed: 1, created: ['Resources/Rainwater/Rainwater.md', 'Bower health.md'], updated: [], questionsExactly: 0, setAside: 0 },
  },
  rubric: 'Fit, then create, then ask: the starting folder has no fitting Rainwater project, area, topic or near-duplicate name, and the person\'s words call the article reference for a new topic. File the original in a new Resources/Rainwater folder and write one note, Rainwater.md, from the moc template: the topic\'s own hub, evergreen, its Overview holding only the article\'s claims, its Notes and Sources sections present, and no Timeline. Report exactly that note and the health note as created, with nothing updated. No concept, source or Sources subfolder is required, no advice, and no link to the unrelated Paper craft note. Paper craft is a legacy, untyped Bower note and stays byte identical: Bower adds no metadata to it. The folder\'s JSON type table declares the seed\'s article row; under a model selection its source template binds only where the destination already has exactly one hub, so it leaves a new topic\'s first note free. Scripted replies prove deterministic integration through production main; they do not prove semantic model success or C17 registration.\n',
};

const SALE = {
  table: { v: 1, rows: [{ id: 'sale', match: ['sale'], template: 'source', properties: {}, table: [] }] },
  replies: [{ kind: 'tidy-intent', v: 1,
    things: [{ fileId: '$file:Bicycle sale details.txt', to: 'Projects/Bicycle sale', name: 'Bicycle sale details.txt', basis: 'Projects/Bicycle sale/Bicycle sale.md',
      note: { name: 'Bicycle sale details.md', template: 'source',
        summary: 'The blue touring bicycle is for sale at 240, collected in Saltmere, reply by 2026-10-12.',
        body: 'Asking price: 240. Collection in Saltmere. Reply by 2026-10-12.\n\nSee also [[Projects/Bicycle sale/Bicycle sale]]: the sale this listing belongs to.' } }],
    lines: [{ note: 'Projects/Bicycle sale/Bicycle sale.md', text: 'The bicycle asking price is 240; collection is in Saltmere; reply by 2026-10-12.', cites: '$file:Bicycle sale details.txt' }] }],
  case: { id: 'c17-b56-personal-sale-project', capability: 'C17', title: 'A personal sale fits its project before a generic Ideas folder', covers: 'model',
    source: 'new (TL-P4-38 B5/B6 preparation; scripted through production main in runner/test/b56-corpus.test.ts, not semantic model evidence)',
    scope: 'all', allowWeb: false,
    inbox: [{ line: 'This is material for selling my blue touring bicycle.', files: ['Bicycle sale details.txt'] }],
    journal: [], questions: [], bowerOwned: ['Rules.md', '.bower/type-table.json', 'Projects/Bicycle sale/Bicycle sale.md', 'Resources/Ideas/Ideas.md'] },
  expected: {
    files: {
      present: ['Projects/Bicycle sale/Bicycle sale details.txt', 'Projects/Bicycle sale/Bicycle sale details.md'],
      absent: ['Inbox/*', 'Resources/Ideas/*sale*', 'Projects/*icycle*/Bicycle sale details (2).md'],
    },
    unchanged: ['Rules.md', '.bower/type-table.json', 'Resources/Ideas/Ideas.md'],
    protectedRanges: [{ path: 'Projects/Bicycle sale/Bicycle sale.md', range: { heading: 'My notes' } }],
    notes: [
      { path: 'Projects/Bicycle sale/Bicycle sale.md',
        timeline: ['2026-10-02 · Started the bicycle sale.', 'The bicycle asking price is 240; collection is in Saltmere; reply by 2026-10-12.'],
        timelineCount: 2 },
      { path: 'Projects/Bicycle sale/Bicycle sale details.md',
        contains: ['bower_template: source', 'original: Bicycle sale details.txt',
          'See also [[Projects/Bicycle sale/Bicycle sale]]: the sale this listing belongs to.', '240', 'Saltmere', '2026-10-12'],
        excludes: ['Alex will keep the bell.', '[[Resources/Ideas/Ideas]]'] },
    ],
    linksResolve: true,
    report: { filed: 1, created: ['Projects/Bicycle sale/Bicycle sale details.md', 'Bower health.md'], updated: ['Projects/Bicycle sale/Bicycle sale.md'], questionsExactly: 0, setAside: 0 },
  },
  rubric: 'Fit before create or ask: personal property can belong to an existing sale project. File the details original and its note in Bicycle sale, never the generic Ideas topic, and create no other sale folder. The folder\'s JSON type table declares a sale row, matched by the word sale in the file\'s name; the note takes that row\'s source template, and its link to the sale hub says why. Add only the stated price, collection place and reply deadline, as one sourced Timeline line on the hub, never on the source note. Alex\'s bell sentence under My notes and the old dated history stay byte identical, and the note copies no personal sentence; Ideas, Rules and the type table stay byte identical. No invented advice or next steps. Report the note and the health note as created and the hub as updated. Scripted replies prove deterministic integration through production main; they do not prove semantic model success or C17 registration.\n',
};
