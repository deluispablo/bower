/** TL-P4-41 addendum 22: five independent assertion reds through the real runner main. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM, type RetrievalFile } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { paging } from './drive-v3';
import { candidates, empty, fileIntent, folder, HUB, media, note, report,
  run, seedState, select, setup, type Base } from './b1-planning-support';

const pageSize = paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

type Result = Awaited<ReturnType<typeof run>>;
const sourceId = (b: Base) => b.sources[0]?.itemId ?? '';
function runReplies(b: Base, selection: unknown, intent: unknown, options: Parameters<typeof run>[2] = {}) {
  const replies: unknown[] = [];
  return run(b, replies, { ...options, beforeReply: async (turn, frame) => {
    // Retry exactly the same valid fixture for that semantic phase.
    replies[turn - 1] = frame.value.selection === undefined ? selection : intent;
  } });
}
function done(r: Result) {
  expect(r.code, r.errors).toBe(0);
  expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(r.frames, 'selection and execution both accepted without a retry').toHaveLength(2);
}

/** Valid complete ownership bytes; the long personal region alone straddles the prefix boundary. */
function mapText(summary: string, size = 967, members = '') {
  const spans: Record<string, string> = { current: '', personal: 'PERSONAL_PADDING\n', timeline: '', 'bower-note': '',
    'moc-overview': '## Overview\nA collection.\n', 'moc-figures': '## Figures\n0 notes.\n',
    'moc-members': `## Notes\n${members}` };
  const text = '---\nsummary: ' + summary + '\ntype: moc\nby: bower\nbower_format: ownership/2\n---\n\n'
    + Object.entries(spans).map(([owner, body]) =>
      `<!-- bower:ownership/2 begin ${owner} -->\n${body}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');
  const padded = text.replace('PERSONAL_PADDING', 'x'.repeat(size - Buffer.byteLength(text) + 'PERSONAL_PADDING'.length));
  expect(Buffer.byteLength(padded)).toBe(size);
  expect(parseOwnership(new TextEncoder().encode(padded)).status).toBe('v2');
  return padded;
}

it('b1d-fr5 1 crossing MOC prefix', async () => {
  const map = 'Resources/Collection/Collection.md';
  const small = await setup({ folder: { ...folder, [map]: mapText('Remote developer offers.') } });
  const control = await runReplies(small, select(small, [small.id(map)]), fileIntent(small));
  done(control);
  expect(report(control).filed).toHaveLength(1);
  expect(media(control, small.id(map))).toHaveLength(1);

  for (const role of ['candidate', 'target', 'unrelated'] as const) {
    const text = mapText(role === 'unrelated' ? 'Ceramic glazing.' : 'Remote developer offers.', 5287);
    expect(parseOwnership(new TextEncoder().encode(text.slice(0, 4096))).status).toBe('invalid');
    const b = await setup({ folder: { ...folder, [map]: text } });
    const id = b.id(map);
    const r = await runReplies(b, select(b, role === 'target' ? [id] : [b.id(HUB)]), fileIntent(b));
    expect.soft(r.code, `${role}: a valid 5,287-byte MOC never fails main`).toBe(0);
    expect.soft(r.wire?.statuses.at(-1)?.phase, `${role}: reaches done`).toBe('done');
    expect.soft(r.frames, `${role}: both model replies are accepted`).toHaveLength(2);
    expect.soft(report(r).filed, `${role}: the offer is filed`).toHaveLength(1);
    const skips = r.consoleLines.filter((line) => !line.startsWith('timing:')
      && /skip|left out|omit/i.test(line) && /MOC|map|Collection|prefix/i.test(line));
    if (role === 'unrelated') {
      expect.soft(media(r, id), 'the planner never reads an unrelated crossing MOC in full; only lint\'s one maintenance read (AC20) may').toHaveLength(1);
      expect.soft(skips, 'one console line explains the skipped MOC').toHaveLength(1);
      expect.soft(r.after[map], 'skipping leaves the complete owned note intact').toBe(text);
    } else {
      expect.soft(candidates(r.frames[0], sourceId(b)), `${role}: MOC remains selectable`).toContain(id);
      expect.soft(media(r, id), `${role}: planning and maintain reuse one full cached read`).toHaveLength(1);
      expect.soft(skips, `${role}: a needed MOC is not skipped`).toHaveLength(0);
    }
  }
});

it('b1d-fr5 2 maintenance exhaustion after effects', async () => {
  for (const count of [139, 140]) {
    const archive = Object.fromEntries(Array.from({ length: count }, (_, i) =>
      [`Archive/Record ${i}.md`, note('Unrelated background.', 'Archive evidence.\n')]));
    const b = await setup({ folder: { ...folder, ...archive } });
    const r = await runReplies(b, select(b, [b.id(HUB)]), fileIntent(b));
    expect(r.frames, 'both replies are valid even at the maintenance boundary').toHaveLength(2);
    expect(r.frames[1]?.value.selection).toBeDefined();
    expect(r.pathsById[sourceId(b)], 'primary move already landed').toBe('Projects/Remote search/Offer.txt');
    expect(r.after['Projects/Remote search/Offer.txt']).toBe(b.c.inboxFiles['Offer.txt']);
    if (count === 139) {
      done(r);
      expect(report(r).filed).toHaveLength(1);
      expect(r.after[SYSTEM.index]).toContain('Offer');
      expect(r.after[SYSTEM.hot]).toContain('Filed');
      expect(r.after[SYSTEM.retrieval]).toBeDefined();
      continue;
    }
    // Cold previous state is absence. A target not sent must not be created or advanced.
    for (const path of [SYSTEM.index, SYSTEM.hot, SYSTEM.retrieval]) {
      const sent = r.events.some((event) => event.path === path && ['POST', 'PATCH'].includes(event.method));
      if (!sent) expect(r.after[path], `${path}: unreached state stays absent`).toBeUndefined();
    }
    expect(r.after[SYSTEM.retrieval], 'the exhausted cursor commit has not advanced').toBeUndefined();
    expect.soft(r.code, 'maintenance exhaustion after applied effects still succeeds').toBe(0);
    expect.soft(r.wire?.statuses.at(-1)?.phase, 'maintenance exhaustion ends done, never saving').toBe('done');
    expect.soft(report(r).filed, 'the completed report retains the applied primary effect').toHaveLength(1);

    await b.drive.createText(b.id(SYSTEM.changes), 'catch-up.json', JSON.stringify({
      v: 1, id: 'catch-up', device: 'device-1', kind: 'request', at: AT + 1,
      what: 'Asked Bower to update the notes', text: 'Update these notes.',
    }));
    const admitted = await planAdmission(fakeRead(b.drive), b.root, {
      scope: 'instructions', clock: () => AT + 1, newId: () => 'fr5-catch-up',
    });
    expect(admitted.kind).toBe('manifest');
    if (admitted.kind !== 'manifest') throw new Error('Expected catch-up admission.');
    const next = await runReplies(b, { items: [], asks: [] }, empty, { admission: admitted.manifest, press: 2 });
    expect.soft(next.code, 'next main catches up without replaying the already filed offer').toBe(0);
    expect.soft(next.wire?.statuses.at(-1)?.phase).toBe('done');
    expect.soft(next.pathsById[sourceId(b)]).toBe('Projects/Remote search/Offer.txt');
    expect.soft(next.after[SYSTEM.index]).toContain('Offer');
    expect.soft(next.after[SYSTEM.hot]).toBeDefined();
    const state = JSON.parse(next.after[SYSTEM.retrieval] ?? 'null') as RetrievalFile | null;
    expect.soft(state?.cursor, 'catch-up finally commits the feed cursor').toBeTypeOf('string');
    expect.soft(Object.values(state?.files ?? {}).map((entry) => entry.path)).toContain('Projects/Remote search/Offer.md');
    expect.soft(Object.values(state?.files ?? {}).filter((entry) => entry.path.startsWith('Archive/'))).toHaveLength(140);
  }
});

async function pairs(count: number) {
  const paths = Array.from({ length: count }, (_, i) => ({
    kept: `Resources/Pair ${i}/Alpha.md`, other: `Resources/Pair ${i}/Beta.md`,
  }));
  const b = await setup({ inbox: [{ line: 'Answer the questions.', files: [] }], folder: {
    ...folder, ...Object.fromEntries(paths.flatMap(({ kept, other }, i) => [
      [kept, note('Independent evidence.', `## Timeline\n- Alex kept detail ${i}.\n`, true)],
      [other, note('Independent evidence.', `## Timeline\n- Alex added detail ${i}.\n`, true)],
    ])),
  } });
  for (const pile of b.admission.piles) await b.drive.trash(pile.anchor?.fileId ?? '');
  b.c.inbox = []; b.c.scope = 'instructions';
  const questions = paths.map(({ kept, other }, i) => ({
    id: `q-pair-${[b.id(kept), b.id(other)].sort().join('.')}`, text: 'Keep one note?',
    yes: 'Yes, keep one', no: 'No, keep both', about: kept, askedAt: AT - 10 + i,
  }));
  const q = await b.drive.get(b.id(SYSTEM.questions));
  await b.drive.writeText(q.id, JSON.stringify({ v: 1, questions }), q.modifiedTime);
  const items = [];
  for (const [i, question] of questions.entries()) {
    const answer = await b.drive.createText(b.id(SYSTEM.changes), `answer-${i}.json`, JSON.stringify({
      v: 1, id: `answer-${i}`, device: 'device-1', kind: 'answer', questionId: question.id,
      askedAt: question.askedAt, at: AT - 3 + i, what: 'Answered a question', text: 'yes',
    }));
    const pair = paths[i];
    if (!pair) throw new Error('Expected pair fixture.');
    items.push({ itemId: answer.id, kind: 'unknown', destination: b.id(`Resources/Pair ${i}`),
      wants: [b.id(pair.kept), b.id(pair.other)] });
  }
  const admitted = await planAdmission(fakeRead(b.drive), b.root, {
    scope: 'instructions', clock: () => AT, newId: () => 'fr5-pairs',
  });
  expect(admitted.kind).toBe('manifest');
  if (admitted.kind !== 'manifest') throw new Error('Expected answer admission.');
  expect(admitted.manifest.journal).toHaveLength(count);
  await seedState(b);
  return { b, paths, items, admission: admitted.manifest };
}

it('b1d-fr5 3 answer pins belong to each source', async () => {
  for (const count of [1, 3]) {
    const { b, paths, items, admission } = await pairs(count);
    expect(new Set(items.flatMap((item) => item.wants)).size).toBe(count * 2);
    for (const item of items) expect(item.wants).toHaveLength(2);
    const selection = { items, asks: [] };
    const intent = { ...empty, keep: paths };
    const r = await runReplies(b, selection, intent, { admission });
    if (count === 1) done(r);
    else {
      expect.soft(r.code, 'three independent two-note pins each fit their own five').toBe(0);
      expect.soft(r.wire?.statuses.at(-1)?.phase).toBe('done');
      expect.soft(r.frames[1]?.value.selection, 'independent answers reach execution without retry').toEqual(selection);
    }
    for (const [i, pair] of paths.entries()) {
      expect.soft(r.after[pair.kept], 'the admitted yes merges its own pair').toContain(`Alex added detail ${i}.`);
      expect.soft(r.after[pair.other], 'the merged second note is in the Bin').toBeUndefined();
    }
  }
});

/** Look for an actual membership expansion, not the unrelated global indexed row. */
function hasMember(value: unknown, id: string, key = ''): boolean {
  if (Array.isArray(value)) return (/member|expand/i.test(key) && value.some((row: unknown) => {
    if (row === id) return true;
    if (!row || typeof row !== 'object') return false;
    const member = row as Record<string, unknown>;
    return [member.id, member.fileId, member.noteId].includes(id);
  })) || value.some((row: unknown) => hasMember(row, id, key));
  return !!value && typeof value === 'object'
    && Object.entries(value).some(([name, row]) => hasMember(row, id, name));
}

it('b1d-fr5 4 refreshed MOC members are selectable', async () => {
  const map = 'Resources/Collection/Collection.md'; const record = 'Resources/Collection/Record.md';
  for (const linked of [true, false]) {
    const b = await setup({ folder: { ...folder,
      [map]: mapText('Remote developer offers.', 967, linked ? '- [[Record]]\n' : ''),
      ...(linked ? { [record]: note('Ceramic glazing.', 'MEMBER_EVIDENCE\n') } : {}),
    } });
    const state = await seedState(b);
    expect(state.files[b.id(map)]?.members).toEqual(linked ? [b.id(record)] : []);
    const recordId = linked ? b.id(record) : (await b.drive.createText(b.id('Resources/Collection'),
      'Record.md', note('Ceramic glazing.', 'MEMBER_EVIDENCE\n'))).id;
    if (!linked) expect(await b.drive.readText(b.id(map))).not.toContain('[[Record]]');
    const wants = [b.id(map), recordId];
    const r = await runReplies(b, select(b, wants, 'Resources/Collection'), fileIntent(b, 'Resources/Collection'));
    if (linked) {
      done(r);
      expect(candidates(r.frames[0], sourceId(b))).toContain(recordId);
      expect(media(r, recordId)).toHaveLength(1);
    } else {
      expect(candidates(r.frames[0], sourceId(b)), 'the MOC itself matches without a stored member link').toContain(b.id(map));
      expect((r.frames[0]?.value.map as Array<{ id: string; hub?: { id: string } }>).find((row) => row.hub?.id === b.id(map))?.id,
        'the folder map names the map as the hub of its folder').toBe(b.id('Resources/Collection'));
      expect.soft(r.code, 'refreshed membership authorizes the selected member').toBe(0);
      expect.soft(r.wire?.statuses.at(-1)?.phase).toBe('done');
      for (const [turn, frame] of r.frames.entries()) {
        expect.soft(hasMember(frame.value, recordId), `call ${turn + 1} shows refreshed membership`).toBe(true);
      }
      expect.soft(r.frames[1]?.value.selection, 'the second call executes the member selection').toBeDefined();
      expect.soft(r.frames[1]?.call.input, 'selected member evidence reaches execution').toContain('MEMBER_EVIDENCE');
      expect.soft(media(r, recordId), 'one full member read through the cache').toHaveLength(1);
      expect.soft(report(r).filed).toHaveLength(1);
    }
  }
});

it('b1d-fr5 5 heading links resolve candidates', async () => {
  const garden = 'Resources/Gardening/Garden.md';
  for (const link of ['Garden', 'Garden#Soil']) {
    const b = await setup({ folder: { ...folder,
      'Projects/Remote search/Terms.md': note('Remote developer offer.', `[[${link}]]\n`),
      [garden]: note('Ceramic glazing.', 'GARDEN_EVIDENCE\n'),
    } });
    await seedState(b);
    const r = await runReplies(b, select(b, [b.id(garden)]), fileIntent(b));
    if (link === 'Garden') done(r);
    expect.soft(candidates(r.frames[0], sourceId(b)), `${link}: one-hop target is a listed candidate`).toContain(b.id(garden));
    expect.soft(r.code, `${link}: the normalized heading target is selectable`).toBe(0);
    expect.soft(r.wire?.statuses.at(-1)?.phase).toBe('done');
    expect.soft(r.frames[1]?.value.selection, 'valid candidate reaches execution').toBeDefined();
    expect.soft(r.frames[1]?.call.input).toContain('GARDEN_EVIDENCE');
    expect.soft(media(r, b.id(garden))).toHaveLength(1);
    expect.soft(report(r).filed).toHaveLength(1);
  }
});
