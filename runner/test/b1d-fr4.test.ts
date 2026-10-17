/** TL-P4-41 addendum 21: seven independent reds through corpus -> runner main. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { md5Hex } from '../../src/data/contracts/hashes';
import { stateMark } from '../../src/data/contracts/note-edit';
import { normalizeModelInput } from '../src/model-input';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { candidates, completed, empty, fileIntent, folder, HUB, manifest, media, note,
  run, seedState, select, setup, type Base } from './b1-planning-support';

const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

const words = [{ line: 'Remote developer offer', files: [] }];
const sourceId = (b: Base) => b.sources[0]?.itemId ?? '';
const evidence = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [
  `Projects/Remote search/Offer evidence ${i + 1}.md`, note('Remote developer offer evidence.', `EVIDENCE_${i + 1}\n`),
]));

async function answerBase(options: Parameters<typeof setup>[0] = {}) {
  const b = await setup(options);
  for (const pile of b.admission.piles) {
    expect(pile.anchor).not.toBeNull();
    await b.drive.trash(pile.anchor?.fileId ?? '');
  }
  b.c.inbox = [];
  b.c.scope = 'instructions';
  return b;
}

async function admitAnswers(b: Base, question: Record<string, unknown>, count: number) {
  const questions = await b.drive.get(b.id(SYSTEM.questions));
  await b.drive.writeText(questions.id, JSON.stringify({ v: 1, questions: [question] }), questions.modifiedTime);
  const ids: string[] = [];
  for (let n = 0; n < count; n++) {
    const id = `answer-${n}`;
    const answer = await b.drive.createText(b.id(SYSTEM.changes), `${id}.json`, JSON.stringify({
      v: 1, id, device: 'device-1', kind: 'answer', questionId: question.id,
      askedAt: question.askedAt, at: AT - count + n, what: 'Answered a question', text: 'yes',
    }));
    ids.push(answer.id);
  }
  const admitted = await planAdmission(fakeRead(b.drive), b.root, {
    scope: 'instructions', clock: () => AT, newId: () => 'fr4-answer-admission',
  });
  expect(admitted.kind).toBe('manifest');
  if (admitted.kind !== 'manifest') throw new Error('Expected answer admission.');
  expect(admitted.manifest.journal).toHaveLength(count);
  return { admission: admitted.manifest, ids };
}

it('b1d-fr4 1 shown candidates bound notes and parents', async () => {
  const good = await setup(); await seedState(good);
  const control = await run(good, [select(good, [good.id(HUB)]), fileIntent(good)]);
  completed(control);
  expect(candidates(control.frames[0], sourceId(good))).toContain(good.id(HUB));
  const child = await setup(); await seedState(child);
  const proposal = select(child, [child.id(HUB)]);
  proposal.items = proposal.items.map((item) => ({ ...item,
    destination: { parentId: child.id('Projects/Remote search'), name: 'Developer offers' } }));
  const childControl = await run(child, [proposal, fileIntent(child, 'Projects/Remote search/Developer offers')]);
  completed(childControl);
  expect(candidates(childControl.frames[0], sourceId(child))).toContain(child.id('Projects/Remote search'));

  const unrelated = 'Resources/Gardening/Garden plans.md';
  const b = await setup({ inbox: words }); await seedState(b);
  const bad = select(b, [b.id(unrelated)]);
  const r = await run(b, [bad, empty]);
  expect(candidates(r.frames[0], sourceId(b))).not.toContain(b.id(unrelated));
  expect(r.frames[0]?.value.indexed).toHaveProperty(b.id(unrelated));
  expect.soft(r.code, 'an indexed but unshown note cannot authorize execution').toBe(1);
  expect.soft(media(r, b.id(unrelated)), 'unshown evidence receives no full read').toHaveLength(0);

  const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [
    `Projects/Remote search/Offer ${i}.md`, note('Remote developer offer evidence.'),
  ]));
  const cap = await setup({ folder: { ...folder, ...many }, inbox: words }); await seedState(cap);
  const capped = select(cap);
  capped.items = capped.items.map((item) => ({ ...item,
    destination: { parentId: cap.id('Resources/Gardening'), name: 'Developer offers' } }));
  const cappedRun = await run(cap, [capped, empty]);
  // c12-map: 31 matches give 12 notes, so every shown note's folder fits; a folder no shown note sits in stays unseen.
  expect(candidates(cappedRun.frames[0], sourceId(cap)).filter((id) => (cap.ix.pathOf(id) ?? '').endsWith('.md'))).toHaveLength(12);
  expect(candidates(cappedRun.frames[0], sourceId(cap))).not.toContain(cap.id('Resources/Gardening'));
  expect.soft(cappedRun.code, 'a parent no shown note sits in is not visible').toBe(1);
});

it('b1d-fr4 2 destination hub counts within five', async () => {
  for (const count of [4, 5]) {
    const b = await setup({ folder: { ...folder, ...evidence }, inbox: words }); await seedState(b);
    const wants = Object.keys(evidence).slice(0, count).map(b.id);
    const r = await run(b, [select(b, wants), empty]);
    for (const id of wants) expect(candidates(r.frames[0], sourceId(b))).toContain(id);
    if (count === 4) {
      expect(r.code, 'four wants plus the hub is the five-note positive control').toBe(0);
      expect(r.frames).toHaveLength(2);
      for (const id of [...wants, b.id(HUB)]) expect(media(r, id)).toHaveLength(1);
    } else {
      expect.soft(r.code, 'five wants excluding the hub cannot authorize a sixth read').toBe(1);
      expect.soft(r.frames[1]?.value.selection, 'refusal retries selection rather than starting execution').toBeUndefined();
      for (const id of [...wants, b.id(HUB)]) expect.soft(media(r, id)).toHaveLength(0);
    }
  }
});

it('b1d-fr4 3 empty selection grants no keep or Bin', async () => {
  const a = 'Projects/Remote search/A.md'; const other = 'Projects/Remote search/B.md';
  for (const selected of [true, false]) {
    const b = await answerBase({ folder: { ...folder,
      [a]: note('Remote developer offer.', '## Timeline\n- Alex received an offer.\n', true),
      [other]: note('Remote developer offer.', '## Timeline\n- Alex checked the terms.\n', true),
    } });
    const pair = `q-pair-${[b.id(a), b.id(other)].sort().join('.')}`;
    const admitted = await admitAnswers(b, { id: pair, text: 'Keep one note?',
      yes: 'Yes, keep one', no: 'No, keep both', about: a, askedAt: AT - 2 }, 1);
    await seedState(b);
    const selection = { items: selected ? [{ itemId: admitted.ids[0], kind: 'unknown',
      destination: b.id('Projects/Remote search'), wants: [b.id(a), b.id(other)] }] : [], asks: [] };
    const keep = { ...empty, keep: [{ kept: a, other }] };
    const r = await run(b, [selection, keep, keep], { admission: admitted.admission });
    if (selected) {
      expect(r.code, 'selected pair with an admitted yes merges in the positive control').toBe(0);
      expect(r.after[a]).toContain('Alex checked the terms.');
      expect(r.after[other]).toBeUndefined();
      expect(manifest(r).operations.some((op) => op.effect.kind === 'bin')).toBe(true);
    } else {
      expect.soft(r.after[a], 'empty selection cannot keep by editing the first note').toBe(b.c.folder[a]);
      expect.soft(r.after[other], 'empty selection cannot Bin the second note').toBe(b.c.folder[other]);
      expect.soft(manifest(r).operations.filter((op) => ['edit-text', 'bin'].includes(op.effect.kind))).toEqual([]);
    }
  }
});

it('b1d-fr4 4 no-model answers share the 200-operation ledger', async () => {
  for (const count of [1, 201]) {
    const person = ['Alex is checking the terms.'];
    const hub = note('Remote developer offers.',
      `## Current state\n- ${person[0]}\n\n## Timeline\n`, true)
      .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['Alex was waiting for an offer.'])}\n`);
    const b = await answerBase({ folder: { ...folder, [HUB]: hub } });
    const original = b.c.folder[HUB] ?? '';
    const admitted = await admitAnswers(b, { id: `q-state-${b.id(HUB)}`, about: HUB,
      text: 'Write this update?', yes: 'Write it', no: 'Keep mine', askedAt: AT - 300,
      state: stateMark(person), shown: { lines: ['Alex received a remote developer offer.'],
        md5: md5Hex(new TextEncoder().encode(original)) },
    }, count);
    await seedState(b);
    const before = await Promise.all(admitted.ids.map((id) => b.drive.evidence(id)));
    const r = await run(b, [empty], { admission: admitted.admission });
    expect(r.frames, 'stored shown-state answers require no model').toHaveLength(0);
    if (count === 1) {
      expect(r.code).toBe(0);
      expect(r.after[HUB]).toContain('- Alex received a remote developer offer.');
      expect(manifest(r).operations.length).toBeGreaterThan(0);
      expect(manifest(r).operations.length).toBeLessThanOrEqual(200);
      expect(b.drive.pathOf(admitted.ids[0] ?? '', b.root)).toContain('/archive/');
    } else {
      expect.soft(manifest(r).operations.length, 'an answer-only manifest cannot exceed 200 operations').toBeLessThanOrEqual(200);
      expect.soft(r.after[HUB], 'ledger exhaustion leaves the target untouched').toBe(original);
      const after = await Promise.all(admitted.ids.map((id) => b.drive.evidence(id)));
      expect.soft(after.filter((value, i) => JSON.stringify(value) !== JSON.stringify(before[i])).length,
        'all 201 admitted answer records retain their read evidence').toBe(0);
      expect.soft(admitted.ids.filter((id, i) => b.drive.pathOf(id, b.root) !== `${SYSTEM.changes}/answer-${i}.json`).length,
        'records remain unconsumed in changes').toBe(0);
    }
  }
}, 30_000);

it('b1d-fr4 5 real link changes alter the fingerprint', async () => {
  const linkNote = 'Projects/Remote search/Offer.md';
  const distractors = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [
    `Archive/Topic ${i}/Topic ${i}.md`, note('Unrelated background. ' + 'Background details. '.repeat(12)),
  ]));
  const fingerprints: string[] = []; const inputs: string[] = [];
  for (const [i, link] of ['Garden', 'Garden', 'Garden2'].entries()) {
    const b = await setup({ folder: { ...folder, ...distractors,
      [linkNote]: note('Remote developer offer.', `[[${link}]]\n`),
      'Resources/Gardening/Garden.md': '---\nsummary: Plants and herbs.\ntype: moc\n---\n\nGarden contents.\n',
      'Resources/Gardening/Garden2.md': '---\nsummary: Plants and herbs.\ntype: moc\n---\n\nGarden contents.\n',
    }, inbox: words }); await seedState(b);
    b.admission.id = `fr4-fingerprint-${i}`;
    const r = await run(b, [{ items: [], asks: [] }, empty], { press: i + 1 });
    expect(r.code).toBe(0);
    const first = r.frames[0]; expect(first?.prompt).toContain('index cut:');
    const target = b.id(`Resources/Gardening/${link}.md`);
    expect(candidates(first, sourceId(b))).toContain(target);
    const sources = first?.value.sources as Array<{ candidates: Array<Record<string, unknown>> }>;
    expect(sources[0]?.candidates.find((row) => row.id === target)).toEqual({ id: target });
    inputs.push(first?.prompt ?? '');
    const timing = r.consoleLines.find((line) => line.startsWith('timing:')) ?? '';
    const fingerprint = /\binput=([a-f0-9]{12})\b/.exec(timing)?.[1];
    expect(fingerprint).toBeDefined(); fingerprints.push(fingerprint ?? '');
  }
  expect(fingerprints[1], 'same content with fresh run/admission ids has the same fingerprint').toBe(fingerprints[0]);
  expect(inputs[1], 'positive control uses different actual run/admission ids').not.toBe(inputs[0]);
  expect(normalizeModelInput(inputs[1] ?? '')).toBe(normalizeModelInput(inputs[0] ?? ''));
  expect.soft(fingerprints[2], 'changing the actual one-link neighbour must change the fingerprint').not.toBe(fingerprints[0]);
});

it('b1d-fr4 6 near names collapse internal whitespace', async () => {
  for (const name of ['Developer applications', 'Developer  offers']) {
    const b = await setup({ folder: { ...folder,
      'Projects/Remote search/Developer offers/Developer offers.md': note('Applications and terms.'),
    } }); await seedState(b);
    const selection = select(b, [b.id(HUB)]);
    selection.items = selection.items.map((item) => ({ ...item,
      destination: { parentId: b.id('Projects/Remote search'), name } }));
    const r = await run(b, [selection, fileIntent(b, `Projects/Remote search/${name}`)]);
    expect(candidates(r.frames[0], sourceId(b))).toContain(b.id('Projects/Remote search'));
    if (name === 'Developer applications') completed(r);
    else {
      expect.soft(r.code, 'collapsed-whitespace sibling name must be refused').toBe(1);
      expect.soft(Object.values(r.pathsById)).not.toContain(`Projects/Remote search/${name}`);
    }
  }
});

it('b1d-fr4 7 neighbourhood includes the prefix typed MOC', async () => {
  for (const name of ['Remote search.md', 'Contents.md']) {
    const map = `Projects/Remote search/${name}`;
    const b = await setup({ folder: {
      'Projects/Remote search/Offer.md': note('Remote developer offer.'),
      [map]: '---\nsummary: Contents of this folder.\ntype: moc\n---\n\n## Overview\nFolder contents.\n',
    }, inbox: words });
    // Cold main must discover type from the prefix; no fixture-supplied retrieval metadata.
    const r = await run(b, [{ items: [], asks: [] }, empty]);
    expect(r.code).toBe(0);
    expect(candidates(r.frames[0], sourceId(b))).toContain(b.id('Projects/Remote search/Offer.md'));
    if (name === 'Remote search.md') expect(candidates(r.frames[0], sourceId(b))).toContain(b.id(map));
    else expect.soft(candidates(r.frames[0], sourceId(b)), 'folder MOC is found by parsed type, independent of title').toContain(b.id(map));
    expect(r.traffic.some((t) => t.range && t.url.pathname.endsWith(`/${b.id(map)}`)), 'MOC metadata comes from a prefix read').toBe(true);
  }
});
