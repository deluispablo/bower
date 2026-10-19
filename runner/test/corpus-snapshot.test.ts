/**
 * Snapshot evidence (corpus-scorer-state AC2): the test driver records, before and after a press, each file's stable
 * Drive id, the SHA-256 of its bytes (a binary's as well as a text's) and its appProperties, and tells a file in the
 * Drive Bin from one that is gone, so the scorer's preservation checks fail on a recreated lookalike or a missing binary.
 */
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/data/contracts/hashes';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { loadCase, scoreCase, type Expected } from '../src/corpus';
import { AT, replySequence, runWithClaude } from './corpus-run';

const NOTE = 'Projects/Garden plot.md';
const PDF = 'Projects/Seed list.pdf';
const NOTE_TEXT = '---\nsummary: Alex’s garden plot.\nby: bower\n---\n\n## Current state\n- Alex grows herbs.\n';
/** Not UTF-8 (0xff), so only its bytes describe it. */
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x0a, 0xff, 0xfe, 0x00]);
const KEPT: Expected = { unchangedSinceStart: [NOTE, PDF] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

/** One press over a folder holding a Bower note and a PDF; `during` changes the Drive while the press runs. */
async function press(during?: (drive: FakeDrive, idOf: (path: string) => string) => Promise<void>) {
  const seed = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c05-merge-question-first'));
  const c = { ...seed, id: 'snapshot-garden', scope: 'all' as const, inbox: [{ line: 'Alex’s garden plot notes describe herbs.', files: [] }],
    journal: [], questions: [], folder: { [NOTE]: NOTE_TEXT }, folderBinary: { [PDF]: PDF_BYTES }, inboxFiles: {}, inboxBinary: {}, bowerOwned: [NOTE], expected: {} };
  let drive: FakeDrive | undefined;
  let root = '';
  let changed = false;
  const scripted = replySequence([{ kind: 'tidy-intent', v: 1, things: [] }]);
  const run = await runWithClaude(c, async (call) => {
    if (during && drive && !changed) {
      changed = true;
      const d = drive;
      const ids = new Map((await d.listAll(root)).map((f) => [d.pathOf(f.id, root), f.id]));
      await during(d, (path) => ids.get(path) ?? '');
    }
    return scripted(call);
  }, undefined, async (d, r) => { drive = d; root = r; });
  return { c, run };
}

it('corpus-scorer-state AC2: snapshot evidence preserves bytes identities properties and trash state', async () => {
  const { c, run } = await press();
  expect(run.code).toBe(0);
  // Bytes: a binary by the SHA-256 of its bytes, a text by its UTF-8 bytes', at the press's start and after it.
  expect(run.files?.[PDF]?.sha256, 'a binary is recorded by the hash of its bytes').toBe(await sha256Hex(PDF_BYTES));
  expect(run.files?.[NOTE]?.sha256).toBe(await sha256Hex(NOTE_TEXT));
  expect(run.start?.files[PDF]).toEqual(run.files?.[PDF]);
  // Identity and ownership: the stable Drive id the file was seeded with, and Bower's mark on its note.
  const pdfId = run.files?.[PDF]?.id ?? '';
  expect(run.pathsById[pdfId]).toBe(PDF);
  expect(run.props[NOTE]).toEqual({ by: 'bower' });
  expect(scoreCase({ ...c, expected: KEPT }, run)).toEqual({ pass: true, unmet: [] });
  // A lookalike: the PDF binned and the same bytes uploaded under its name is not the file the person had.
  const lookalike = await press(async (drive, idOf) => {
    await drive.trash(idOf(PDF));
    await drive.upload(idOf('Projects'), 'Seed list.pdf', new Blob([PDF_BYTES.slice()]));
  });
  expect(lookalike.run.files?.[PDF]?.sha256).toBe(run.files?.[PDF]?.sha256);
  expect(lookalike.run.binned).toContain(pdfId);
  expect(scoreCase({ ...c, expected: KEPT }, lookalike.run).unmet).toEqual([`unchangedSinceStart: ${PDF} was recreated with a new Drive id`]);
  // Trashed versus missing: a binned PDF is in the Bin; one gone from the Drive altogether is missing.
  const binned = await press(async (drive, idOf) => { await drive.trash(idOf(PDF)); });
  expect(binned.run.binned).toContain(pdfId);
  expect(scoreCase({ ...c, expected: KEPT }, binned.run).unmet).toEqual([`unchangedSinceStart: ${PDF} is in the Bin`]);
  expect(scoreCase({ ...c, expected: KEPT }, { ...binned.run, binned: [] }).unmet).toEqual([`unchangedSinceStart: ${PDF} is missing`]);
  // Bytes and ownership of a text: a rewritten note, and a note that lost Bower's mark with the same bytes.
  const rewritten = await press(async (drive, idOf) => {
    const id = idOf(NOTE);
    await drive.writeText(id, NOTE_TEXT.replace('herbs', 'mint'), (await drive.get(id)).modifiedTime);
  });
  expect(scoreCase({ ...c, expected: KEPT }, rewritten.run).unmet).toEqual([`unchangedSinceStart: ${NOTE} changed bytes`]);
  const unmarked = await press(async (drive, idOf) => { await drive.update(idOf(NOTE), { appProperties: { by: null } }); });
  expect(scoreCase({ ...c, expected: KEPT }, unmarked.run).unmet).toEqual([`unchangedSinceStart: ${NOTE} changed properties`]);
});
