/**
 * The second-brain method (TL-P4-08, `second-brain-method`): the provider's instructions follow points 1-8, an
 * ambiguous thing is asked about and stays in the inbox while the run goes on (C11), the value gate makes no note for
 * a document that only confirms a known fact, and the C04-C15 corpus rubrics agree with the method. No live call:
 * `claude` is answered by scripted proposals in the intent shape, scored by the corpus scorer.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intentOf, type ClaudeCall, type ClaudeSpawn } from '../src/claude';
import { loadCorpus, score, type LoadedCase } from '../src/corpus';
import { extract } from '../src/extract';
import { dataOf, promptOf, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const LOG = resolve(import.meta.dirname, '../../testing/fixtures/p4-method-rubric-changes.md');

afterEach(() => vi.restoreAllMocks());

interface Context { piles: Array<{ pileId: string; words: string; things: Array<{ fileId: string; name: string }> }> }
const contextOf = (input: string): Context => dataOf<Context>(input);
const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

async function corpusCase(id: string): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === id);
  if (!c) throw new Error(`no corpus case ${id}`);
  return c;
}

/** `claude` answering with the intent `make` builds from the context it was shown. */
function answering(make: (ctx: Context, id: (name: string) => string) => unknown, calls: ClaudeCall[] = []): ClaudeSpawn {
  return async (call) => {
    calls.push({ ...call, input: promptOf(call) });
    const ctx = contextOf(call.input);
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    return { code: 0, stderr: '', cut: null, stdout: envelope(make(ctx, (name) => ids.get(name) ?? `no ${name}`)) };
  };
}

const scored = (c: LoadedCase, run: { after: Record<string, string>; lastRun: unknown }) => score({ expected: c.expected, before: c.folder, after: run.after, lastRun: run.lastRun });

/** The instructions part of the model input: everything before the context line. */
async function instructions(): Promise<string> {
  const calls: ClaudeCall[] = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await runWithClaude(await corpusCase('c04-garden-newsletter'), answering(() => 'not intent', calls));
  const input = calls[0]?.input ?? '';
  return input.slice(0, input.lastIndexOf('\n'));
}

describe('the second-brain method (TL-P4-08)', () => {
  it('the instructions carry the method fit, create, ask in that order', async () => {
    const text = await instructions();
    const fit = text.indexOf('1. Fit:');
    const create = text.indexOf('2. Create:');
    const ask = text.indexOf('3. Ask:');
    expect({ fit: fit > 0, create: create > fit, ask: ask > create }).toEqual({ fit: true, create: true, ask: true });
    // Point 1: near-duplicates first; a new folder says why; an ask leaves the pile in the inbox and the run goes on.
    expect(text).toMatch(/near-duplicate/);
    expect(text).toMatch(/"asks"/);
    expect(text).toMatch(/stays in the inbox untouched/);
    // Points 2-8, each in plain words.
    expect(text).toMatch(/only confirms[^.]*makes no new note/);
    expect(text).toMatch(/Timeline only grows/);
    expect(text).toMatch(/both/);
    expect(text).toMatch(/links its hub[^.]*0 to 5 related notes/);
    expect(text).toMatch(/Kinds of document/);
    expect(text).toMatch(/closest kind/);
    expect(text).toMatch(/at most 5 of the notes below/);
    expect(text).toMatch(/a status, a date, a deadline or an amount/);
    expect(text).toMatch(/outcome first/);
    // Bounded: the instructions stay short (raised from 9,000 for the C06 and C07 lines: specs/c07-disagreement/spec.md R8;
    // raised from 10,000 by c12-prefix ruling 2: the one cached fixed text says every clause a run may need, 12,094 today;
    // raised from 12,500 by c08-documents AC7: the documents grammar line, 13,005 today;
    // raised from 13,500 by qa-prod-2-F2: the one-kind folder line, 13,681 today).
    const fixed = text.split('\n__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__\n')[0] ?? '';
    expect(fixed.length, 'the fixed text, above the boundary').toBeLessThan(14_000);
  });

  it('an ambiguous thing stays in the inbox with a question and the run goes on', async () => {
    const c = await corpusCase('c11-ambiguous-stays');
    const run = await runWithClaude(c, answering((ctx, id) => ({
      kind: 'tidy-intent',
      v: 1,
      things: [{ fileId: id('Leek soup.txt'), to: 'Resources/Cooking', name: 'Leek soup.txt', note: { name: 'Leek soup.md', summary: 'A simple leek soup.', body: 'Leeks, potatoes and stock.' } }],
      asks: [{ pileId: ctx.piles.find((p) => /not sure/i.test(p.words))?.pileId ?? 'none', text: 'Is the letter of 14 October for the flat hunt?', yes: 'Yes, the flat hunt', no: 'No, the job hunt' }],
    })));
    expect(run.code).toBe(0);
    expect(scored(c, run)).toEqual({ pass: true, unmet: [] });
    // The letter is untouched in the inbox, byte for byte.
    const letter = Object.entries(run.after).find(([p]) => /^Inbox\/.*Letter, 14 October\.txt$/.test(p));
    expect(letter?.[1]).toBe(c.inboxFiles['Letter, 14 October.txt']);
    // The question is in Bower's list for the person, with its two answers.
    const open = JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string; text: string; yes: string; no: string }> };
    expect(open.questions).toEqual([expect.objectContaining({ id: 'q-ask-p-2', text: 'Is the letter of 14 October for the flat hunt?', yes: 'Yes, the flat hunt', no: 'No, the job hunt' })]);

    // Asked again while its question is open (the letter alone, now pile p-1): not asked twice, and nothing changes.
    const already = { ...c, questions: [{ id: 'q-ask-p-1', text: 'Is this for the flat hunt?', yes: 'Yes', no: 'No', askedAt: 1 }] };
    const onlyAsk = answering((ctx) => ({ kind: 'tidy-intent', v: 1, things: [], asks: [{ pileId: ctx.piles.find((p) => /not sure/i.test(p.words))?.pileId ?? 'none', text: 'Is it for the flat hunt?', yes: 'Yes', no: 'No' }] }));
    const again = await runWithClaude({ ...already, inbox: c.inbox.slice(1) }, onlyAsk);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.after['.bower/questions.json'] ?? '{}')).toEqual({ v: 1, questions: already.questions });
    expect(Object.keys(again.after).filter((p) => p.startsWith('Inbox/')).sort()).toEqual([expect.stringMatching(/\/Letter, 14 October\.txt$/), expect.stringMatching(/\/Pile note\.md$/)]);

    // An ask is refused when it also files the pile, names a pile not admitted, or is not one short line.
    const took = { taken: { piles: [{ pileId: 'p-1', anchor: null, items: [{ fileId: 'f1', name: 'a.txt' }] }] } } as unknown as Parameters<typeof intentOf>[1];
    const ask = (extra: Record<string, unknown>, things: unknown[] = []) => intentOf({ kind: 'tidy-intent', v: 1, things, asks: [{ pileId: 'p-1', text: 'Is this for the flat hunt?', yes: 'Yes', no: 'No', ...extra }] }, took);
    expect(ask({}).ok).toBe(true);
    expect(ask({}, [{ fileId: 'f1', to: 'Resources', name: 'a.txt' }]).ok).toBe(false);
    expect(ask({ pileId: 'p-9' }).ok).toBe(false);
    expect(ask({ text: 'one\ntwo' }).ok).toBe(false);
    expect(ask({ text: 'See [[Flat hunt]]?' }).ok).toBe(false);
  });

  it('a later run does not repeat an open question', async () => {
    const c = await corpusCase('c11-ambiguous-stays');
    const calls: ClaudeCall[] = [];
    const asking = (text: string) => answering((ctx, id) => ({
      kind: 'tidy-intent',
      v: 1,
      things: [{ fileId: id('Leek soup.txt'), to: 'Resources/Cooking', name: 'Leek soup.txt', note: { name: 'Leek soup.md', summary: 'A simple leek soup.', body: 'Leeks, potatoes and stock.' } }].filter(() => ctx.piles.some((p) => p.things.some((t) => t.name === 'Leek soup.txt'))),
      asks: [{ pileId: ctx.piles.find((p) => /not sure/i.test(p.words))?.pileId ?? 'none', text, yes: 'Yes, the flat hunt', no: 'No, the job hunt' }],
    }), calls);
    const questionsOf = (after: Record<string, string>) => (JSON.parse(after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string; text: string }> }).questions;
    const inboxOf = (after: Record<string, string>) => Object.keys(after).filter((p) => p.startsWith('Inbox/')).sort();

    // First run: the letter is asked about and stays. Second run over the same inbox, with the first run's open
    // question kept: the model asks again (in other words), nothing is added, the thing stays, the rest goes on.
    const first = await runWithClaude(c, asking('Is the letter of 14 October for the flat hunt?'));
    const open = questionsOf(first.after);
    expect(open).toHaveLength(1);
    const second = await runWithClaude({ ...c, questions: open as never }, asking('Does the letter of 14 October belong to the flat?'));
    expect(second.code).toBe(0);
    expect(questionsOf(second.after)).toEqual(open);
    expect(inboxOf(second.after).filter((p) => /Letter, 14 October/.test(p))).toHaveLength(1);
    expect(second.after[inboxOf(second.after).find((p) => /Letter, 14 October\.txt$/.test(p)) ?? '']).toBe(c.inboxFiles['Letter, 14 October.txt']);
    expect((second.lastRun as { report?: { questions?: unknown[] } }).report?.questions ?? []).toEqual([]);
  });

  it('a document that only confirms a known fact updates the note and makes none', async () => {
    expect(await instructions()).toMatch(/only confirms[^.]*makes no new note[^.]*/);
    const c = await corpusCase('c05-confirms-known-fact');
    const run = await runWithClaude(c, answering((_ctx, id) => ({
      kind: 'tidy-intent',
      v: 1,
      things: [{ fileId: id('Plot fees 2027.txt'), to: 'Areas/Home', name: 'Plot fees 2027.txt' }],
      lines: [{ note: 'Areas/Home/Garden plot.md', text: 'Plot fees for 2027 confirmed: 25 a year, due by 31 January.', cites: id('Plot fees 2027.txt') }],
    })));
    expect(run.code).toBe(0);
    expect(scored(c, run)).toEqual({ pass: true, unmet: [] });
    expect(run.after['Areas/Home/Garden plot.md']).toMatch(/^- \d{4}-\d{2}-\d{2} · Plot fees for 2027 confirmed[^\n]* · \[\[Plot fees 2027\.txt\]\]$/m);
  });

  it('the C04 to C15 rubrics agree with the method', async () => {
    const cases = (await loadCorpus(ROOT)).filter((c) => !c.speedBaseline && /^c(0[4-9]|1[0-5])-/.test(c.id));
    expect(cases.length).toBeGreaterThanOrEqual(26);
    const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
    for (const c of cases) {
      // Each case was checked and has a verdict in the log, with its reason.
      const row = log.split('\n').find((l) => l.startsWith(`| ${c.id} |`));
      expect({ id: c.id, row: /^\| [a-z0-9-]+ \| (agrees|changed) \| .{10,}/.test(row ?? '') }).toEqual({ id: c.id, row: true });
      // Point 3: Bower rewrites a note's Current state when a document changes it; no rubric pins it untouched.
      expect({ id: c.id, pinned: /Current state[^.]*untouched/i.test(c.rubric) }).toEqual({ id: c.id, pinned: false });
      // Point 1: a thing left in the inbox (other than by an undo) comes with a question.
      const stays = (c.expected.files?.present ?? []).some((p) => p.startsWith('Inbox/'));
      if (stays && c.scope !== 'undo') expect({ id: c.id, asked: (c.expected.report?.questions?.length ?? 0) > 0 }).toEqual({ id: c.id, asked: true });
      // Point 1: a loose thing with no words that Bower cannot read cannot be placed without guessing, so it is asked.
      for (const pile of c.inbox.filter((p) => !p.line.trim() && p.files.length === 1)) {
        const name = pile.files[0] ?? '';
        const bytes = c.inboxBinary[name];
        if (!bytes || !/\.pdf$/i.test(name) || (await extract(name, bytes, 2_000)).text !== null) continue;
        expect({ id: c.id, guessed: (c.expected.files?.absent ?? []).includes('Inbox/*') }).toEqual({ id: c.id, guessed: false });
        expect({ id: c.id, asked: (c.expected.report?.questions?.length ?? 0) > 0 }).toEqual({ id: c.id, asked: true });
      }
    }
  });

  it('corpus-inventory AC3: method agreement is current and is not semantic judging', () => {
    const log = readFileSync(LOG, 'utf8');
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    const ROW = /^\| ([a-z0-9][a-z0-9-]*) \|/;
    const lines = log.split('\n');
    const rows = lines.filter((l) => ROW.test(l));
    const ids = rows.map((l) => l.match(ROW)?.[1] ?? '');
    const dirs = readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(resolve(ROOT, d.name, 'case.json'))).map((d) => d.name);
    // (i) One verdict row per retained case; verdicts are agreement words, never pass, fail or a score.
    expect([...new Set(ids)].sort()).toEqual([...dirs].sort());
    expect(ids.length).toBe(dirs.length);
    expect(rows.filter((l) => !/^\| [a-z0-9-]+ \| (agrees|changed) \| .{10,}/.test(l))).toEqual([]);
    // (ii) Every row continues a table.
    expect(lines.filter((l, i) => ROW.test(l) && !(ROW.test(lines[i - 1] ?? '') || /^\| ---/.test(lines[i - 1] ?? '')))).toEqual([]);
    // (iii) Agreement is not judgment.
    expect(log).toContain('it is never a run result or a semantic judgment of model output');
    // (iv) No stale status; the replay outcome is matched only quoted, since "a restored inbox source" is undo prose.
    const stale = /await the lead's packet|pending contracts\/driver work|rejected today|already-active|"restored"|same-year seal|1024 events|Bounds await the lead|\.bower\/log\.md/;
    expect(log).not.toMatch(stale);
    expect(readme).not.toMatch(stale);
  });
});

it('corpus-fix-b23-hot AC3: hot method check uses the fixture unchanged', async () => {
  const c = await corpusCase('b23-hot-evidence-only');
  const row = readFileSync(LOG, 'utf8').split('\n').find((line) => line.startsWith(`| ${c.id} |`));
  // Positive control: the accepted case and its existing method verdict are actually loaded.
  expect(row).toMatch(/^\| b23-hot-evidence-only \| agrees \|/);
  expect(c.folder['.bower/hot.md']).toContain('Evergreen launch');
  expect(c.folder['hot.md']).toBeUndefined();
  expect(c.covers).toBe('model'); // Offline execution proves lifecycle, not model quality.
  expect(c.expected.files?.absent).toEqual(expect.arrayContaining(['hot.md', '.bower/archive/hot/*']));
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 9, 7, 9));
  try {
    const calls: ClaudeCall[] = [];
    const run = await runWithClaude(c, answering(() => ({ kind: 'tidy-intent', v: 1, things: [] }), calls));
    expect(run.code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(run.score).toEqual({ pass: true, unmet: [] });
    expect(Object.keys(run.after).filter((path) => path.startsWith('.bower/archive/hot/'))).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
