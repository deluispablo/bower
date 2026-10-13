/**
 * Keep one note (C05, TL-P4-08 addendum 7, `keep-one-note-merge`): the person said yes to keeping one note for the
 * same flat, and the model's intent names the note kept and the other. The spine carries the other note's facts and
 * Timeline lines into the kept one as Timeline lines (the person's words there untouched), rewrites every link to the
 * other note to the kept one, and puts the other in the Drive Bin, never deleting it. The manifest keeps what an undo
 * needs: each edited note's text as it was read, and the binned note as the run saw it. No live call.
 */
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditText, ManifestV2 } from '../../src/data/contracts/run-manifest';
import { undoEdit } from '../../src/data/contracts/note-edit';
import type { ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { runWithClaude, type CaseRun } from './corpus-run';
import type { FakeDrive } from '../../src/data/drive/fake-drive';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
afterEach(() => vi.restoreAllMocks());

const KEPT = 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md';
const OTHER = 'Projects/Flat hunt/Flat 3 (second).md';
/** A note of the person's own that links the other note: its link follows the kept note, nothing else of it changes. */
const LINKER = 'Projects/Flat hunt/Viewing plan.md';
const LINKER_TEXT = 'Ask about the boiler at [[Flat 3 (second)]].\nCompare with [[Flat 7, Cobble Row]].\n';

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });
const keepOne: ClaudeSpawn = async () => ({ code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things: [], keep: [{ kept: KEPT, other: OTHER }] }) });

async function keepCase(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c05-keep-one-note');
  if (!c) throw new Error('no c05-keep-one-note case');
  return { ...c, folder: { ...c.folder, [LINKER]: LINKER_TEXT } };
}

const manifestOf = (run: CaseRun): ManifestV2 => {
  const [path] = Object.keys(run.after).filter((p) => /^\.bower\/runs\/[^/]+\/manifest-[0-9a-f]{64}\.json$/.test(p));
  return JSON.parse(run.after[path ?? ''] ?? 'null') as ManifestV2;
};
interface Report { updated: Array<{ path: string; what: string }>; questions: unknown[] }
const reportOf = (run: CaseRun): Report => (run.lastRun as { run: { report: Report } }).run.report;
const sections = (text: string): { state: string; timeline: string[] } => ({
  state: /## Current state\n([\s\S]*?)\n## /.exec(text)?.[1] ?? '',
  timeline: (/## Timeline\n([\s\S]*)$/.exec(text)?.[1] ?? '').split('\n').filter((l) => l.startsWith('- ')),
});

describe('keep one note', () => {
  it('keep one note carries the facts and bins the other', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await keepCase();
    const run = await runWithClaude(c, keepOne);
    expect(run.code).toBe(0);
    // The other note is in the Drive Bin, never deleted: Drive gives it back as it was.
    expect(Object.keys(run.after)).not.toContain(OTHER);
    const m = manifestOf(run);
    const bin = m.operations.find((o) => o.effect.kind === 'bin');
    expect(bin?.effect.kind === 'bin' ? bin.effect.before.name : null).toBe('Flat 3 (second).md');
    // The person's words in the kept note are untouched; the other's fact and Timeline line come in as Timeline lines.
    const was = sections(c.folder[KEPT] ?? '');
    const kept = sections(run.after[KEPT] ?? '');
    expect(kept.state).toBe(was.state);
    expect(kept.timeline.slice(0, was.timeline.length)).toEqual(was.timeline);
    expect(kept.timeline.slice(was.timeline.length)).toEqual([
      '- 2026-10-07 · The listing says the lease is twelve months.',
      '- 2026-10-07 · From 2026-10-02: Saved the second listing.',
    ]);
    // Every link to the other note now names the kept one; the rest of the person's note is as it was.
    expect(run.after[LINKER]).toBe(LINKER_TEXT.replace('[[Flat 3 (second)]]', '[[Flat 3, 12 Larkspur Lane]]'));
    // The report says it in one plain line; the question is answered and gone, the answer archived.
    // Its row names the kept note's edit, and no line of its own.
    expect(reportOf(run).updated).toContainEqual({ path: KEPT, what: 'Kept as one note with Flat 3 (second), which went to the Bin.', op: expect.any(String) as unknown as string });
    expect(reportOf(run).questions).toEqual([]);
    expect(JSON.parse(run.after['.bower/questions.json'] ?? '{}')).toEqual({ v: 1, questions: [] });
    expect(Object.keys(run.after).filter((p) => p.startsWith('.bower/changes/') && !p.startsWith('.bower/changes/archive/'))).toEqual([]);
  });

  it('undo of keep one note restores both notes and links', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await keepCase();
    const run = await runWithClaude(c, keepOne);
    expect(run.code).toBe(0);
    const m = manifestOf(run);
    expect(m?.operations.some((o) => o.effect.kind === 'bin')).toBe(true);
    const bin = m.operations.find((o) => o.effect.kind === 'bin');
    // The undo, from what the manifest kept: the other note back from the Bin, each edited note back to the text it had.
    if (bin?.effect.kind === 'bin') await run.drive.untrash(bin.effect.before.fileId);
    const edits = m.operations.flatMap((o) => (o.effect.kind === 'edit-text' ? [o.effect as EditText] : []));
    expect(edits.map((e) => e.path).sort()).toEqual([KEPT, LINKER]);
    for (const e of edits) {
      const now = await run.drive.readBytes(e.before.fileId);
      const back = await undoEdit(e, new Uint8Array(now));
      expect(back.ok).toBe(true);
      const meta = (await run.drive.listAll(run.root)).find((f) => f.id === e.before.fileId);
      if (back.ok && meta) await run.drive.writeText(e.before.fileId, back.text, meta.modifiedTime);
    }
    const all = await run.drive.listAll(run.root);
    const texts = Object.fromEntries(await Promise.all(Object.keys(c.folder).map(async (path) => {
      const name = path.split('/').at(-1);
      const f = all.find((x) => !x.folder && x.name === name);
      return [path, f ? await run.drive.readText(f.id) : null] as const;
    })));
    expect(texts).toEqual(c.folder);
  });
  it('the other note changed after the read is not binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await keepCase();
    const CAT = '- 2026-10-07 · Alex: the landlord accepts a cat.';
    // The person adds a line to the other note on their phone while the run writes the kept one.
    const before = async (drive: FakeDrive, root: string): Promise<void> => {
      const all = await drive.listAll(root);
      const otherId = all.find((f) => f.name === 'Flat 3 (second).md')?.id ?? '';
      const keptId = all.find((f) => f.name === 'Flat 3, 12 Larkspur Lane.md')?.id ?? '';
      const write = drive.writeText.bind(drive);
      let done = false;
      drive.writeText = async (id, text, ifModified, props) => {
        const out = await write(id, text, ifModified, props);
        if (id === keptId && !done) {
          done = true;
          const meta = (await drive.listAll(root)).find((f) => f.id === otherId);
          if (meta) await write(otherId, `${await drive.readText(otherId)}${CAT}\n`, meta.modifiedTime);
        }
        return out;
      };
    };
    const run = await runWithClaude(c, keepOne, undefined, before);
    // Nothing is binned: the other note stays with the person's new line, the question stays open, and the run says why.
    expect(OTHER in run.after).toBe(true);
    expect(run.after[OTHER]).toContain(CAT);
    expect(JSON.parse(run.after['.bower/questions.json'] ?? '{}')).toMatchObject({ questions: [expect.objectContaining({ id: 'q-merge-flat-3' })] });
    const report = (run.lastRun as { run: { report: { setAside: Array<{ name: string; why: string }> } } }).run.report;
    expect(report.setAside).toContainEqual({ name: 'Flat 3 (second)', why: 'It changed while Bower worked, so both notes stay; the next tidy-up keeps one.' });
  });

  it('keep-one says what happened when the other note moved or was binned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await keepCase();
    // The person moves, or bins, the other note on their phone while the run writes the kept one.
    const meanwhile = (act: (drive: FakeDrive, otherId: string, root: string) => Promise<void>) => async (drive: FakeDrive, root: string): Promise<void> => {
      const all = await drive.listAll(root);
      const otherId = all.find((f) => f.name === 'Flat 3 (second).md')?.id ?? '';
      const keptId = all.find((f) => f.name === 'Flat 3, 12 Larkspur Lane.md')?.id ?? '';
      const write = drive.writeText.bind(drive);
      let done = false;
      drive.writeText = async (id, text, ifModified, props) => {
        const out = await write(id, text, ifModified, props);
        if (id === keptId && !done) {
          done = true;
          await act(drive, otherId, root);
        }
        return out;
      };
    };
    const setAsideOf = (run: CaseRun): Array<{ name: string; why: string }> => (run.lastRun as { run: { report: { setAside: Array<{ name: string; why: string }> } } }).run.report.setAside;
    const moved = await runWithClaude(c, keepOne, undefined, meanwhile(async (drive, otherId, root) => {
      const job = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Job hunt')?.id ?? '';
      const flats = (await drive.get(otherId)).parents[0] ?? '';
      await drive.update(otherId, { addParent: job, removeParent: flats });
    }));
    // Moved: both notes stay, and the report says it was moved, never that it changed.
    expect(moved.after['Projects/Job hunt/Flat 3 (second).md']).toBe(c.folder[OTHER]);
    expect(setAsideOf(moved)).toContainEqual({ name: 'Flat 3 (second)', why: 'It was moved or renamed while Bower worked, so both notes stay; the next tidy-up keeps one.' });
    const binned = await runWithClaude(c, keepOne, undefined, meanwhile(async (drive, otherId) => {
      await drive.trash(otherId);
    }));
    // Binned by the person: only the kept note stays, and the report never says both do.
    expect(OTHER in binned.after).toBe(false);
    expect(setAsideOf(binned)).toContainEqual({ name: 'Flat 3 (second)', why: 'It went to the Bin while Bower worked, so only the kept note stays.' });
    expect(setAsideOf(binned).some((r) => /both notes stay/.test(r.why))).toBe(false);
  });

  it('a line that only starts like a kept line is carried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await keepCase();
    const folder = { ...c.folder };
    folder[OTHER] = (folder[OTHER] ?? '').replace('- The listing says the lease is twelve months.', '- Bills included');
    folder[KEPT] = (folder[KEPT] ?? '').replace('- Two bedrooms, second floor.', '- Two bedrooms, second floor.\n- Bills included: no, about 120 a month.');
    const run = await runWithClaude({ ...c, folder }, keepOne);
    expect(run.code).toBe(0);
    expect(OTHER in run.after).toBe(false);
    expect(sections(run.after[KEPT] ?? '').timeline).toContain('- 2026-10-07 · Bills included');
  });
});
