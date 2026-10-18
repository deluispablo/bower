// @vitest-environment node
/**
 * prod1-adoption-targets (qa-prod-1 F20, rulings R1-R6): the one question about summaries Bower did not write names up
 * to three of the notes that raised it, as links, then how many more; the yes still covers every such summary.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADOPT_STATES_ID, ADOPT_STATES_RULE } from '../contracts/note-edit';
import { serializeRules } from '../contracts/rules-format';
import type { Change, ManifestV2 } from '../contracts/run-manifest';
import type { ClaudeSpawn } from '../../../runner/src/claude';
import { loadCorpus, type LoadedCase } from '../../../runner/src/corpus';
import { runWithClaude } from '../../../runner/test/corpus-run';

const ROOT = resolve(import.meta.dirname, '../../../testing/corpus');
const HUB = 'Projects/Job hunt/Job hunt.md';
const FLAT = 'Projects/Flat hunt/Flat hunt.md';
const NEW_STATE = ['One application open.', 'An offer from Ferrowick to answer.'];
const FLAT_STATE = ['Four flats on the shortlist.'];
const ASK = 'May it keep every summary it did not write up to date?';
const flatN = (n: number): string => `Projects/Flat hunt/Flat ${n}.md`;

afterEach(() => vi.restoreAllMocks());

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** Copied from state-rewrite.test.ts: the hub-lines pile filed, and these notes' Current states brought up to date.
 *  A state marked `listing` cites the listing instead of the offer: a source wants at most five notes (selection). */
const proposingStates = (states: Array<{ note: string; lines: string[]; listing?: boolean }>, citing = false): ClaudeSpawn => async (call) => {
  const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
  const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  const offer = ids.get('Offer_letter_final(2).pdf') ?? 'none';
  const listing = ids.get('listing-88213.example.url') ?? 'none';
  const intent = {
    kind: 'tidy-intent', v: 1,
    things: [
      { fileId: offer, to: 'Projects/Job hunt/Applications', basis: HUB, name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Start 2 November. [[Job hunt]]' } },
      { fileId: listing, to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
    ],
    lines: [{ note: HUB, text: 'New offer from Ferrowick, fully remote.', ...(citing ? { cites: offer } : {}) }],
    states: states.map(({ listing: byListing, ...st }) => ({ ...st, cites: byListing ? listing : offer })),
  };
  return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
};

async function hubCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-hub-lines');
  if (!c) throw new Error('no corpus case c05-hub-lines');
  return c;
}

const manifestOf = (after: Record<string, string>): ManifestV2 => {
  const [path] = Object.keys(after).filter((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p) && !p.startsWith('.bower/runs/run-state/'));
  return JSON.parse(after[path ?? ''] ?? 'null') as ManifestV2;
};
const editedPaths = (m: ManifestV2): Set<string> => new Set(m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.changes.length > 0 ? [o.effect.path] : [])));
const questionsOf = (after: Record<string, string>): Array<{ id: string; text: string; yes: string; no: string }> =>
  (JSON.parse(after['.bower/questions.json'] ?? '{}') as { questions?: Array<{ id: string; text: string; yes: string; no: string }> }).questions ?? [];
const adoptQuestion = (after: Record<string, string>) => {
  const asked = questionsOf(after).filter((q) => q.id === ADOPT_STATES_ID);
  expect(asked).toHaveLength(1);
  return asked[0] ?? { id: '', text: '', yes: '', no: '' };
};

/** The c05 folder with copies of the unmarked Flat hunt note at `extra`, every note proposed a new Current state. */
async function runWith(extra: string[], opts: { rules?: string; citing?: boolean } = {}) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const c = await hubCase();
  const flat = c.folder[FLAT] ?? '';
  const folder = { ...c.folder, ...Object.fromEntries(extra.map((p) => [p, flat])), ...(opts.rules ? { 'Rules.md': opts.rules } : {}) };
  // Past five notes the second half cites the listing, so each source wants at most five.
  const states = [{ note: HUB, lines: NEW_STATE }, { note: FLAT, lines: FLAT_STATE, listing: extra.length > 3 }, ...extra.map((note, i) => ({ note, lines: FLAT_STATE, listing: extra.length > 3 && i >= extra.length / 2 }))];
  const run = await runWithClaude({ ...c, folder }, proposingStates(states, opts.citing));
  expect(run.code).toBe(0);
  return run;
}

describe('prod1-adoption-targets: the question names the summaries that raised it', () => {
  it('adoption_question_names_triggering_notes', async () => {
    const run = await runWith([]);
    expect(adoptQuestion(run.after).text).toBe(`Bower found summaries it did not write, for example in [[Flat hunt]] and [[Job hunt]]. ${ASK}`);
  });

  it('adoption_question_links_by_place_when_titles_clash', async () => {
    const run = await runWith(['Archive/Flat hunt.md']);
    expect(adoptQuestion(run.after).text).toBe(`Bower found summaries it did not write, for example in [[Archive/Flat hunt]], [[Projects/Flat hunt/Flat hunt]] and [[Job hunt]]. ${ASK}`);
  });

  it.each([
    { extra: [flatN(1), flatN(2)], text: `Bower found summaries it did not write, for example in [[Flat 1]], [[Flat 2]], [[Flat hunt]] and 1 more note. ${ASK}` },
    { extra: [flatN(1), flatN(2), flatN(3)], text: `Bower found summaries it did not write, for example in [[Flat 1]], [[Flat 2]], [[Flat 3]] and 2 more notes. ${ASK}` },
  ])('adoption_question_bounds_long_lists ($extra.length extra)', async ({ extra, text }) => {
    const run = await runWith(extra);
    const q = adoptQuestion(run.after);
    expect(q.text).toBe(text);
    expect(q.text).not.toContain('[[Job hunt]]');
  });

  it('adoption_question_names_each_note_once', async () => {
    const run = await runWith([], { citing: true });
    const { text } = adoptQuestion(run.after);
    expect(text.split('[[Job hunt]]').length - 1).toBe(1);
    expect(text.split('[[Flat hunt]]').length - 1).toBe(1);
    expect(text).toContain('for example in');
  });

  it('adoption_question_skips_deferred_notes', async () => {
    // Ten notes, past the edit cap of 8 (a source wants at most five notes, so not the rulings' eleven).
    const extra = Array.from({ length: 8 }, (_, i) => flatN(i + 1));
    const run = await runWith(extra);
    const edited = editedPaths(manifestOf(run.after));
    const proposed = [HUB, FLAT, ...extra];
    const editedProposed = proposed.filter((p) => edited.has(p));
    const { text } = adoptQuestion(run.after);
    const links = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1] ?? '');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(editedProposed.some((p) => p === `${link}.md` || p.endsWith(`/${link}.md`))).toBe(true);
    expect(Number(/ and (\d+) more notes?\./.exec(text)?.[1])).toBe(editedProposed.length - 3);
    expect(proposed.some((p) => !edited.has(p))).toBe(true);
  });

  it('adoption_question_preserves_global_rule_meaning', async () => {
    const run = await runWith([]);
    const q = adoptQuestion(run.after);
    expect(q.id).toBe('q-adopt-states');
    expect(q.yes).toBe('Keep them up to date');
    expect(q.no).toBe('Leave them');
    expect(q.text).toMatch(/, for example in /);
    expect(q.text.endsWith(ASK)).toBe(true);
    expect(q.text).not.toMatch(/\b(these|only)\b/i);
    expect(ADOPT_STATES_RULE).toBe('Keep the summaries Bower did not write up to date.');
  });

  it('adopted_rule_covers_notes_the_question_did_not_name', async () => {
    const rules = serializeRules([{ id: 'rule-1', text: ADOPT_STATES_RULE, since: Date.UTC(2026, 9, 1) }]);
    const run = await runWith([flatN(1), flatN(2)], { rules });
    const m = manifestOf(run.after);
    const stateOf = (path: string): Change | undefined => m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === path ? o.effect.changes : [])).find((x) => x.kind === 'state-rewrite');
    for (const path of [HUB, FLAT, flatN(1), flatN(2)]) expect(stateOf(path)).toMatchObject({ kind: 'state-rewrite', adopted: true });
    expect(questionsOf(run.after)).toEqual([]);
  });
});
