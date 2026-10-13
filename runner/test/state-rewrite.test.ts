/**
 * `state-rewrite-change` (TL-P4-08 addendum 1 point 1, the first C05 entry): a change kind of its own rewrites only
 * the Bower-owned "## Current state" of a note, through the modifiedTime and bytes it read; the manifest keeps the
 * previous lines so an undo (C13) restores them; a Current state the person edited after Bower is never rewritten:
 * the change becomes a Timeline line plus a question (the C11 asks flow).
 *
 * TL-P4-10: an unmarked Current state is the person's, unless a rule says Bower may keep such summaries up to date; otherwise a Timeline line only, and one question per folder.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADOPT_STATES_RULE, applyChanges, stateMark, stateNewsLine, undoChanges } from '../../src/data/contracts/note-edit';
import { serializeRules } from '../../src/data/contracts/rules-format';
import type { Change, ManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseNote } from '../../src/data/vault/note-format';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';
import { stateWrittenBefore } from './earlier-runs';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const HUB = 'Projects/Job hunt/Job hunt.md';
const FLAT = 'Projects/Flat hunt/Flat hunt.md';
const MADE = 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md';
const NEW_STATE = ['One application open.', 'An offer from Ferrowick to answer.'];
/** TL-P4-10 point 3, word for word. */
const ADOPT_QUESTION = 'Bower found summaries it did not write. May it keep them up to date?';
/** Drive's `md5Checksum`: the MD5 of the stored bytes, hex (RFC 1321). */
const md5 = (text: string): string => createHash('md5').update(Buffer.from(text, 'utf8')).digest('hex');
/** A hub whose Current state carries Bower's mark of what it holds: Bower's own. */
const marked = (text: string, lines: string[]): string => text.replace('by: bower\n', `by: bower\nbower_state: ${stateMark(lines)}\n`);

afterEach(() => vi.restoreAllMocks());

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** The model's intent for the hub-lines pile: both things filed, and these notes' Current states brought up to date. */
const proposingStates = (states: Array<{ note: string; lines: string[] }>, citing = false): ClaudeSpawn => async (call) => {
  const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
  const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  const offer = ids.get('Offer_letter_final(2).pdf') ?? 'none';
  const intent = {
    kind: 'tidy-intent', v: 1,
    things: [
      { fileId: offer, to: 'Projects/Job hunt/Applications', basis: HUB, name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Start 2 November. [[Job hunt]]' } },
      { fileId: ids.get('listing-88213.example.url') ?? 'none', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
    ],
    // By default the hub's line cites nothing, so the Current-state fallback stands alone; `citing` has it cite the offer.
    lines: [{ note: HUB, text: 'New offer from Ferrowick, fully remote.', ...(citing ? { cites: offer } : {}) }],
    states: states.map((st) => ({ ...st, cites: offer })),
  };
  return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
};
const proposing = proposingStates([{ note: HUB, lines: NEW_STATE }]);

async function hubCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-hub-lines');
  if (!c) throw new Error('no corpus case c05-hub-lines');
  return c;
}

const manifestOf = (after: Record<string, string>): ManifestV2 => {
  // This run's: an earlier run's (`stateWrittenBefore`) is there too in some cases.
  const [path] = Object.keys(after).filter((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p) && !p.startsWith('.bower/runs/run-state/'));
  return JSON.parse(after[path ?? ''] ?? 'null') as ManifestV2;
};
const editOf = (m: ManifestV2, path: string): Change[] => m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === path ? o.effect.changes : []));
const hubEdit = (m: ManifestV2): Change[] => editOf(m, HUB);
const questionsOf = (after: Record<string, string>): Array<{ id: string; text: string; about?: string }> =>
  (JSON.parse(after['.bower/questions.json'] ?? '{}') as { questions?: Array<{ id: string; text: string; about?: string }> }).questions ?? [];
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
/** An earlier run of the folder wrote `lines` as the hub's Current state (its manifest's state change). */
const wroteBefore = (lines: string[]) => (drive: Parameters<typeof stateWrittenBefore>[0], root: string): Promise<void> => stateWrittenBefore(drive, root, HUB, lines);

describe('a change kind of its own for Current state (C05)', () => {
  it('a Bower-owned Current state is rewritten and undo restores it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // Bower last wrote "One application open." there: its mark says so.
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: marked(c.folder[HUB] ?? '', ['One application open.']) } }, proposing);

    expect(run.code).toBe(0);
    const after = run.after[HUB] ?? '';
    const note = parseNote(HUB, after);
    expect(note.currentState).toEqual(NEW_STATE);
    // The person's sections and Bower's Timeline are kept; the Timeline still only grows.
    expect(note.timeline.map((t) => t.text)).toEqual(['Started the job hunt.', 'New offer from Ferrowick, fully remote.']);
    expect(note.summary).toBe('Applications and offers.');
    // The manifest keeps the lines it replaced, so the change can be taken back.
    const changes = hubEdit(manifestOf(run.after));
    expect(changes.find((x) => x.kind === 'state-rewrite')).toEqual({ kind: 'state-rewrite', recordIds: [], previous: ['One application open.'], lines: NEW_STATE });
    // The report says the note was brought up to date.
    const report = (run.lastRun as { run: { report: { updated: Array<{ path: string }> } } }).run.report;
    expect(report.updated.map((u) => u.path)).toContain(HUB);

    // Undo (C13): the inverse change, authored by applyChanges on the bytes as they are now, restores the old lines only.
    const back = applyChanges(bytes(after), undoChanges(changes));
    expect(back.ok).toBe(true);
    const undone = parseNote(HUB, back.ok ? back.text : '');
    expect(undone.currentState).toEqual(['One application open.']);
    expect(undone.timeline).toEqual(note.timeline);
    // A Current state the person changed since is never taken back over them.
    const edited = after.replace('- An offer from Ferrowick to answer.', '- Offer accepted.');
    expect(applyChanges(bytes(edited), undoChanges(changes))).toEqual({ ok: false, reason: 'person-edited' });
  });

  it('a Current state the person edited gets a line and a question, never a rewrite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // Bower last wrote "One application open." (its mark says so); the person has written their own since.
    const was = c.folder[HUB] ?? '';
    const edited = was
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['One application open.'])}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing, undefined, wroteBefore(['One application open.']));

    expect(run.code).toBe(0);
    const note = parseNote(HUB, run.after[HUB] ?? '');
    expect(note.currentState).toEqual(['Two applications open, one interview on Friday.']);
    // What Bower would have written goes on the Timeline, citing the thing, and the person is asked.
    // Bower's mark says it last wrote the first line, so only the offer is news.
    const line = note.timeline.find((t) => t.text === 'New: an offer from Ferrowick to answer.');
    expect(line?.source).toBe('Industrial Designer, Ferrowick');
    const questions = JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string; about?: string }> };
    const asked = questions.questions.find((q) => q.id.startsWith('q-state-'));
    expect(asked?.about).toBe(HUB);
    const report = (run.lastRun as { run: { report: { questions: Array<{ id: string }> } } }).run.report;
    expect(report.questions.map((q) => q.id)).toContain(asked?.id);
    expect(hubEdit(manifestOf(run.after)).some((x) => x.kind === 'state-rewrite')).toBe(false);
  });

  it('no fallback line when the run already cites the same thing on that note', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    const edited = (c.folder[HUB] ?? '')
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['One application open.'])}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposingStates([{ note: HUB, lines: NEW_STATE }], true));
    const note = parseNote(HUB, run.after[HUB] ?? '');
    // The model's own line cites the offer: the same news is not written a second time.
    expect(note.timeline.filter((t) => t.source === 'Industrial Designer, Ferrowick').map((t) => t.text)).toEqual(['New offer from Ferrowick, fully remote.']);
    expect(note.timeline.some((t) => t.text.startsWith('New: '))).toBe(false);
    // The person's section stays theirs and they are still asked.
    expect(note.currentState).toEqual(['Two applications open, one interview on Friday.']);
    expect(questionsOf(run.after).some((q) => q.id.startsWith('q-state-') && q.about === HUB)).toBe(true);
  });

  it('the fallback line reads as plain news', () => {
    expect(stateNewsLine(['One open.', 'An offer · to [[answer]].'], [])).toBe('New: One open, an offer, to answer.');
    for (const line of [stateNewsLine(['One open.', 'An offer · to [[answer]].'], []), stateNewsLine(['Done.'], [])]) expect(line).not.toMatch(/;|Where things stand|Bower|would|\.,/);
  });

  it('the fallback line names only what the section lacks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // Nothing new against the person's unmarked section: no Timeline line for it at all.
    const same = await runWithClaude(c, proposingStates([{ note: HUB, lines: ['One application open.'] }]));
    expect(parseNote(HUB, same.after[HUB] ?? '').timeline.some((t) => t.text.startsWith('New: '))).toBe(false);
    // One thing new: only that is named, never the person's own line.
    const more = await runWithClaude(c, proposing);
    const news = parseNote(HUB, more.after[HUB] ?? '').timeline.filter((t) => t.text.startsWith('New: ')).map((t) => t.text);
    expect(news).toEqual(['New: an offer from Ferrowick to answer.']);
  });

  it("a person-edited section's fallback names none of Bower's last-written lines", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    const edited = (c.folder[HUB] ?? '')
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['One application open.'])}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing, undefined, wroteBefore(['One application open.']));
    const news = parseNote(HUB, run.after[HUB] ?? '').timeline.filter((t) => t.text.startsWith('New: ')).map((t) => t.text);
    expect(news).toEqual(['New: an offer from Ferrowick to answer.']);
  });

  it("Bower's last state is read from the previous state change, not searched", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // Bower last wrote two lines; the model keeps the first and drops the second, so no part of its proposal carries
    // that mark. The earlier run's state change says what Bower wrote: the first line is not news.
    const last = ['One application open.', 'Two flats seen this week.'];
    const edited = (c.folder[HUB] ?? '')
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(last)}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing, undefined, wroteBefore(last));
    const news = parseNote(HUB, run.after[HUB] ?? '').timeline.filter((t) => t.text.startsWith('New: ')).map((t) => t.text);
    expect(news).toEqual(['New: an offer from Ferrowick to answer.']);
  });

  it('with no previous state change to read, every line the section lacks is news', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // The mark is there but no run record says which lines it is of (binned by retention, or older than manifests):
    // nothing is guessed from the mark, so the line names all that the person's section does not hold.
    const edited = (c.folder[HUB] ?? '')
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['One application open.'])}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing);
    const news = parseNote(HUB, run.after[HUB] ?? '').timeline.filter((t) => t.text.startsWith('New: ')).map((t) => t.text);
    expect(news).toEqual(['New: One application open, an offer from Ferrowick to answer.']);
  });

  it('a run manifest that cannot be read is passed over, and every line the section lacks is news', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // The earlier run's state change says what Bower wrote, but its manifest no longer reads as one: it is passed over
    // (a lenient read), so nothing is taken as said, as when there is no such run.
    const last = ['One application open.'];
    const edited = (c.folder[HUB] ?? '')
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(last)}\n`)
      .replace('- One application open.', '- Two applications open, one interview on Friday.');
    const unreadable = async (drive: Parameters<typeof stateWrittenBefore>[0], root: string): Promise<void> => {
      await stateWrittenBefore(drive, root, HUB, last);
      const all = await drive.listAll(root);
      const m = all.find((f) => /^\.bower\/runs\/run-state\/manifest-[0-9a-f]{64}\.json$/.test(drive.pathOf(f.id, root)));
      if (!m) throw new Error('no earlier manifest');
      await drive.writeText(m.id, '{"v": 2, "operations": [', m.modifiedTime);
    };
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing, undefined, unreadable);
    const news = parseNote(HUB, run.after[HUB] ?? '').timeline.filter((t) => t.text.startsWith('New: ')).map((t) => t.text);
    expect(news).toEqual(['New: One application open, an offer from Ferrowick to answer.']);
    expect(errors.mock.calls.some((call) => String(call[0]).startsWith('A run manifest could not be read'))).toBe(true);
  });

  it('after a Bower append the next run only adds a line', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // The file is as an earlier write left it (a stale bowerMd5 equal to its listed md5Checksum): still the person's.
    const run = await runWithClaude(c, proposing, { [HUB]: { bowerMd5: md5(c.folder[HUB] ?? '') } });

    expect(run.code).toBe(0);
    const after = run.after[HUB] ?? '';
    expect(parseNote(HUB, after).currentState).toEqual(['One application open.']);
    expect(after).not.toContain('bower_state');
    expect(hubEdit(manifestOf(run.after)).some((x) => x.kind === 'state-rewrite')).toBe(false);
    expect(parseNote(HUB, after).timeline.some((t) => t.text === 'New: an offer from Ferrowick to answer.')).toBe(true);
    // A Bower write no longer leaves a checksum behind for a later run to adopt by.
    expect(run.props[MADE]?.bowerMd5).toBeUndefined();
  });

  it('an unmarked Current state is never adopted without a rule', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    const long = Array.from({ length: 8 }, (_, i) => `Flat ${'abcdefgh'[i] ?? ''} on the shortlist, with a long description of its rooms, its light, its street and the walk to the station.`);
    const run = await runWithClaude(c, proposingStates([{ note: HUB, lines: NEW_STATE }, { note: FLAT, lines: long }]));

    expect(run.code).toBe(0);
    const hub = parseNote(HUB, run.after[HUB] ?? '');
    const flat = parseNote(FLAT, run.after[FLAT] ?? '');
    // Never rewritten: the sections stay as the person has them, with no mark.
    expect(hub.currentState).toEqual(['One application open.']);
    expect(flat.currentState).toEqual(['Three flats on the shortlist.']);
    expect(run.after[HUB]).not.toContain('bower_state');
    expect(run.after[FLAT]).not.toContain('bower_state');
    expect(editOf(manifestOf(run.after), HUB).some((x) => x.kind === 'state-rewrite')).toBe(false);
    expect(editOf(manifestOf(run.after), FLAT).some((x) => x.kind === 'state-rewrite')).toBe(false);
    // The news goes on each Timeline as one line, within an authored line's limits.
    const hubLine = hub.timeline.find((t) => t.text === 'New: an offer from Ferrowick to answer.');
    expect(hubLine?.source).toBe('Industrial Designer, Ferrowick');
    const flatLine = flat.timeline.find((t) => t.text.includes('lat a on the shortlist'));
    expect(flatLine).toBeDefined();
    expect(flatLine?.text.length).toBeLessThanOrEqual(200);
    // One question for the folder, word for word; none per note.
    const questions = questionsOf(run.after);
    expect(questions.map((q) => q.text)).toEqual([ADOPT_QUESTION]);
    expect(questions.some((q) => q.id.startsWith('q-state-'))).toBe(false);
    const report = (run.lastRun as { run: { report: { questions: Array<{ id: string }> } } }).run.report;
    expect(report.questions.map((q) => q.id)).toEqual(questions.map((q) => q.id));
  });

  it('a yes rule lets Bower adopt the section', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // The yes to the folder's question, as a rule line (C11 words it; scripted here until ask-answer-loop).
    const rules = serializeRules([{ id: 'rule-1', text: ADOPT_STATES_RULE, since: Date.UTC(2026, 9, 1) }]);
    const run = await runWithClaude({ ...c, folder: { ...c.folder, 'Rules.md': rules } }, proposing);

    expect(run.code).toBe(0);
    const after = run.after[HUB] ?? '';
    expect(parseNote(HUB, after).currentState).toEqual(NEW_STATE);
    expect(after).toContain(`bower_state: ${stateMark(NEW_STATE)}\n`);
    expect(hubEdit(manifestOf(run.after)).find((x) => x.kind === 'state-rewrite')).toEqual({ kind: 'state-rewrite', recordIds: [], previous: ['One application open.'], lines: NEW_STATE, adopted: true });
    expect(questionsOf(run.after)).toEqual([]);
  });

  it('undo restores an empty section empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    // Bower's own Current state, empty.
    const empty = marked((c.folder[HUB] ?? '').replace('- One application open.\n', ''), []);
    expect(parseNote(HUB, empty).currentState).toEqual([]);
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: empty } }, proposing);

    expect(run.code).toBe(0);
    const after = run.after[HUB] ?? '';
    expect(parseNote(HUB, after).currentState).toEqual(NEW_STATE);
    const changes = hubEdit(manifestOf(run.after));
    expect(changes.find((x) => x.kind === 'state-rewrite')).toEqual({ kind: 'state-rewrite', recordIds: [], previous: [], lines: NEW_STATE });
    const back = applyChanges(bytes(after), undoChanges(changes));
    expect(back.ok).toBe(true);
    const undone = back.ok ? back.text : '';
    expect(parseNote(HUB, undone).currentState).toEqual([]);
    // Byte for byte what Bower had, but for the Timeline line this run added.
    expect(undone.replace(/^- 2026-10-07 · .*\n/m, '')).toBe(empty);
  });
});
