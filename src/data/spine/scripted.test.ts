import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { fakeScripted, planRun } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import type { AdmissionManifest } from './admission';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { scriptedDecisions, scriptedProvider } from '../demo/script';
import * as planner from './scripted';
import { runKeys, type Decisions, type PlanOptions, type RunPlan } from './scripted';
import { parseNote } from '../contracts/note-format';
import { BowerError } from '../types';
import { NOTE_TEMPLATES, type NoteTemplate } from '../contracts/note-templates';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-scripted';

// Every authored prose field enters the same production planner, including each template section.
const fix3Fields = (Object.keys(NOTE_TEMPLATES) as NoteTemplate[]).flatMap((template) =>
  ['summary', ...NOTE_TEMPLATES[template].sections].map((field) => ({ template, field })),
);

async function fix3Plan(template: NoteTemplate, field: string, target: 'missing' | 'note' | 'source') {
  const { drive, root, admitted } = await seeded();
  const resources = (await drive.listAll(root)).find((file) => file.folder && file.name === 'Resources');
  if (!resources) throw new Error('Expected Resources in the seeded folder');
  const gardening = await drive.createFolder(resources.id, 'Gardening');
  await drive.createText(gardening.id, 'Gardening.md', '# Gardening\n');
  const item = admitted.piles.flatMap((pile) => pile.items).find((candidate) => candidate.name !== 'Pile note.md');
  if (!item) throw new Error('Expected an admitted source');
  const name = target === 'missing' ? 'Imaginary note' : target === 'note' ? 'Gardening' : item.name;
  const summary = field === 'summary' ? `Alex follows [[${name}]].` : 'Alex follows [[Gardening]].';
  const body = NOTE_TEMPLATES[template].sections.map((heading) => {
    const words = heading === field ? `Alex follows [[${name}]].` : 'Alex grows mint.';
    return `## ${heading}\n${heading === 'Timeline' ? '- 10 Oct · ' : heading === 'Key points' ? '- ' : ''}${words}`;
  }).join('\n\n');
  const decisions: Decisions = { ...scriptedDecisions([], []), ownNote: () => null,
    thing: (seen) => ({ to: 'Resources/Gardening', name: seen.fileName }),
    pileAsk: () => null, thingAsk: () => null, merge: () => null,
    note: (fileId) => fileId === item.fileId ? { name: 'Garden source.md', summary, template, body } : null,
  };
  const before = await drive.snapshot();
  let plan: RunPlan | undefined;
  let failure: unknown;
  try {
    plan = await planner.planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN,
      requestId: admitted.id, requestedAt: admitted.at, taken: admitted, mintKey: await runKeys(RUN), decisions });
  } catch (error) { failure = error; }
  return { drive, before, plan, failure, name, item };
}

it.each(fix3Fields)('B6a fix 3: refuses a missing link in $template $field before effects with no manifest', async ({ template, field }) => {
  const { drive, before, plan, failure } = await fix3Plan(template, field, 'missing');
  expect.soft(failure, 'All authored fields must refuse unresolved links').toBeInstanceOf(BowerError);
  expect.soft(failure).toMatchObject({ message: planner.B_FAILURE });
  expect.soft(plan, 'Refusal returns no executable manifest').toBeUndefined();
  expect.soft(await drive.snapshot(), 'Refusal preserves every stored byte and file identity').toBe(before);
});

it('B6a fix 3: a grounded summary link still plans a Source', async () => {
  const { plan, failure, drive, before } = await fix3Plan('source', 'summary', 'note');
  expect(failure).toBeUndefined();
  const source = plan?.manifest.operations.map((operation) => operation.effect)
    .find((effect) => effect.kind === 'create-text' && effect.name === 'Garden source.md');
  expect(source).toBeDefined();
  if (source?.kind !== 'create-text') throw new Error('Expected the planned Source');
  expect(parseNote('Garden source.md', source.text).summary).toBe('Alex follows [[Gardening]].');
  expect(await drive.snapshot(), 'Planning alone has no effects').toBe(before);
});

it.each(['summary', 'Key points', 'Transcript'])('B6a fix 3: a link to the bound source in %s still plans', async (field) => {
  const { plan, failure, drive, before, name, item } = await fix3Plan('source', field, 'source');
  expect.soft(failure, 'The bound original is evidence even when it is not a note').toBeUndefined();
  const source = plan?.manifest.operations.map((operation) => operation.effect)
    .find((effect) => effect.kind === 'create-text' && effect.name === 'Garden source.md');
  expect.soft(source, 'A bound-source link must remain executable').toBeDefined();
  if (source?.kind === 'create-text') {
    expect(source.text).toContain(`[[${name}]]`);
    expect(plan?.manifest.operations.some((operation) => operation.effect.kind === 'move'
      && operation.effect.before.fileId === item.fileId)).toBe(true);
  }
  expect(await drive.snapshot(), 'Planning alone has no effects').toBe(before);
});

it('B6a fix 1: refuses an ungrounded authored link before effects even with a grounded Gardening hub', async () => {
  const { drive, root, admitted } = await seeded();
  const resources = (await drive.listAll(root)).find((file) => file.folder && file.name === 'Resources');
  expect(resources).toBeDefined();
  const gardening = await drive.createFolder(resources?.id ?? '', 'Gardening');
  await drive.createText(gardening.id, 'Gardening.md', '# Gardening\n');
  const item = admitted.piles.flatMap((pile) => pile.items).find((candidate) => candidate.name !== 'Pile note.md');
  expect(item).toBeDefined();
  if (!item) return;
  const before = await drive.listAll(root);
  expect(before.some((file) => file.name === 'Imaginary note.md')).toBe(false);
  const decisions: Decisions = { ...scriptedDecisions([], []), ownNote: () => null,
    thing: (seen) => ({ to: 'Resources/Gardening', name: seen.fileName }),
    pileAsk: () => null, thingAsk: () => null, merge: () => null,
    note: (fileId) => fileId === item.fileId ? {
      name: 'Garden source.md', summary: 'Alex records a stated gardening fact.', template: 'source',
      body: '## Summary\nAlex grows mint.\n\n## Key points\n- Alex grows mint.\n\n## Related\n[[Gardening]] and [[Imaginary note]]\n\n## Transcript\nAlex grows mint.',
    } : null,
  };
  let plan: RunPlan | undefined;
  let failure: unknown;
  try {
    plan = await planner.planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN,
      requestId: admitted.id, requestedAt: admitted.at, taken: admitted, mintKey: await runKeys(RUN), decisions });
  } catch (error) { failure = error; }
  expect.soft(failure, 'The production planner must refuse the ungrounded body').toBeInstanceOf(BowerError);
  expect.soft(failure).toMatchObject({ message: planner.B_FAILURE });
  expect.soft(plan, 'Refusal must return no executable manifest').toBeUndefined();
  expect(await drive.listAll(root), 'Planning refusal must create and change nothing').toEqual(before);
});

/** The demo's folder with its inbox, journal and Bower's files, the same every time (fixed clock, fixed ids). */
async function seeded(): Promise<{ drive: FakeDrive; root: string; admitted: AdmissionManifest }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'default', AT)) ?? '';
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'request-scripted' });
  if (admission.kind !== 'manifest') throw new Error(`nothing admitted: ${admission.cause}`);
  return { drive, root, admitted: admission.manifest };
}

it('B6a templates: b6-source-absent-url plans a Source with its original and no invented address', async () => {
  const { drive, root, admitted } = await seeded();
  const resources = (await drive.listAll(root)).find((file) => file.folder && file.name === 'Resources');
  const gardening = await drive.createFolder(resources?.id ?? '', 'Gardening');
  await drive.createText(gardening.id, 'Gardening.md', '# Gardening\n');
  const item = admitted.piles.flatMap((pile) => pile.items).find((candidate) => candidate.name !== 'Pile note.md');
  expect(item).toBeDefined();
  if (!item) return;
  const decisions: Decisions = { ...scriptedDecisions([], []), ownNote: () => null,
    thing: (seen) => ({ to: 'Resources/Gardening', name: seen.fileName }),
    pileAsk: () => null, thingAsk: () => null, merge: () => null,
    note: (fileId) => fileId === item.fileId ? {
      name: 'Garden source.md', summary: 'Alex records a stated gardening fact.', template: 'source',
      body: '## Summary\nAlex grows mint.\n\n## Key points\n- Alex grows mint.\n\n## Related\n[[Gardening]]\n\n## Transcript\nAlex grows mint.',
    } : null,
  };
  const plan = await planner.planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN,
    requestId: admitted.id, requestedAt: admitted.at, taken: admitted, mintKey: await runKeys(RUN), decisions });
  // Positive control: ordinary filing and the authored body have crossed the real planner.
  expect(plan.manifest.operations.some((op) => op.effect.kind === 'move' && op.effect.before.fileId === item.fileId)).toBe(true);
  const source = plan.manifest.operations.map((op) => op.effect)
    .find((effect) => effect.kind === 'create-text' && effect.name === 'Garden source.md');
  expect(source).toBeDefined();
  if (source?.kind !== 'create-text') return;
  expect(source.text).toContain('## Transcript\nAlex grows mint.');
  expect(source.text).not.toMatch(/^url:/m);
  expect(source.text).not.toMatch(/https?:\/\//);
  const original = plan.manifest.operations.map((op) => op.effect)
    .find((effect) => effect.kind === 'move' && effect.before.fileId === item.fileId);
  expect(original?.kind).toBe('move');
  if (original?.kind !== 'move') return;
  const note = parseNote('Garden source.md', source.text);
  expect(note.original, 'A generated Source must identify the filed original without inventing a url').toBe(original.name);
  expect(note.properties.find((p) => p.key === 'type')?.value).toBe('source');
  expect(note.timeline).toEqual([]);
});

describe('the scripted provider', () => {
  it('the scripted provider plans the same run as the fake runner', async () => {
    const { drive, root, admitted } = await seeded();
    // The fake runner plans from everything in the folder; the provider from the admitted set it took, whole.
    const fake = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: RUN, requestId: admitted.id, requestedAt: admitted.at, mintKey: await runKeys(RUN) });
    const provider = scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false });
    const planned = await provider({ taken: admitted, deferred: [] });
    expect(fake.manifest.operations.length).toBeGreaterThan(0);
    expect(planned).toEqual(fake.manifest);
    // Deterministic: the same folder and admitted set give the same plan, create keys included.
    expect(await provider({ taken: admitted, deferred: [] })).toEqual(planned);
  });

  it('plans only the piles it took: a pile that waits is not in the run', async () => {
    const { drive, root, admitted } = await seeded();
    const [waits, ...rest] = admitted.piles;
    expect(waits).toBeDefined();
    if (!waits) return;
    const provider = scriptedProvider(fakeScripted(drive), { rootId: root, runId: RUN, allowWeb: false });
    const planned = await provider({ taken: { ...admitted, piles: rest }, deferred: waits.items.map((i) => ({ fileId: i.fileId, pileId: waits.pileId, why: 'pile' as const })) });
    expect(planned.capture.piles.map((p) => p.pileId)).not.toContain(waits.pileId);
    const moved = new Set(planned.operations.flatMap((o) => (o.effect.kind === 'move' ? [o.effect.before.fileId] : [])));
    expect(waits.items.filter((i) => moved.has(i.fileId))).toEqual([]);
    expect(planned.capture.piles.length).toBe(rest.length);
  });

  // c3-planner-split: what each of your changes waits for is one map, record by record, and its archive follows it.
  it('one map from records to the operations they need', async () => {
    const { drive, root, admitted } = await seeded();
    // Your changes: a rule, a lookup request and an answer, each waiting on a write of its own.
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.addRule('anything from the dentist goes in health');
    await vault.addRequest('What council tax band is Flat 3?');
    await vault.answer('q1', true);
    const plan = await planRun(drive, root, { scope: 'all', allowWeb: true, runId: RUN, requestId: admitted.id, requestedAt: admitted.at, mintKey: await runKeys(RUN) });
    const m = plan.manifest;
    const ids = m.capture.journal.map((j) => j.recordId).sort();
    expect(ids.length).toBeGreaterThan(0);
    expect(Object.keys(plan)).toContain('needs');
    // One entry per record the run takes, none for anything else.
    expect([...plan.needs.keys()].sort()).toEqual(ids);
    // Some change waits on a write (a rule worded, a request answered, an answer's question dropped).
    expect([...plan.needs.values()].some((ops) => ops.length > 0)).toBe(true);
    for (const j of m.capture.journal) {
      const archive = m.operations.filter((o) => o.effect.kind === 'move' && j.fileIds.includes(o.effect.before.fileId));
      expect(archive.length).toBe(j.fileIds.length);
      // Each archive move waits for exactly what its record needs.
      for (const o of archive) expect([...o.dependsOn].sort()).toEqual([...(plan.needs.get(j.recordId) ?? [])].sort());
    }
  });

  // P4-45 m1: a rule waits for the Rules.md this run makes through the same one map, not a list of its own.
  it('a rule waits in the one map for the Rules.md it makes', async () => {
    const { drive, root, admitted } = await seeded();
    const rules = (await drive.listAll(root)).find((f) => !f.folder && f.name === 'Rules.md' && f.parents[0] === root);
    if (rules) await drive.trash(rules.id);
    const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
    await vault.addRule('anything from the dentist goes in health');
    const plan = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: RUN, requestId: admitted.id, requestedAt: admitted.at, mintKey: await runKeys(RUN) });
    const m = plan.manifest;
    const made = m.operations.find((o) => o.effect.kind === 'create-text' && o.effect.name === 'Rules.md');
    expect(made).toBeDefined();
    const rule = m.capture.journal.find((j) => m.reportPlan.some((c) => c.value.rulesWorded === 1 && c.requires.some((id) => m.operations.some((o) => o.operationId === id && o.effect.kind === 'move' && j.fileIds.includes(o.effect.before.fileId)))));
    expect(rule).toBeDefined();
    expect(plan.needs.get(rule?.recordId ?? '')).toContain(made?.operationId);
  });

  // c3-planner-split part 3 (contract 1): the plan is three steps. Capture reads the folder and never the reply;
  // decide reads the reply (one decisions type) and what it names; build makes the operations and the report from
  // what was decided, reading neither Drive nor the reply.
  it('the planner runs capture, decide and build as three steps', async () => {
    type Steps = {
      capture?: (drive: unknown, rootId: string, opts: PlanOptions) => Promise<unknown>;
      decide?: (drive: unknown, captured: unknown, opts: PlanOptions) => Promise<{ kind: string }>;
      build?: (decided: unknown) => Promise<{ kind: string; plan?: RunPlan }>;
    };
    const steps = planner as unknown as Steps;
    expect([typeof steps.capture, typeof steps.decide, typeof steps.build]).toEqual(['function', 'function', 'function']);
    const { capture, decide, build } = steps;
    if (!capture || !decide || !build) return;
    const { drive, root, admitted } = await seeded();
    const base = { scope: 'all' as const, allowWeb: false, runId: RUN, requestId: admitted.id, requestedAt: admitted.at, taken: admitted, mintKey: await runKeys(RUN) };
    // Every use of the reply, by the step that made it.
    let step = 'capture';
    const used: string[] = [];
    const reply = scriptedDecisions();
    const watched = new Proxy(reply, {
      get(target, key, receiver) {
        used.push(`${step}:${String(key)}`);
        return Reflect.get(target, key, receiver) as unknown;
      },
    }) as Decisions;
    const opts: PlanOptions = { ...base, decisions: watched };
    let reads = 0;
    const read = fakeScripted(drive);
    const counted = Object.fromEntries(Object.entries(read).map(([k, v]) => [k, typeof v === 'function' ? (...a: unknown[]) => { reads += 1; return (v as (...x: unknown[]) => unknown)(...a); } : v])) as typeof read;
    const captured = await capture(counted, root, opts);
    expect(reads).toBeGreaterThan(0);
    step = 'decide';
    const decided = await decide(counted, captured, opts);
    expect(decided.kind).toBe('decided');
    step = 'build';
    const before = reads;
    const built = await build(decided);
    expect(reads).toBe(before);
    expect(used.filter((u) => !u.startsWith('decide:'))).toEqual([]);
    expect(used.length).toBeGreaterThan(0);
    // The three steps give the very plan the planner gives.
    const whole = await planner.planScripted(fakeScripted(drive), root, { ...base, decisions: scriptedDecisions() });
    expect(built.kind).toBe('plan');
    expect(built.plan?.manifest).toEqual(whole.manifest);
  });
});


it('b5-landed-contract-compatibility: control grounded templates plan and invented links are refused', async () => {
  for (const target of ['note', 'source', 'missing'] as const) {
    const { plan, failure, drive, before } = await fix3Plan('source', 'summary', target);
    expect(await drive.snapshot()).toBe(before);
    if (target === 'missing') {
      expect(failure).toBeInstanceOf(BowerError); expect(plan).toBeUndefined();
    } else {
      expect(failure).toBeUndefined();
      expect(plan?.manifest.operations.some((op) => op.effect.kind === 'create-text' && op.effect.name === 'Garden source.md')).toBe(true);
    }
  }
});

it('b5-table-first-create-and-lenient-read: control planning a valid stored declaration changes no Drive bytes', async () => {
  const { drive, root, admitted } = await seeded();
  const own = (await drive.listAll(root)).find((f) => f.name === '.bower' && f.parents[0] === root);
  await drive.createText(own?.id ?? '', 'type-table.json', JSON.stringify({ v: 1, rows: [{
    id: 'offer', match: ['job offer'], template: 'source', properties: {}, table: [],
  }] }));
  const before = await drive.snapshot();
  const plan = await planRun(drive, root, { scope: 'all', allowWeb: false, runId: RUN,
    requestId: admitted.id, requestedAt: admitted.at, mintKey: await runKeys(RUN) });
  expect(plan.manifest.operations.length).toBeGreaterThan(0);
  expect(await drive.snapshot()).toBe(before);
});


// The provider seam carries typed facts; no parser, writer or consent mechanism is replaced in this fixture.
describe('b5-typed-property-bounds through planning', () => {
  const row = { id: 'offer', match: ['job offer'], template: 'source', properties: {
    role: { type: 'text' }, skills: { type: 'list' }, hours: { type: 'number' }, salary: { type: 'money' },
    posted: { type: 'date' }, stage: { type: 'enum', values: Array.from({ length: 20 }, (_, i) => `stage-${i}`) },
  }, table: ['role', 'salary', 'posted', 'stage'] };
  const valid = { role: 'x'.repeat(200), skills: Array.from({ length: 10 }, () => 'x'.repeat(200)), hours: 1e15,
    salary: { amount: 123.4567, currency: 'EUR' }, posted: '2024-02-29', stage: 'stage-19' };
  async function plan(values: Record<string, unknown>) {
    const { drive, root, admitted } = await seeded();
    const files = await drive.listAll(root);
    const own = files.find((f) => f.name === '.bower' && f.parents[0] === root);
    const resources = files.find((f) => f.name === 'Resources' && f.parents[0] === root);
    await drive.createText(own?.id ?? '', 'type-table.json', JSON.stringify({ v: 1, rows: [row] }));
    const folder = await drive.createFolder(resources?.id ?? '', 'Applications');
    await drive.createText(folder.id, 'Applications.md', '# Applications\nAlex considers offers.');
    const item = admitted.piles.flatMap((pile) => pile.items).find((candidate) => candidate.name !== 'Pile note.md');
    if (!item) throw new Error('Missing admitted source');
    const decisions: Decisions = { ...scriptedDecisions([], []), ownNote: () => null,
      thing: (seen) => ({ to: 'Resources/Applications', name: seen.fileName }),
      pileAsk: () => null, thingAsk: () => null, merge: () => null,
      note: (fileId) => fileId === item.fileId ? { name: 'Offer.md', template: 'source',
        typeRow: row.id, properties: values, summary: 'Alex considers a job offer.',
        body: '## Key points\nAlex considers a job offer. [[Applications]]',
      } : null,
    };
    const before = await drive.snapshot();
    let planned: RunPlan | undefined; let failure: unknown;
    try {
      planned = await planner.planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN,
        requestId: admitted.id, requestedAt: admitted.at, taken: admitted, mintKey: await runKeys(RUN), decisions });
    } catch (error) { failure = error; }
    expect(await drive.snapshot(), 'planning and refusal never mutate Drive').toBe(before);
    return { planned, failure };
  }
  it('control: all six bounded facts are admitted without rejecting a grounded Source', async () => {
    const { planned, failure } = await plan(valid);
    expect(failure).toBeUndefined();
    expect(planned?.manifest.operations.some((op) => op.effect.kind === 'create-text' && op.effect.name === 'Offer.md')).toBe(true);
  });
  it('retains all six valid declared values in the planned note', async () => {
    const { planned, failure } = await plan(valid);
    expect(failure).toBeUndefined();
    const effect = planned?.manifest.operations.find((op) => op.effect.kind === 'create-text' && op.effect.name === 'Offer.md')?.effect;
    expect(effect?.kind).toBe('create-text');
    if (effect?.kind !== 'create-text') throw new Error('No authored note');
    const keys = parseNote('Offer.md', effect.text).properties.map((property) => property.key);
    expect(keys).toEqual(expect.arrayContaining(Object.keys(valid)));
    for (const value of ['123.4567', 'EUR', '2024-02-29', 'stage-19', String(1e15)]) expect(effect.text).toContain(value);
    expect(effect.text.split('x'.repeat(200)).length - 1).toBe(11);
  });
  it.each([
    ['undeclared', { invented: 'Alex' }], ['text', { role: 'x'.repeat(201) }],
    ['list', { skills: Array.from({ length: 11 }, () => 'Alex') }], ['enum', { stage: 'stage-20' }],
    ['number', { hours: 1e15 + 1 }], ['money', { salary: { amount: 123.45678, currency: 'EUR' } }],
    ['currency', { salary: { amount: 48, currency: 'ZZZ' } }], ['date', { posted: '2026-02-29' }],
  ])('refuses invalid %s facts before producing executable effects', async (_label, invalid) => {
    const { planned, failure } = await plan({ ...valid, ...invalid });
    expect(failure).toBeInstanceOf(BowerError);
    expect(planned).toBeUndefined();
  });
});
