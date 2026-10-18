/** A note written from a pile of words gets a summary in Bower's words, never the words copied twice (words-note-summary AC1). */
import { describe, expect, it, vi } from 'vitest';
import { parseNote } from '../contracts/note-format';
import { askId } from '../contracts/questions';
import { FakeDrive } from '../drive/fake-drive';
import { SAMPLE_PILES } from '../demo/fixture';
import { DemoWorld } from '../demo/world';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { SYSTEM } from '../vault/layout';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { modelDecisions, planScripted, runKeys, type Placement } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-words-summary';
const WORDS = 'The shed key is under the blue pot by the back door, Alex says.';
const FIXED = 'Written from a note you added.';

/** The empty made-up folder with one pile of words only, planned under a reply that files it as `place` says. */
async function planned(place: Placement, answered = false) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A' });
  await vault.addPile({ text: WORDS, items: [] });
  await vault.settled();
  const files = await drive.listAll(root);
  const idOf = (path: string) => files.find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
  let admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-words' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const pileId = admission.manifest.piles[0]?.pileId ?? '';
  if (answered) {
    // Asked where the pile goes, the person picked Areas/Home: the answer's folder wins over the reply's place.
    const question = { id: askId(pileId), subject: pileId, text: 'Where does this go?', yes: 'Choose', no: 'Leave it', askedAt: AT - 2,
      options: [{ id: 'home', label: 'Home', action: { kind: 'file-to', folderId: idOf('Areas/Home') } }, { id: 'res', label: 'Resources', action: { kind: 'file-to', folderId: idOf('Resources') } }] };
    const questions = files.find((f) => drive.pathOf(f.id, root) === SYSTEM.questions);
    if (questions) await drive.writeText(questions.id, JSON.stringify({ v: 1, questions: [question] }), questions.modifiedTime);
    else await drive.createText(idOf(SYSTEM.dir), 'questions.json', JSON.stringify({ v: 1, questions: [question] }));
    await drive.createText(idOf(SYSTEM.changes), 'answer-1.json', JSON.stringify({ v: 1, id: 'answer-1', device: 'DEVICE_A', at: AT - 1, kind: 'answer',
      what: 'Answered a question', questionId: question.id, askedAt: question.askedAt, answer: { option: 'home' } }));
    admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-words-2' });
    if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  }
  const taken = admission.manifest;
  const plan = await planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN, requestId: taken.id, requestedAt: taken.at, taken,
    mintKey: await runKeys(RUN), decisions: modelDecisions({ thing: () => null, words: (id) => (id === pileId ? place : null) }) });
  // The note written from the words: the one created text that holds them.
  const created = plan.manifest.operations.flatMap((op) => {
    const text = (op.effect as { text?: unknown }).text;
    return typeof text === 'string' && text.includes(WORDS) ? [text] : [];
  });
  return { plan, created };
}

describe('a note written from words', () => {
  it('AC1: keeps the reply\'s summary, trimmed, and the person\'s words as its body', async () => {
    const { created } = await planned({ to: 'Areas/Home', name: 'Shed key.md', summary: '  Where Alex keeps the shed key.  ' });
    expect(created).toHaveLength(1);
    const note = parseNote('Areas/Home/Shed key.md', created[0] ?? '');
    expect(note.summary).toBe('Where Alex keeps the shed key.');
    expect(note.body).toBe(WORDS);
  });

  it('AC1: with no summary in the reply, the fixed line, never the pile\'s words', async () => {
    const { created } = await planned({ to: 'Areas/Home', name: 'Shed key.md' });
    const note = parseNote('Areas/Home/Shed key.md', created[0] ?? '');
    expect(note.summary).toBe(FIXED);
    expect(note.body).toBe(WORDS);
  });

  it('AC1: the summary survives a place picked in answer to a question', async () => {
    const { plan, created } = await planned({ to: 'Resources', name: 'Shed key.md', summary: ' Where Alex keeps the shed key. ' }, true);
    expect(created).toHaveLength(1);
    expect(JSON.stringify(plan.manifest.operations)).toContain('Areas/Home');
    const note = parseNote('Areas/Home/Shed key.md', created[0] ?? '');
    expect(note.summary).toBe('Where Alex keeps the shed key.');
    expect(note.body).toBe(WORDS);
  });

  it('AC1: the demo writes the fixed line as the summary, and the words as the body', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'empty', scale: 'demo', latency: 0 });
    try {
      const { vault, runs } = w.sources();
      const sample = SAMPLE_PILES.find((x) => !x.items.length);
      if (!sample) throw new Error('no note-only sample');
      w.addSample(sample);
      await runs.start('all');
      await vi.runAllTimersAsync();
      const note = await vault.note('Areas/Home/Bins and recycling.md');
      expect(note.summary).toBe(FIXED);
      expect(note.body).toBe(sample.text.trim());
    } finally {
      w.dispose();
      vi.useRealTimers();
    }
  });
});
