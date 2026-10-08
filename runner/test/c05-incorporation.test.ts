/**
 * The C05 slice (TL-P4-03, TL-P4-08 points 2 and 7): what a document changes in the notes it touches. Scripted
 * proposals first, as the model would answer under the method, through the Claude provider and the spine, each
 * scored by the corpus scorer. No live call.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, score, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');

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
      { note: JOB, text: 'New offer from Ferrowick, fully remote.', cites: id(OFFER) },
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
      { note: JOB, text: 'New offer from Ferrowick, scored 7 out of 10 against your CV.', cites: id(OFFER) },
    ],
  })),
  // The person said yes to keeping one note; nothing is in the inbox, so the model's only work is the merge.
  'c05-keep-one-note': answering(() => ({ kind: 'tidy-intent', v: 1, things: [] })),
};

describe('the C05 slice through the Claude provider', () => {
  it('the C05 corpus cases score green with scripted proposals', async () => {
    const cases: LoadedCase[] = (await loadCorpus(ROOT)).filter((c) => c.capability === 'C05');
    expect(cases.map((c) => c.id).sort()).toEqual(Object.keys(SCRIPTS).sort());
    const results: Record<string, unknown> = {};
    for (const c of cases) {
      const run = await runWithClaude(c, SCRIPTS[c.id] as ClaudeSpawn);
      results[c.id] = { code: run.code, ...score({ expected: c.expected, before: c.folder, after: run.after, lastRun: run.lastRun }) };
    }
    expect(results).toEqual(Object.fromEntries(cases.map((c) => [c.id, { code: 0, pass: true, unmet: [] }])));
  });
});
