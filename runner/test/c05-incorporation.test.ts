/**
 * The C05 slice (TL-P4-03, TL-P4-08 points 2 and 7): what a document changes in the notes it touches. Scripted
 * proposals first, as the model would answer under the method, through the Claude provider and the spine, each
 * scored by the corpus scorer. No live call.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { caseReplies, runWithClaude, scoreCase } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

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

  'c05-hub-lines': answering((id) => ({
    kind: 'tidy-intent', v: 1,
    things: [offerThing(id), { fileId: id(LISTING), to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' }],
    lines: [
      { note: FLAT, text: 'A fourth flat added; the shortlist compared by commute.', cites: id(LISTING) },
      { note: JOB, text: 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.', cites: id(OFFER) },
      { note: JOB, text: 'A flat from the same pile went to the flat hunt.', cites: id(LISTING) },
    ],
  })),
  'c05-confirms-known-fact': answering((id) => ({
    kind: 'tidy-intent', v: 1,
    things: [{ fileId: id('Plot fees 2027.txt'), to: 'Areas/Home', name: 'Plot fees 2027.txt' }],
    lines: [{ note: 'Areas/Home/Garden plot.md', text: 'Plot fees for 2027 confirmed: 25 a year, due by 31 January.', cites: id('Plot fees 2027.txt') }],
  })),
  // The Job hunt hub already has the offer's line; the model, seeing it, proposes the flat's line and the offer's note
  // only, and the repeat of the offer's line is dropped by the spine if the model sends it again.
  'c05-line-not-repeated': answering((id) => ({
    kind: 'tidy-intent', v: 1,
    things: [offerThing(id)],
    lines: [
      { note: FLAT, text: 'A fourth flat added; the shortlist compared by commute.' },
      { note: JOB, text: 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.', cites: id(OFFER) },
    ],
  })),
  // The person said yes to keeping one note; nothing is in the inbox, so the model's only work is the merge.
  'c05-keep-one-note': answering(() => ({ kind: 'tidy-intent', v: 1, things: [], keep: [{ kept: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', other: 'Projects/Flat hunt/Flat 3 (second).md' }] })),
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
      things: [offerThing(id), { fileId: id(LISTING), to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' }],
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
