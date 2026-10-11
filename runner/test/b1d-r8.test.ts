/** TL-P4-41 addendum 25: mechanical merge backlinks and model authority through runner main. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ManifestV2 } from '../../src/data/contracts/run-manifest';
import { undoEdit } from '../../src/data/contracts/note-edit';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { candidates, empty, folder, note, run, setup } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

const A = 'Projects/Remote search/A.md';
const B = 'Projects/Remote search/B.md';
const C = 'Resources/Gardening/C.md';
const C_TEXT = note('Alex grows herbs.', '# C\nAlex keeps these personal words.\nSee [[B]].\n\n## Timeline\n- Alex planted herbs.\n');
const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

async function mergeSetup() {
  const b = await setup({ inbox: [{ line: 'Answer the question.', files: [] }], folder: { ...folder,
    [A]: note('Remote developer offer.', '## Timeline\n- Alex received an offer.\n', true),
    [B]: note('Remote developer offer.', '## Timeline\n- Alex checked the terms.\n', true),
    [C]: C_TEXT,
  } });
  for (const pile of b.admission.piles) await b.drive.trash(pile.anchor?.fileId ?? '');
  b.c.inbox = []; b.c.scope = 'instructions';
  const question = { id: `q-pair-${[b.id(A), b.id(B)].sort().join('.')}`, text: 'Keep one note?',
    yes: 'Yes, keep one', no: 'No, keep both', about: A, askedAt: AT - 2 };
  const questions = await b.drive.get(b.id(SYSTEM.questions));
  await b.drive.writeText(questions.id, JSON.stringify({ v: 1, questions: [question] }), questions.modifiedTime);
  const answer = await b.drive.createText(b.id(SYSTEM.changes), 'r8-answer.json', JSON.stringify({
    v: 1, id: 'r8-answer', device: 'device-1', kind: 'answer', questionId: question.id,
    askedAt: question.askedAt, at: AT - 1, what: 'Answered a question', text: 'yes',
  }));
  const admitted = await planAdmission(fakeRead(b.drive), b.root, {
    scope: 'instructions', clock: () => AT, newId: () => 'r8-admission',
  });
  expect(admitted.kind).toBe('manifest');
  if (admitted.kind !== 'manifest') throw new Error('Expected keep-one answer admission.');
  expect(admitted.manifest.journal.map((line) => line.fileId)).toEqual([answer.id]);
  const selection = { items: [{ itemId: answer.id, kind: 'unknown',
    destination: b.id('Projects/Remote search'), wants: [b.id(A), b.id(B)] }], asks: [] };
  const keep = { ...empty, keep: [{ kept: A, other: B }] };
  return { b, answer, admission: admitted.manifest, selection, keep };
}

it('b1d-r8 1 a keep-one merge rewrites backlinks in an unselected note', async () => {
  const { b, answer, admission, selection, keep } = await mergeSetup();
  const cSeen = await b.drive.get(b.id(C));
  const r = await run(b, [selection, keep], { admission });
  expect(r.code, r.errors).toBe(0);
  expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(r.frames).toHaveLength(2);
  expect(candidates(r.frames[0], answer.id)).not.toContain(b.id(C));
  expect(r.frames[1]?.value.selection).toEqual(selection);
  expect(r.frames[1]?.value.allowedTargets).toEqual({ [answer.id]: expect.not.arrayContaining([b.id(C)]) });
  expect(r.after[C]).toBe(C_TEXT.replace('[[B]]', '[[A]]'));
  expect(r.after[A]).toContain('Alex received an offer.');
  expect(r.after[A]).toContain('Alex checked the terms.');
  expect(r.after[B]).toBeUndefined();
  expect((await b.drive.get(b.id(B), { binned: true })).trashed).toBe(true);
  expect(r.pathsById[answer.id]).toBe(`${SYSTEM.archive}/r8-answer.json`);
  expect(JSON.parse(r.after[SYSTEM.questions] ?? '{}')).toEqual({ v: 1, questions: [] });

  const path = Object.keys(r.after).find((p) => /\/manifest-[^/]+\.json$/.test(p));
  const manifest = JSON.parse(r.after[path ?? ''] ?? 'null') as ManifestV2;
  const edits = manifest.operations.filter((op) => op.effect.kind === 'edit-text');
  expect(edits.map((op) => op.effect.kind === 'edit-text' ? op.effect.path : '').sort()).toEqual([A, C]);
  const rewrite = edits.find((op) => op.effect.kind === 'edit-text' && op.effect.before.fileId === b.id(C));
  expect(rewrite?.effect).toMatchObject({ kind: 'edit-text', path: C, beforeText: C_TEXT,
    before: { fileId: b.id(C), modifiedTime: cSeen.modifiedTime },
    changes: [{ kind: 'link-rewrite' }] });
  const bin = manifest.operations.find((op) => op.effect.kind === 'bin' && op.effect.before.fileId === b.id(B));
  expect(bin?.dependsOn).toContain(rewrite?.operationId);
  // The existing merge row reports the whole merge, including its required backlink rewrite.
  const row = manifest.reportPlan.find((contribution) => contribution.value.updated.some((updated) =>
    updated.path === A && updated.what === 'Kept as one note with B, which went to the Bin.'));
  expect(row?.requires).toEqual(expect.arrayContaining([rewrite?.operationId, bin?.operationId]));
  const report = (r.lastRun as { run: { report: ManifestV2['reportPlan'][number]['value'] } }).run.report;
  expect(report.updated).toContainEqual(expect.objectContaining({ path: A,
    what: 'Kept as one note with B, which went to the Bin.' }));

  // Reuse the manifest-backed Undo mechanism exercised by keep-one-note.test.ts.
  await b.drive.untrash(b.id(B));
  for (const op of edits) {
    if (op.effect.kind !== 'edit-text') throw new Error('Expected merge edit.');
    const back = await undoEdit(op.effect, new Uint8Array(await b.drive.readBytes(op.effect.before.fileId)));
    expect(back.ok).toBe(true);
    const now = await b.drive.get(op.effect.before.fileId);
    if (back.ok) await b.drive.writeText(now.id, back.text, now.modifiedTime);
  }
  for (const path of [A, B, C]) expect(await b.drive.readText(b.id(path))).toBe(b.c.folder[path]);
  expect((await b.drive.get(b.id(B))).trashed).not.toBe(true);
});

it('b1d-r8 2 the model cannot add a non-backlink edit to an unselected note', async () => {
  const { b, answer, admission, selection, keep } = await mergeSetup();
  const malicious = { ...keep, lines: [{ note: C, text: 'Alex gave away the herbs.' }] };
  const r = await run(b, [selection, malicious, keep], { admission });
  expect(r.code, r.errors).toBe(0);
  expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(candidates(r.frames[0], answer.id)).not.toContain(b.id(C));
  expect(r.frames[1]?.value.selection).toEqual(selection);
  expect(r.frames[1]?.value.allowedTargets).toEqual({ [answer.id]: expect.not.arrayContaining([b.id(C)]) });
  expect(r.frames).toHaveLength(3);
  expect(r.frames[2]?.call.input).toContain('Your reply was refused:');
  expect(r.after[C], 'only the scripted backlink changes; all other personal bytes stay').toBe(C_TEXT.replace('[[B]]', '[[A]]'));
  expect(r.after[A]).toContain('Alex checked the terms.');
  expect(r.after[B]).toBeUndefined();
});
