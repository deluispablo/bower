/** A request Bower will not do says so plainly (live-refusal-wording AC1): the model's `never` is one row, no line, archived. */
import { describe, expect, it } from 'vitest';
import { scriptedDecisions } from '../demo/script';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { SYSTEM } from '../vault/layout';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { modelDecisions, NEVER_WHY, NOTHING_FOUND_WHY, planScripted, runKeys, type Decisions, type RunPlan } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-never';

/** The demo folder with one request of Alex's, written as the app writes it, planned under the given decisions. */
async function plan(words: (title: string) => string, decide: (recordId: string) => Decisions) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const files = await drive.listAll(root);
  const note = files.find((f) => !f.folder && f.name.endsWith('.md') && drive.pathOf(f.id, root).startsWith('Areas/') && f.name.length > 12);
  if (!note) throw new Error('Expected a made-up note in the demo folder');
  const changes = files.find((f) => f.folder && drive.pathOf(f.id, root) === SYSTEM.changes);
  if (!changes) throw new Error('Expected the changes folder');
  const text = words(note.name.replace(/\.md$/, ''));
  const request = await drive.createText(changes.id, 'never-1.json', JSON.stringify({ v: 1, id: 'never-1', device: 'device-1', at: AT, kind: 'request', what: `Asked Bower: "${text}"`, text }));
  const run = async (): Promise<RunPlan> => {
    const admission = await planAdmission(fakeRead(drive), root, { scope: 'instructions', clock: () => AT, newId: () => 'admission-never' });
    if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
    const taken = admission.manifest;
    return planScripted(fakeScripted(drive), root, { scope: 'instructions', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken, mintKey: await runKeys(RUN), decisions: decide('never-1') });
  };
  return { drive, root, changes, request, run };
}
const rowsOf = (p: RunPlan) => (p.manifest.reportPlan ?? []).flatMap((r) => r.value.leftAsWritten ?? []);
const archives = (p: RunPlan, fileId: string) => p.manifest.operations.some((op) => op.effect.kind === 'move' && op.effect.before.fileId === fileId);
const refusing = (id: string): Decisions => modelDecisions({ thing: () => null, words: () => null, neverDo: new Set([id]) });
const silent = (): Decisions => modelDecisions({ thing: () => null, words: () => null });

describe('a request Bower never does', () => {
  it('AC1: a request naming a note gets one NEVER_WHY row, no line on the note, and is archived', async () => {
    const f = await plan((title) => `Delete ${title} for good`, refusing);
    // Positive control: the same request with no word from the model is the old "found nothing" row.
    const control = await (await plan((title) => `Delete ${title} for good`, silent)).run();
    expect(rowsOf(control).map((r) => r.why)).toEqual([NOTHING_FOUND_WHY]);
    const p = await f.run();
    expect(rowsOf(p)).toEqual([{ name: 'Request', why: NEVER_WHY }]);
    expect(p.manifest.operations.filter((op) => op.effect.kind === 'edit-text')).toEqual([]);
    expect(archives(p, f.request.id)).toBe(true);
  });

  it('AC1: a request naming no note gets the same row and is archived', async () => {
    const f = await plan(() => 'Wipe everything from my Drive for good', refusing);
    const p = await f.run();
    expect(rowsOf(p)).toEqual([{ name: 'Request', why: NEVER_WHY }]);
    expect(archives(p, f.request.id)).toBe(true);
  });

  it('AC1: a rerun after the archive does not add the row again or reopen the request', async () => {
    const f = await plan((title) => `Delete ${title} for good`, refusing);
    await f.run();
    const archive = await f.drive.createFolder(f.changes.id, 'archive');
    await f.drive.update(f.request.id, { addParent: archive.id, removeParent: f.changes.id });
    const admission = await planAdmission(fakeRead(f.drive), f.root, { scope: 'instructions', clock: () => AT, newId: () => 'admission-never-2' });
    // The archived request is no longer admitted: nothing to plan, so no row and no reopened request.
    if (admission.kind !== 'manifest') return;
    const p = await planScripted(fakeScripted(f.drive), f.root, { scope: 'instructions', allowWeb: false, runId: 'run-never-2', requestId: admission.manifest.id, requestedAt: admission.manifest.at, taken: admission.manifest, mintKey: await runKeys('run-never-2'), decisions: refusing('never-1') });
    expect(rowsOf(p)).toEqual([]);
    expect(archives(p, f.request.id)).toBe(false);
  });

  it('AC1: the demo script says nothing is never done', () => {
    expect(scriptedDecisions([], []).neverDo).toBeUndefined();
  });
});
