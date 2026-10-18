/**
 * The C05 slice (TL-P4-03, TL-P4-08 points 2 and 7): what a document changes in the notes it touches. Scripted
 * proposals first, as the model would answer under the method, through the Claude provider and the spine, each
 * scored by the corpus scorer. No live call.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import type { ClaudeSpawn } from '../src/claude';
import { loadCase, loadCorpus, timelineOf, type LoadedCase } from '../src/corpus';
import { caseReplies, replySequence, runWithClaude, scoreCase, type CaseRun } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
// A case's answer step goes through the app's answer path, which keeps the device outbox.
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

interface Shown { piles: Array<{ things: Array<{ fileId: string; name: string }> }> }
const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** Scripted proposals, written by names: the file ids come from the context the runner prepared. */
const answering = (make: (id: (name: string) => string) => unknown): ClaudeSpawn => async (call) => {
  const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Shown;
  const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  return { code: 0, stderr: '', cut: null, stdout: envelope(make((name) => ids.get(name) ?? `no ${name}`)) };
};

const JOB = 'Projects/Job hunt/Job hunt.md';
const FLAT = 'Projects/Flat hunt/Flat hunt.md';
const OFFER = 'Offer_letter_final(2).pdf';
const LISTING = 'listing-88213.example.url';

const offerThing = (id: (n: string) => string): unknown => ({ fileId: id(OFFER), to: 'Projects/Job hunt/Applications', basis: JOB, name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Start 2 November. [[Job hunt]]' } });

const SCRIPTS: Record<string, ClaudeSpawn> = {
  'c05-confirms-known-fact': answering((id) => ({
    kind: 'tidy-intent', v: 1,
    things: [{ fileId: id('Plot fees 2027.txt'), to: 'Areas/Home', name: 'Plot fees 2027.txt' }],
    lines: [{ note: 'Areas/Home/Garden plot.md', text: 'Plot fees for 2027 confirmed: 25 a year, due by 31 January.', cites: id('Plot fees 2027.txt') }],
  })),
};

describe('the C05 slice through the Claude provider', () => {
  it('the C05 corpus cases score green with scripted proposals', async () => {
    const cases: LoadedCase[] = (await loadCorpus(ROOT)).filter((c) => c.capability === 'C05');
    // Cases with recorded intents join the same SCRIPTS table; a missing reply still fails the full case list.
    for (const c of cases) if (existsSync(join(c.dir, 'replies.json'))) SCRIPTS[c.id] = caseReplies(c.id);
    expect(cases.map((c) => c.id).sort()).toEqual(Object.keys(SCRIPTS).sort());
    const results: Record<string, unknown> = {};
    for (const c of cases) {
      const run = await runWithClaude(c, SCRIPTS[c.id] as ClaudeSpawn);
      results[c.id] = { code: run.code, ...scoreCase(c, run) };
    }
    expect(results).toEqual(Object.fromEntries(cases.map((c) => [c.id, { code: 0, pass: true, unmet: [] }])));
  });

  // report-misses-hub-line (live run CbTN5Md_): the model wrote two Timeline lines on Flat hunt; the report said one.
  it('every Timeline line a run writes has its own report row', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-hub-lines');
    if (!c) throw new Error('no c05-hub-lines case');
    const OFFER_LINE = 'The Ferrowick offer is fully remote, so the commute only matters for the flat.';
    const LISTING_LINE = 'New flat listing saved from a link (listing-88213).';
    const run = await runWithClaude(c, answering((id) => ({
      kind: 'tidy-intent', v: 1,
      things: [offerThing(id), { fileId: id(LISTING), to: 'Projects/Flat hunt', name: 'Flat listing.md' }],
      lines: [{ note: FLAT, text: OFFER_LINE, cites: id(OFFER) }, { note: FLAT, text: LISTING_LINE, cites: id(LISTING) }],
    })));
    expect(run.code).toBe(0);
    // Both lines are on the note...
    expect(run.after[FLAT]).toContain(OFFER_LINE);
    expect(run.after[FLAT]).toContain(LISTING_LINE);
    // ...and each has its own row.
    const report = (run.lastRun as { run: { report: { updated: Array<{ path: string; what: string; op?: string; line?: number }> } } }).run.report;
    // ...each naming its edit and its line's ordinal among that edit's lines, with the note as the run left it
    // (TL-P4-19 addenda 4 and 5).
    const op = expect.any(String) as unknown as string;
    const left = { lines: 2, md5: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown as string, stamp: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown as string };
    expect(report.updated.filter((r) => r.path === FLAT)).toEqual([{ path: FLAT, what: OFFER_LINE, op, line: 0, ...left }, { path: FLAT, what: LISTING_LINE, op, line: 1, ...left }]);
  });
});

interface Row { path: string; what: string }
interface Report { filed?: unknown[]; created?: unknown[]; updated?: Row[]; alreadySaved?: unknown[] }
type Reply = { lines: Array<{ note: string; text: string; cites?: string }> };
const reportOf = (run: CaseRun): Report => (run.lastRun as { run: { report: Report } }).run.report;
const repliesOf = (id: string): Reply[] => JSON.parse(readFileSync(join(ROOT, id, 'replies.json'), 'utf8')) as Reply[];

describe('corpus-fix-c05-value', () => {
  it('corpus-fix-c05-value AC1: repeated source adds no duplicate fact or unrelated update', async () => {
    const id = 'c05-line-not-repeated';
    const c = await loadCase(join(ROOT, id));
    const seedJob = c.folder[JOB] ?? '';
    const seedFlat = c.folder[FLAT] ?? '';
    // The red: the repeat must be a second arrival, not a line already in the seed.
    expect(seedJob).not.toContain('New offer from Ferrowick');
    expect(c.presses).toEqual([{ between: [{ kind: 'words', line: 'Job hunt: the Ferrowick offer again, fully remote, 42,000 a year, start 2 November' }] }]);
    const replies = repliesOf(id);
    expect(replies[1]?.lines).toEqual([{ note: JOB, text: replies[0]?.lines[0]?.text, cites: 'p-2-1' }]);

    const run = await runWithClaude(c, caseReplies(id));
    // run.runs holds only the earlier presses.
    const presses = [...(run.runs ?? []), run];
    expect(presses.map((r) => r.code)).toEqual([0, 0]);
    const [first, second] = presses as [CaseRun, CaseRun];
    // The written line carries the run's date stamp ("- 2026-10-07 · …"), so it is matched by its text.
    const lines = timelineOf(first.after[JOB] ?? '');
    expect(lines.slice(0, -1)).toEqual(timelineOf(seedJob));
    expect(lines.at(-1)).toMatch(/^- \d{4}-\d{2}-\d{2} · New offer from Ferrowick: fully remote, 42,000 a year, start 2 November\. · \[\[Industrial Designer, Ferrowick\]\]$/);
    expect(lines).toHaveLength(2);
    expect(first.after[FLAT]).toBe(seedFlat);
    expect(second.after[JOB]).toBe(first.after[JOB]);
    expect(second.after[FLAT]).toBe(seedFlat);
    const report = reportOf(second);
    expect({ filed: report.filed, created: report.created, updated: report.updated }).toEqual({ filed: [], created: [], updated: [] });
    expect(report.alreadySaved).toEqual([{ name: 'Job hunt: the Ferrowick offer again, ful', as: 'Job hunt.md', notes: 1 }]);
    expect(Object.keys(second.after).filter((p) => p.startsWith('Inbox/'))).toEqual([]);
    expect(scoreCase(c, run)).toEqual({ pass: true, unmet: [] });
  });

  it('corpus-fix-c05-value AC2: hub additions require supported relevance', async () => {
    const id = 'c05-hub-lines';
    const c = await loadCase(join(ROOT, id));
    // The red: no co-arrival line and no invented listing address in what the case expects.
    const expected = JSON.stringify(c.expected);
    expect(expected).not.toContain('A flat from the same pile');
    expect(expected).not.toContain('Wrenfield');
    expect([JOB, FLAT].map((path) => c.expected.notes?.find((n) => n.path === path)?.timelineCount)).toEqual([2, 2]);

    const run = await runWithClaude(c, caseReplies(id));
    expect(run.code).toBe(0);
    expect(scoreCase(c, run).pass).toBe(true);
    expect((reportOf(run).updated ?? []).map((r) => [r.path, r.what])).toEqual([[FLAT, 'A flat listing came in with the job offer.'], [JOB, 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.']]);
    expect(timelineOf(run.after[JOB] ?? '').filter((l) => l.includes('[[Flat listing]]'))).toEqual([]);

    // Negative: arriving in the same pile is not evidence, so a co-arrival line on the job hunt fails the score.
    const [reply] = repliesOf(id);
    const line = { note: JOB, text: 'A flat from the same pile went to the flat hunt.', cites: `$file:${LISTING}` };
    const bad = await runWithClaude(c, replySequence([{ ...reply, lines: [...(reply?.lines ?? []), line] }]));
    expect(bad.code).toBe(0);
    const scored = scoreCase(c, bad);
    expect(scored.pass).toBe(false);
    expect(scored.unmet.some((u) => u.includes('Job hunt.md'))).toBe(true);
  });
});
