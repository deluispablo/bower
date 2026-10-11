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

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-scripted';

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
