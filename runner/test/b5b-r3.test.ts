import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Question } from '../../src/data/contracts/types';
import { scriptedDecisions } from '../../src/data/demo/script';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import { FakeRunDrive } from '../../src/data/fake/fake-run-drive';
import { driveEffects, runOperations } from '../../src/data/spine/engine';
import { fakeRead } from '../../src/data/spine/read';
import { RunRecords } from '../../src/data/spine/records';
import { listedPiles, planScripted, runKeys } from '../../src/data/spine/scripted';

const AT = Date.UTC(2026, 9, 11);
const question: Question = { id: 'q-proposal-lease', text: 'Remember this kind for next time?',
  yes: 'Yes', no: 'No', askedAt: AT, proposal: { id: 'lease', payload: { kind: 'type-row', row: {
    id: 'lease', match: ['lease'], template: 'source', properties: { company: { type: 'text' } }, table: ['company'],
  } } } };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function setup() {
  const drive = new FakeDrive({ clock: () => AT });
  const root = (await drive.createFolder('root', 'Bower')).id;
  for (const name of ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive', '.bower']) await drive.createFolder(root, name);
  const files = await drive.listAll(root);
  const folder = (name: string) => {
    const file = files.find((f) => f.folder && f.name === name && f.parents.includes(root));
    if (!file) throw new Error(`Missing fixture folder: ${name}`);
    return file;
  };
  const inbox = folder('Inbox');
  const own = folder('.bower');
  const changes = await drive.createFolder(own.id, 'changes');
  const garden = await drive.createFolder(folder('Resources').id, 'Garden');
  await drive.createText(garden.id, 'Garden.md', '---\nsummary: Alex grows mint.\n---\nAlex grows mint.');
  const source = await drive.createText(inbox.id, 'Lease.txt', 'Alex keeps a garden lease.');
  const questions = await drive.createText(own.id, 'questions.json', JSON.stringify({ v: 1, questions: [] }));
  return { drive, root, inbox, own, source, questions, changes };
}
type Base = Awaited<ReturnType<typeof setup>>;

async function plan(base: Base, runId: string, offer = true) {
  const reads = fakeRead(base.drive);
  return (await planScripted({ ...reads, provenance: 'fake-stored',
    piles: (rootId, context) => listedPiles(reads, rootId, undefined, undefined, context),
  }, base.root, {
    scope: offer ? 'all' : 'instructions', allowWeb: false, runId, requestId: `request-${runId}`, requestedAt: AT,
    mintKey: await runKeys(runId), decisions: { ...scriptedDecisions([], []),
      thing: (item) => ({ to: 'Resources/Garden', name: item.fileName }),
      words: () => null, ownNote: () => null, note: () => null, merge: () => null,
      pileAsk: () => null, thingAsk: () => null, askAfter: () => offer ? question : null,
    },
  })).manifest;
}

async function apply(base: Base, manifest: Awaited<ReturnType<typeof plan>>) {
  const adapter = new FakeRunDrive(base.drive, () => undefined);
  const result = await runOperations({ rootId: base.root, runId: manifest.runId, attempt: 1,
    records: new RunRecords(adapter.reads(), base.root), batch: async () => adapter.fenced(),
    effects: driveEffects(adapter), plan: async () => manifest, clock: () => AT, newId: () => `attempt-${manifest.runId}`,
  });
  expect(result.state, 'real engine settles the manifest').toBe('settled');
  if (result.state !== 'settled') throw new Error('Fixture run did not settle');
  return result;
}

async function artifacts(base: Base) {
  const files = await base.drive.listAll(base.root);
  const folder = files.find((f) => f.name === 'proposals' && f.parents.includes(base.own.id));
  return files.filter((f) => !f.folder && f.parents.includes(folder?.id ?? ''));
}
async function published(base: Base): Promise<Question[]> {
  return (JSON.parse(await base.drive.readText(base.questions.id)) as { questions: Question[] }).questions;
}
const offers = (manifest: Awaited<ReturnType<typeof plan>>) => manifest.operations.some((op) =>
  (op.effect.kind === 'write-runner-json' && op.effect.path === '.bower/questions.json'
    || op.effect.kind === 'create-text' && op.effect.name === 'questions.json')
  && op.effect.text.includes('q-proposal-lease'));

it('b5b-r3 1 an unpublished proposal returns', async () => {
  for (const refusal of ['filing', 'publication'] as const) {
    const base = await setup();
    const first = await plan(base, `run-${refusal}-1`);
    expect(offers(first), 'positive control: the first plan offers the proposal').toBe(true);
    const move = first.operations.find((op) => op.effect.kind === 'move' && op.effect.before.fileId === base.source.id);
    const publication = first.operations.find((op) => op.effect.kind === 'write-runner-json' && op.effect.path === '.bower/questions.json');
    expect(move).toBeDefined(); expect(publication).toBeDefined();
    base.drive.fault = { before: (call) => (call.op === 'update' || call.op === 'write-text') && call.id ===
      (refusal === 'filing' ? base.source.id : base.questions.id) ? 'refuse' : 'pass' };
    const end = await apply(base, first);
    expect(end.chain.at(-1)?.outcomes.find((o) => o.operationId === publication?.operationId)?.state,
      `${refusal}: question publication was rejected`).toBe('rejected');
    if (refusal === 'filing') {
      expect(end.chain.at(-1)?.outcomes.find((o) => o.operationId === move?.operationId)?.state).toBe('rejected');
      expect((await base.drive.get(base.source.id)).parents).toEqual([base.inbox.id]);
    }
    expect(await published(base), 'a rejected publication never presents the proposal').toEqual([]);
    expect.soft(await artifacts(base), `${refusal}: no unpublished artifact may suppress the next offer`).toEqual([]);
    base.drive.fault = null;
    if (refusal === 'publication') await base.drive.createText(base.inbox.id, 'Another lease.txt', 'Alex keeps a second garden lease.');
    const retry = await plan(base, `run-${refusal}-2`);
    expect.soft(offers(retry), `${refusal}: the next run offers the unpublished proposal again`).toBe(true);
    await apply(base, retry);
    expect.soft(await published(base), `${refusal}: the retry publishes the original frozen payload`).toEqual([question]);
  }

  const base = await setup();
  let presented = false;
  const artifactWrites: boolean[] = [];
  base.drive.fault = { before: (call) => {
    if (call.op === 'create-text' && call.name === 'lease.json') artifactWrites.push(presented);
    return 'pass';
  }, applied: (call) => {
    if (call.op === 'write-text' && call.id === base.questions.id) presented = true;
  } };
  await apply(base, await plan(base, 'run-publication-order'));
  expect(await published(base), 'positive control: successful filing presents the proposal').toEqual([question]);
  expect(await artifacts(base)).toHaveLength(1);
  expect.soft(artifactWrites, 'the artifact is written with publication, never before the question').toEqual([true]);
});

it.each(['presented', 'declined', 'settled'] as const)('b5b-r3 1 an unpublished proposal returns: %s control', async (state) => {
  const base = await setup();
  await apply(base, await plan(base, `run-${state}-1`));
  expect(await published(base)).toEqual([question]);
  const frozen = await artifacts(base);
  expect(frozen).toHaveLength(1);
  const bytes = await base.drive.readText(frozen[0]?.id ?? '');
  expect(JSON.parse(bytes)).toEqual({ v: 1, ...question.proposal });
  if (state !== 'presented') {
    await base.drive.createText(base.changes.id, 'answer.json', JSON.stringify({ v: 1, id: 'answer-lease', device: 'device-1',
      at: AT, kind: 'answer', what: 'Answered a question', text: state === 'declined' ? 'no' : 'yes',
      questionId: question.id, askedAt: AT }));
    await apply(base, await plan(base, `run-${state}-answer`, false));
    expect(await published(base)).toEqual([]);
    const table = (await base.drive.listAll(base.root)).find((f) => f.name === 'type-table.json' && f.parents.includes(base.own.id));
    if (!table) throw new Error('Missing fixture type table');
    const stored = JSON.parse(await base.drive.readText(table.id)) as { rows: Array<{ id: string }> };
    expect(stored.rows.some((row) => row.id === 'lease'), 'only settled consent installs the row').toBe(state === 'settled');
  }
  await base.drive.createText(base.inbox.id, 'Another lease.txt', 'Alex keeps a second garden lease.');
  const again = await plan(base, `run-${state}-2`);
  expect(offers(again), `${state} proposals stay suppressed`).toBe(false);
  await apply(base, again);
  expect(await published(base)).toEqual(state === 'presented' ? [question] : []);
  expect(await artifacts(base)).toEqual(frozen);
  expect(await base.drive.readText(frozen[0]?.id ?? '')).toBe(bytes);
});
