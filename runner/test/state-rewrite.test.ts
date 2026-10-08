/**
 * `state-rewrite-change` (TL-P4-08 addendum 1 point 1, the first C05 entry): a change kind of its own rewrites only
 * the Bower-owned "## Current state" of a note, through the modifiedTime and bytes it read; the manifest keeps the
 * previous lines so an undo (C13) restores them; a Current state the person edited after Bower is never rewritten:
 * the change becomes a Timeline line plus a question (the C11 asks flow).
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChanges, stateMark, undoChanges } from '../../src/data/contracts/note-edit';
import type { Change, ManifestV2 } from '../../src/data/contracts/run-manifest';
import { parseNote } from '../../src/data/vault/note-format';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
const HUB = 'Projects/Job hunt/Job hunt.md';
const NEW_STATE = ['One application open.', 'An offer from Ferrowick to answer.'];

afterEach(() => vi.restoreAllMocks());

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** The model's intent for the hub-lines pile: both things filed, and the job hunt's Current state brought up to date. */
const proposing: ClaudeSpawn = async (call) => {
  const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
  const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  const offer = ids.get('Offer_letter_final(2).pdf') ?? 'none';
  const intent = {
    kind: 'tidy-intent', v: 1,
    things: [
      { fileId: offer, to: 'Projects/Job hunt/Applications', basis: HUB, name: 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick for Industrial Designer.', body: 'Fully remote. Start 2 November. [[Job hunt]]' } },
      { fileId: ids.get('listing-88213.example.url') ?? 'none', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
    ],
    lines: [{ note: HUB, text: 'New offer from Ferrowick, fully remote.', cites: offer }],
    states: [{ note: HUB, lines: NEW_STATE, cites: offer }],
  };
  return { code: 0, stderr: '', cut: null, stdout: envelope(intent) };
};

async function hubCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-hub-lines');
  if (!c) throw new Error('no corpus case c05-hub-lines');
  return c;
}

const manifestOf = (after: Record<string, string>): ManifestV2 => {
  const [path] = Object.keys(after).filter((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p));
  return JSON.parse(after[path ?? ''] ?? 'null') as ManifestV2;
};
const hubEdit = (m: ManifestV2): Change[] => m.operations.flatMap((o) => (o.effect.kind === 'edit-text' && o.effect.path === HUB ? o.effect.changes : []));
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('a change kind of its own for Current state (C05)', () => {
  it('a Bower-owned Current state is rewritten and undo restores it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await hubCase();
    const run = await runWithClaude(c, proposing);

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
    const run = await runWithClaude({ ...c, folder: { ...c.folder, [HUB]: edited } }, proposing);

    expect(run.code).toBe(0);
    const note = parseNote(HUB, run.after[HUB] ?? '');
    expect(note.currentState).toEqual(['Two applications open, one interview on Friday.']);
    // What Bower would have written goes on the Timeline, citing the thing, and the person is asked.
    const line = note.timeline.find((t) => t.text.includes('An offer from Ferrowick to answer.'));
    expect(line?.source).toBe('Industrial Designer, Ferrowick');
    const questions = JSON.parse(run.after['.bower/questions.json'] ?? '{}') as { questions: Array<{ id: string; about?: string }> };
    const asked = questions.questions.find((q) => q.id.startsWith('q-state-'));
    expect(asked?.about).toBe(HUB);
    const report = (run.lastRun as { run: { report: { questions: Array<{ id: string }> } } }).run.report;
    expect(report.questions.map((q) => q.id)).toContain(asked?.id);
    expect(hubEdit(manifestOf(run.after)).some((x) => x.kind === 'state-rewrite')).toBe(false);
  });
});
