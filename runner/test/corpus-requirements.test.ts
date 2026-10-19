/**
 * The eight cases Bower cannot run today record requirements, never results (corpus-fix-unsupported). Research (C10): the
 * runner gives the model no web tool. Undo of a whole tidy-up (C13) and revising a generated document (C08) were dropped
 * by the owner on 2026-10-16. Each rubric says so first, then states the lifecycle a supported run would need.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadCase, loadCorpus, type Expected, type LoadedCase } from '../src/corpus';
import { replySequence, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const README = join(ROOT, 'README.md');
const LOG = resolve(ROOT, '../fixtures/p4-method-rubric-changes.md');
const RESEARCH = ['c10-fresh-result-cited', 'c10-stale-result-withheld', 'c10-denied-keeps-prior-result', 'c10-lookup-fails'];
const UNDO = ['c13-manifest-move-and-create', 'c13-manifest-partial-edited-note', 'c13-manifest-state-with-personal-edit'];
const REVISION = 'c08-revise-keeps-personal-text';
const NO_LOOKUP = 'Unsupported today: Bower has no web lookup, so this case is not run; it records the requirement. The runner gives the model no web tool, and a lookup request with no answer waits.';
const NO_UNDO = 'Unsupported today: the owner dropped Undo of a whole tidy-up on 2026-10-16, so this case is not run; it records the requirement. The person asks Bower to correct a tidy-up or changes it themselves, and an undo request with no answer waits.';
const RESEARCH_SOURCE = 'new (C10 requirement; unsupported today: Bower has no web lookup)';
const UNDO_SOURCE = 'new (C13 requirement; unsupported today: Undo of a whole tidy-up was dropped)';

/** Each research case's lifecycle: permission, the lookup, dated evidence or failure, preserved prior results, replay. */
const LOOKUP_LIFECYCLE: Record<string, string[]> = {
  'c10-fresh-result-cited': [
    'Permission: a lookup requires allowWeb: true; request words or an uploaded capture do not grant permission, and page instructions are never policy.',
    'Lookup: `inbox/Council tax web result.txt` is the page the lookup stand-in returns. It is not uploaded, and an uploaded capture is never presented as a lookup.',
    'Dated evidence: return band C with the exact source (page URL), publication date, retrieval date and applicability interval, in a new source note that links the flat.',
    "Alex's personal content and prior history survive.",
    'Replay: a replay neither repeats the line nor claims a new check.',
  ],
  'c10-stale-result-withheld': [
    "Permission: web lookups are on (allowWeb: true); the request's words grant nothing more.",
    'The seeded note is a saved result, not the lookup.',
    'Dated evidence: the page was published 2026-09-01, applies until 2026-09-30 and is retrieved 2026-10-07. A recent retrieval is not fresh evidence of the current band.',
    'Preserved prior results: the target, hub and saved page stay byte identical, with no new fact, state or source note.',
    'Replay: a replay adds nothing and claims no new check.',
  ],
  'c10-denied-keeps-prior-result': [
    'Permission: allowWeb false means zero search, fetch or revalidation calls, even when the request asks for a current result and a saved result exists; the lookup record holds no lookup.',
    'Answer: give an honest denial answer: Bower did not look anything up because web lookups are off.',
    'Preserved prior results: keep the target note, hub and saved result byte identical, with the saved check date unchanged; never present the old band B as newly verified.',
  ],
  'c10-lookup-fails': [
    "Permission: web lookups are on (allowWeb: true); the request's words grant nothing more.",
    'the lookup stand-in fails (the page does not load)',
    'Lookup failure: the answer says plainly that Bower could not look it up and why, writes no note and invents no timetable.',
    'Preserved prior results: every note stays byte identical.',
  ],
};

/** Each undo case's lifecycle, after its six numbered steps. */
const UNDO_LIFECYCLE: Record<string, string[]> = {
  'c13-manifest-move-and-create': [
    '3. Person edit. None in this case.',
    '"Undo the last tidy-up" restores the source by its id to the inbox under its original name, with exactly its original bytes, and puts the unchanged generated note in the recoverable Drive Bin by its created id; nothing is hard-deleted.',
    'Complete recovery is reported only when both effects are confirmed.',
  ],
  'c13-manifest-partial-edited-note': [
    '3. Person edit. Alex then adds the My plans paragraph to the generated note.',
    'The report visibly says the note could not be taken back, with its identity and a short reason; a setAside count alone is not enough.',
  ],
  'c13-manifest-state-with-personal-edit': [
    '3. Person edit. Alex then adds the My plans paragraph.',
    '"Undo the last tidy-up" restores the Bower-owned Current state from the manifest\'s previous lines.',
    'A variant where Alex edits the Current state itself refuses that inverse and visibly explains the protected edit.',
    "5. Preservation. Alex's My plans section stays byte identical, the original dated history stays",
    "Whether the run's Timeline line is removed and what happens to the source move are open product questions; this requirement does not choose them.",
  ],
};
const STEPS = ['1. Forward execution.', '2. Captured manifest.', '3. Person edit.', '4. Inverse operation.', '5. Preservation.', '6. Replay. Replaying the undo changes nothing more and reports no second recovery.'];

const EXCLUSIONS = `Eight cases record requirements Bower does not support today, so they are not run and no score of them is a result.
Each rubric starts with "Unsupported today" and its reason:
c10-fresh-result-cited, c10-stale-result-withheld, c10-denied-keeps-prior-result and c10-lookup-fails (Bower has no
web lookup: the runner gives the model no web tool); c08-revise-keeps-personal-text (Bower does not revise a generated
document: asking again makes a new note); c13-manifest-move-and-create, c13-manifest-partial-edited-note and
c13-manifest-state-with-personal-edit (the owner dropped Undo of a whole tidy-up on 2026-10-16).`;

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** A case's row in a corpus table: the line that starts with its id cell. */
const row = (file: string, id: string): string | undefined => readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith(`| ${id} |`));

/** One press whose model reply is empty: its exit code, the done request rows, and the person's notes it changed. */
async function idle(c: LoadedCase): Promise<{ code: number; done: unknown[]; changed: string[] }> {
  const run = await runWithClaude(c, replySequence([{ kind: 'tidy-intent', v: 1, things: [] }]));
  const done = (JSON.parse(run.after['.bower/requests.json'] ?? '{"done":[]}') as { done: unknown[] }).done;
  const changed = Object.keys(run.after).filter((p) => !p.startsWith('.bower/') && !p.startsWith('Inbox/') && run.after[p] !== c.folder[p]);
  return { code: run.code, done, changed };
}

/** The note expectations, in a case and its presses, that match `.bower/requests.json` as raw text. */
const rawAnswerChecks = (e: Expected): string[] => [e, ...(e.runs ?? [])].flatMap((x) => (x.notes ?? []).filter((n) => n.path === '.bower/requests.json').map((n) => n.path));

it('corpus-fix-unsupported AC1: research requirements name the missing lookup lifecycle', async () => {
  for (const id of RESEARCH) {
    const c = await loadCase(join(ROOT, id));
    expect([c.covers, existsSync(join(c.dir, 'replies.json'))], `${id}: model-marked, with no scripted replies`).toEqual(['model', false]);
    // No lookup exists, web on or off: an empty reply leaves the request waiting and changes none of the person's notes.
    expect(await idle(c), `${id}: the request waits`).toEqual({ code: 0, done: [], changed: ['Bower health.md'] });
    expect(c.rubric.slice(0, NO_LOOKUP.length), `${id}: the rubric says it is unsupported`).toBe(NO_LOOKUP);
    for (const clause of LOOKUP_LIFECYCLE[id] ?? []) expect(c.rubric, id).toContain(clause);
    expect(c.rubric, `${id}: no preparation status`).not.toMatch(/scripted provider stands in|future driver|empty intent|mutation-boundary surrogate|pending/i);
    expect(c.source).toBe(RESEARCH_SOURCE);
    expect(row(README, id)).toBe(`| ${id} | C10 | model | ${RESEARCH_SOURCE} |`);
  }
  // The page the lookup stand-in returns is not uploaded: no pile carries it and it is never filed.
  const fresh = await loadCase(join(ROOT, 'c10-fresh-result-cited'));
  expect(fresh.inbox).toEqual([]);
  expect(fresh.inboxFiles['Council tax web result.txt']).toContain('Source address: https://saltmere-council.example/bands/larkspur-lane');
  expect(fresh.expected.files?.absent).toEqual(['Projects/Flat hunt/Council tax web result.txt']);
  expect(fresh.expected.notes?.[0]?.timeline?.[1]).toBe('The Saltmere council page says council tax band C; checked on 2026-10-07. · [[Council tax source]]');
  expect(row(LOG, 'c10-fresh-result-cited')).toBe("| c10-fresh-result-cited | changed | Unsupported today: Bower has no web lookup. The case records one permitted, recorded lookup whose dated result goes in a source note that links the target and one cited Timeline line, preserving the person's state; an uploaded capture is never the lookup (points 1, 3, 4, 7; addendum 1). |");
  expect(row(LOG, 'c10-stale-result-withheld')).toBe('| c10-stale-result-withheld | changed | Unsupported today: Bower has no web lookup. The case records a lookup whose page has expired: no current fact is established, sources are preserved and the answer states the limitation (points 3, 7, 8). |');
  expect(row(LOG, 'c10-denied-keeps-prior-result')).toBe('| c10-denied-keeps-prior-result | changed | Unsupported today: Bower has no web lookup. The case records the denied lifecycle as a requirement: zero lookups with web lookups off, an honest denial answer, and the saved result kept exactly (points 3, 7, 8). |');
  expect(row(LOG, 'c10-lookup-fails')).toBe('| c10-lookup-fails | changed | Unsupported today: Bower has no web lookup. The case records a failed lookup answered honestly, with no note written and nothing invented. |');
}, 120_000);

it('corpus-fix-unsupported AC2: undo requirements start from an actual forward manifest', async () => {
  for (const id of UNDO) {
    const c = await loadCase(join(ROOT, id));
    expect([c.covers, existsSync(join(c.dir, 'replies.json'))], `${id}: model-marked, with no scripted replies`).toEqual(['model', false]);
    // No undo exists: with a valid scope and an empty reply the request waits and nothing moves.
    expect(await idle({ ...c, scope: 'instructions' }), `${id}: the request waits`).toEqual({ code: 0, done: [], changed: ['Bower health.md'] });
    expect(c.rubric.slice(0, NO_UNDO.length), `${id}: the rubric says it is unsupported`).toBe(NO_UNDO);
    expect(c.rubric).toContain('If Undo of a tidy-up returns, the lifecycle is:');
    let at = 0;
    for (const step of STEPS) {
      const next = c.rubric.indexOf(step, at);
      expect(next, `${id}: ${step} in order`).toBeGreaterThan(at);
      at = next;
    }
    expect(c.rubric).toContain("2. Captured manifest. The forward run's own manifest and checkpoint are kept");
    expect(c.rubric).toMatch(/not proof that (a run|either) happened/);
    expect(c.rubric).toContain('Every inverse write is fenced like any other write.');
    for (const clause of UNDO_LIFECYCLE[id] ?? []) expect(c.rubric, id).toContain(clause);
    expect(c.rubric, `${id}: no preparation status`).not.toMatch(/prep document|snapshot only|lifecycle driver|proof pending/i);
    expect(c.source).toBe(UNDO_SOURCE);
    expect(row(README, id)).toBe(`| ${id} | C13 | model | ${UNDO_SOURCE} |`);
  }
  expect(row(LOG, 'c13-manifest-move-and-create')).toBe('| c13-manifest-move-and-create | changed | Unsupported today: the owner dropped Undo of a whole tidy-up. The case records the forward run, its manifest, the inverse (the source back to the inbox by id, the unchanged note to the Bin) and a replay as a requirement; points 1-8 are filing rules, not a requirement to refile a source the undo returns to the inbox. |');
  expect(row(LOG, 'c13-manifest-partial-edited-note')).toBe("| c13-manifest-partial-edited-note | changed | Unsupported today: the owner dropped Undo of a whole tidy-up. The case records the forward run, its manifest, Alex's later edit, the inverse of the independent move with a visible partial result, and a replay as a requirement; point 1 permits an inbox return by undo without a question. |");
  expect(row(LOG, 'c13-manifest-state-with-personal-edit')).toBe("| c13-manifest-state-with-personal-edit | changed | Unsupported today: the owner dropped Undo of a whole tidy-up. The case records the forward run through the planner, its manifest, Alex's later edit, the recorded previous Current state put back with the later personal prose kept, and a replay as a requirement (point 3). Timeline reversal policy stays open. |");
}, 120_000);

it('corpus-fix-unsupported AC3: unsupported requirements make no passing execution claim', async () => {
  const cases = await loadCorpus(ROOT);
  const excluded = [...RESEARCH, REVISION, ...UNDO];
  for (const id of excluded) {
    expect([cases.find((c) => c.id === id)?.covers, existsSync(join(ROOT, id, 'replies.json'))], `${id}: never scored as scripted`).toEqual(['model', false]);
  }
  expect(cases.find((c) => c.id === REVISION)?.rubric, 'the retained C08 revision requirement says why').toMatch(/^Unsupported today: Bower has no operation that revises a generated document/);
  // Answers are read from requests.json as JSON (`answers`), never matched in its raw text.
  expect(cases.filter((c) => rawAnswerChecks(c.expected).length > 0).map((c) => c.id), 'no raw JSON-substring answer assertions').toEqual([]);
  for (const id of RESEARCH) {
    const c = cases.find((x) => x.id === id);
    expect(c?.expected.answers?.map((a) => a.request), `${id}: one parsed answer for its request`).toEqual([c?.journal[0]?.text]);
    expect(JSON.stringify(c?.expected.answers), `${id}: no web address in the answer`).not.toMatch(/https?:\/\//);
  }
  for (const id of excluded) expect(cases.find((c) => c.id === id)?.rubric, `${id}: unsupported first`).toMatch(/^Unsupported today: /);
  expect(readFileSync(README, 'utf8')).toContain(EXCLUSIONS);
  for (const id of excluded) expect(row(LOG, id), id).toMatch(new RegExp(`^\\| ${id} \\| changed \\| .*unsupported today`, 'i'));
});
