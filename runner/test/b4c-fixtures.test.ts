/** B4c-a: the three retained C17 B4 cases in the landed grammar, through production main and the corpus driver. */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, type LoadedCase } from '../src/corpus';
import { aboutArchivePath, canRebuildAboutSection, parseObservations, validLearnedBlock } from '../../src/data/contracts/observations';
import { ABOUT_REGIONS, parseOwnership } from '../../src/data/contracts/ownership-format';
import { parseTimelineLine } from '../../src/data/contracts/timeline-line';
import { redispatchCase, replySequence, runWithClaude, type CaseRun } from './corpus-run';
import type { ClaudeSpawn } from '../src/claude';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const ABOUT = 'About me.md';
const LEDGER = '.bower/observations.jsonl';
const RETAINED = ['c17-b4-forget-no-return', 'c17-b4-gate-archive-first', 'c17-b4-origin-not-authority'];
const REMOTE = 'I prefer remote roles, except when a role offers regular mentoring in Saltmere.';
const GARDEN = 'I grow beans on the north plot.';
const SEVENTH = 'I want comparisons that say what is missing and keep each source apart, so a choice that is not sure stays not sure until I add the words that settle it.';
const EIGHTH = 'I prefer to keep the amber gate clear when I plan garden work in Saltmere, and I do not want tools left on the path by the beds at any time of day.';

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

const bytes = (text: string) => new TextEncoder().encode(text);
const load = (id: string): Promise<LoadedCase> => loadCase(join(ROOT, id));
const replies = async (id: string, file = 'replies.json'): Promise<unknown[]> => {
  const value = JSON.parse(await readFile(join(ROOT, id, file), 'utf8')) as unknown;
  return Array.isArray(value) ? value : [value];
};
const ledgerOf = (files: Record<string, string>) => parseObservations(bytes(files[LEDGER] ?? ''));
const pressOne = (run: CaseRun): CaseRun => run.runs?.[0] ?? run;
/** Every model call a run makes. */
function counted(spawn: ClaudeSpawn) {
  const calls: string[] = [];
  return { calls, spawn: (async (call) => { calls.push(call.input); return spawn(call); }) as ClaudeSpawn };
}
/** A reply with every observation's source moved to one file. */
function sourcedFrom(value: unknown, fileId: string): unknown {
  const reply = structuredClone(value) as { observations?: Array<{ source: unknown }> };
  for (const o of reply.observations ?? []) o.source = { fileId };
  return reply;
}
/** The learned lines of one region as About me shows them. */
function region(about: string, name: (typeof ABOUT_REGIONS)[number]): string[] {
  const data = bytes(about);
  const owned = parseOwnership(data);
  const span = 'payloads' in owned ? owned.payloads?.[name] : undefined;
  if (!span) return [];
  return new TextDecoder().decode(data.subarray(span.start, span.end)).split('\n').filter((line) => line.startsWith('- '));
}

it('AC1 b4c-seeds-parse: every retained seed reads with the production ledger, validator and archive grammar', async () => {
  for (const id of RETAINED) {
    const c = await load(id);
    const ledger = ledgerOf(c.folder);
    expect(validLearnedBlock(c.folder[ABOUT] ?? '', ledger), `${id}: the seeded About me is a valid learned section`).toBe(true);
    for (const path of Object.keys(c.folder).filter((p) => p.startsWith('.bower/archive/'))) {
      expect(aboutArchivePath(path), `${id}: ${path} follows the ruled archive path`).toBe(true);
    }
    const text = JSON.stringify([c.folder, await replies(id)]);
    for (const stale of ['$path:', '$new:', '"sequence"', 'sourceFileId', '"consolidated"', 'how-you-like-things', 'about-fixture']) {
      expect(text.includes(stale), `${id}: no ${stale} specimen remains`).toBe(false);
    }
  }
  const forget = ledgerOf((await load('c17-b4-forget-no-return')).folder);
  expect(forget.live.map((f) => [f.factId, f.section, f.origin.kind])).toEqual([
    ['fact-remote', 'about-preferences', 'words'], ['fact-garden', 'about-you', 'words']]);
});

it('AC2 b4c-case-4-dropped: the own-text deletion case is gone from the corpus and its notes', async () => {
  expect(existsSync(join(ROOT, 'c17-b4-own-text-deletion')), 'TL-P4-48 Q3 drops case 4').toBe(false);
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
  const rubric = await readFile(resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md'), 'utf8');
  expect(readme.includes('c17-b4-own-text-deletion') || rubric.includes('c17-b4-own-text-deletion')).toBe(false);
  for (const id of RETAINED) expect(readme, `${id} keeps its README row`).toContain(`| ${id} |`);
});

it('AC4 c17-b4-forget-no-return: one tombstone, the fact never returns, the archive and document stay', async () => {
  const c = await load('c17-b4-forget-no-return');
  const { calls, spawn } = counted(replySequence(await replies(c.id)));
  const final = await runWithClaude(c, spawn);
  const first = pressOne(final);
  expect(first.code).toBe(0);
  const ledger = ledgerOf(first.after);
  expect(ledger.tombstones.map((t) => [t.factId, t.reason]), 'one Forget tombstone for the named fact').toEqual([['fact-remote', 'forget']]);
  expect(ledger.live.map((f) => f.factId)).toEqual(['fact-garden']);
  expect(first.after[ABOUT]).not.toContain(REMOTE);
  expect(region(first.after[ABOUT] ?? '', 'about-you').map((line) => parseTimelineLine(line)?.text)).toEqual([GARDEN]);
  for (const path of Object.keys(c.folder).filter((p) => p.startsWith('.bower/archive/') || p.startsWith('Resources/'))) {
    expect(first.after[path], `${path} is byte-identical`).toBe(c.folder[path]);
  }
  expect(final.after[ABOUT], 'the second press changes nothing').toBe(first.after[ABOUT]);
  expect(final.after[LEDGER]).toBe(first.after[LEDGER]);
  expect(calls.length, 'two calls per press, no retry').toBe(4);
  expect(final.score?.unmet).toEqual([]);
  const done = await redispatchCase(c, first, 2, { claude: () => { throw new Error('A done redispatch must not call a model.'); } });
  expect(done.after[LEDGER]).toBe(first.after[LEDGER]);
});

it('AC5 c17-b4-origin-not-authority: the words become one preference, the offer is filed, the document is no authority', async () => {
  const c = await load('c17-b4-origin-not-authority');
  const run = await runWithClaude(c, replySequence(await replies(c.id)));
  expect(run.code).toBe(0);
  const live = ledgerOf(run.after).live;
  expect(live.map((f) => ({ section: f.section, category: f.category, text: f.text, origin: f.origin.kind,
    pile: f.origin.kind === 'words' ? f.origin.pileId : null }))).toEqual([
    { section: 'about-preferences', category: 'preference', text: REMOTE, origin: 'words', pile: 'p-1' }]);
  expect(live[0]?.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(region(run.after[ABOUT] ?? '', 'about-preferences').map((line) => parseTimelineLine(line)?.text)).toEqual([REMOTE]);
  for (const words of ['office roles', 'health', 'Archive']) {
    expect(`${run.after[ABOUT]}\n${run.after[LEDGER]}`, `the offer's "${words}" is no memory`).not.toContain(words);
  }
  expect(run.after['Projects/Job hunt/Ferrowick offer.txt']).toBe(c.inboxFiles['Ferrowick offer.txt']);
  expect(run.after['Projects/Job hunt/Ferrowick offer.md']).toContain('[[Job hunt]]');
  expect(run.score?.unmet).toEqual([]);
  // The exact refused specimen: the accepted reply with only the preference's source moved to the document.
  const accepted = await replies(c.id);
  const specimen = await replies(c.id, 'proposed-refusal.json');
  expect(specimen, 'only the source differs from the accepted reply').toEqual(accepted.map((r) => sourcedFrom(r, '$file:Ferrowick offer.txt')));
  const { calls, spawn } = counted(replySequence(specimen));
  const refused = await runWithClaude(c, spawn);
  const reasons = calls.flatMap((input) => /^Your reply was refused: (.*)$/m.exec(input)?.[1] ?? []);
  expect(reasons.length, 'the document-sourced preference is refused').toBeGreaterThan(0);
  expect(reasons.every((why) => why.startsWith('a memory effect without admitted evidence')),
    `refused by the origin rule, not the envelope: ${reasons.join(' | ')}`).toBe(true);
  expect(ledgerOf(refused.after).events, 'no ledger event from the document').toEqual([]);
  expect(refused.after[ABOUT]).toBe(c.folder[ABOUT]);
});

it('AC3 AC6 c17-b4-gate-archive-first: press 1 appends the seventh fact plainly; press 2 takes the words added between presses', async () => {
  const c = await load('c17-b4-gate-archive-first');
  const seed = ledgerOf(c.folder);
  expect(seed.live.map((f) => f.section)).toEqual(Array(6).fill('about-preferences'));
  const frontier = seed.events.findIndex((e) => e.kind === 'consolidation');
  expect(frontier, 'a successful frontier after the first three facts').toBe(3);
  expect(c.presses?.[0]?.between, 'press 2 adds a words pile first').toEqual([{ kind: 'words', line: expect.stringContaining(EIGHTH) }]);
  const final = await runWithClaude(c, replySequence(await replies(c.id)));
  const first = pressOne(final);
  expect(first.code).toBe(0);
  const ledger = ledgerOf(first.after);
  expect(ledger.live.map((f) => f.text).at(-1)).toBe(SEVENTH);
  const lines = region(first.after[ABOUT] ?? '', 'about-preferences');
  expect(lines, 'seven ordinary learned lines').toHaveLength(7);
  expect(lines.filter((line) => parseTimelineLine(line)?.source !== null), 'no learned line cites a note (learned-lines-no-link)').toEqual([]);
  const text = lines.map((line) => parseTimelineLine(line)?.text ?? '').join('\n');
  expect(text.split(/\s+/).filter(Boolean).length, 'over the 200-word budget').toBeGreaterThan(200);
  expect(canRebuildAboutSection({ ledger, section: 'about-preferences', text, reason: 'consolidate' }), 'four new facts do not open the gate').toBe(false);
  expect(Object.keys(first.after).filter((p) => p.startsWith('.bower/archive/about-me/'))).toEqual([]);
  expect(final.code).toBe(0);
  const eighth = ledgerOf(final.after).live.find((f) => f.text === EIGHTH);
  expect(eighth?.origin.kind === 'words' ? eighth.origin.pileId : null, 'the between words pile is press 2\'s source').toBe('p-2-1');
  expect(Object.keys(final.after).filter((p) => p.startsWith('Inbox/')), 'its words were consumed').toEqual([]);
  // This older transport throws on the memory calls (C's R31), so press 2's consolidation is skipped (R25): of the
  // case's oracle, which C completes (R32), exactly press 2's archive and six lines stay unmet.
  const stage = c.expected.runs?.[1];
  const consolidated = [
    ...(stage?.files?.present ?? []).filter((p) => p.startsWith('.bower/archive/about-me/')).map((p) => `run 2: missing file: ${p}`),
    ...(stage?.notes ?? []).filter((n) => n.path === ABOUT).flatMap((n) => (n.contains ?? []).map((line) => `run 2: ${ABOUT}: lacks "${line}"`)),
  ];
  expect(consolidated, 'press 2\'s oracle holds the archive and the six consolidated lines (C, R32)').toHaveLength(7);
  expect(final.score?.unmet, 'everything else, the case\'s A-stage oracle, scores clean').toEqual(consolidated);
});

it('AC6 b4c-words-step: each words step adds its own pile, numbered among the press\'s words steps only', async () => {
  const [A, B, C] = ['I keep the watering can by the amber gate.', 'I plant beans after the last frost in Saltmere.', 'I prefer short notes about the garden.'];
  const EDITED = '---\nsummary: Alex plans the garden.\n---\n# Garden\n\nThe beds face south.\n\n## Timeline\n';
  const empty = (heading: string, r: string) => `<!-- bower:ownership/2 begin ${r} -->\n### ${heading}\n<!-- bower:ownership/2 end ${r} -->\n`;
  const c: LoadedCase = { id: 'b4c-words-step', capability: 'C05', title: 'Alex adds words between presses', covers: 'model', source: 'new',
    scope: 'all', allowWeb: false, dir: tmpdir(), folderBinary: {}, inboxBinary: {}, expected: {}, rubric: '', questions: [], journal: [], bowerOwned: [],
    inboxFiles: {}, inbox: [{ line: `Remember this: ${A}`, files: [] }],
    folder: { [LEDGER]: '', 'Projects/Garden/Garden.md': '---\nsummary: Alex plans the garden.\n---\n# Garden\n\n## Timeline\n',
      [ABOUT]: '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
        + empty('About you', 'about-you') + empty("What you're working on", 'about-working-on') + empty('How you like things', 'about-preferences') },
    // Typed loosely so this red compiles before the words step exists.
    presses: [{ between: [{ kind: 'words', line: `Remember this: ${B}` }, { kind: 'edit', path: 'Projects/Garden/Garden.md', text: EDITED },
      { kind: 'words', line: `Remember this too: ${C}` }] }] as unknown as LoadedCase['presses'] };
  const observe = (pileId: string, text: string) => ({ source: { pileId }, section: 'about-you', category: 'biography', text });
  const final = await runWithClaude(c, replySequence([{ kind: 'tidy-intent', v: 1, things: [], observations: [observe('p-1', A)] },
    { kind: 'tidy-intent', v: 1, things: [], observations: [observe('p-2-1', B), observe('p-2-2', C)] }]));
  expect(final.code).toBe(0);
  expect(ledgerOf(final.after).live.map((f) => [f.text, f.origin.kind === 'words' ? f.origin.pileId : null]),
    'distinct piles, the edit step not counted, every line kept').toEqual([[A, 'p-1'], [B, 'p-2-1'], [C, 'p-2-2']]);
  expect(final.after['Projects/Garden/Garden.md'], 'the edit step still applies').toBe(EDITED);
  expect(Object.keys(final.after).filter((p) => p.startsWith('Inbox/')), 'both piles were consumed').toEqual([]);
});
