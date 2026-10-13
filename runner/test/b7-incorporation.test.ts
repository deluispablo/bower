/** B7 reds use the production main/provider/planner/adapter, with B1d selection by real candidate ids. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote, serializeNote, type NoteFile } from '../../src/data/contracts/note-format';
import type { RunManifest } from '../../src/data/spine/records';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { isRunnerFile, RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import { outsideAdmitted } from '../src/spine/admitted';
import { loadCase } from '../src/corpus';
import { AT, redispatchCase, runOnDrive, type CaseRun } from './corpus-run';
import { manifests, observe, writes, type Observation } from './b23-hot-observe';
import { completed, failedReply, reply, report, run, select, setup, type Base } from './b1-planning-support';
import { paging } from './drive-v3';

const TAGS = '.bower/tags.json';
const DEST = 'Resources/Gardening';
const KNOWN = ['gardening', 'remote-work', 'learning'];
const pageSize = paging.size;
const readable = isRunnerFile as (path: string, value: unknown) => boolean;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = pageSize; });

async function fixture(slug = 'reuse-known', options: { vocabulary?: string[] | null; raw?: string; words?: string } = {}) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b7-' + slug));
  if (options.vocabulary === null) delete c.folder['.bower/tags.json'];
  else if (options.vocabulary) c.folder[TAGS] = JSON.stringify({ v: 1, tags: options.vocabulary }) + '\n';
  if (options.raw !== undefined) c.folder[TAGS] = options.raw;
  if (options.words !== undefined) for (const pile of c.inbox) pile.line = options.words;
  // Seeding and admission stay in the existing B1 test support; no production fixtures are consulted by main.
  const b = await setup({ folder: c.folder, inbox: c.inbox, inboxFiles: c.inboxFiles });
  b.c = { ...c, presses: undefined, between: undefined };
  return b;
}

function intent(b: Base, tags?: string[]) {
  return { kind: 'tidy-intent', v: 1, things: b.sources.filter((s) => s.name).map((s) => ({
    fileId: s.itemId, to: DEST, name: s.name,
    ...(!s.name.endsWith('.md') ? { note: { name: s.name.replace(/\.[^.]+$/, '.md'),
      summary: 'Alex keeps a gardening reference.', body: b.c.inboxFiles[s.name]?.trim() ?? 'Alex grows herbs.',
      ...(tags === undefined ? {} : { tags }) } } : {}),
  })) };
}
const pathOfNote = (b: Base): string => DEST + '/' + (b.sources.find((s) => !s.name.endsWith('.md'))?.name ?? '').replace(/\.[^.]+$/, '.md');
const vocabulary = (r: CaseRun): string[] => (JSON.parse(r.after[TAGS] ?? '{"tags":[]}') as { tags: string[] }).tags;
const tagged = (r: CaseRun, path: string): string[] => parseNote(path, r.after[path] ?? '').tags;
const mutations = (r: Awaited<ReturnType<typeof run>>) => writes(r.events, TAGS);
const frozen = (r: CaseRun): RunManifest => JSON.parse(manifests(r)[0]?.[1] ?? '{"operations":[]}') as RunManifest;

async function control(b: Base) {
  const r = await run(b, [select(b, [], DEST), intent(b)]);
  completed(r, b.sources.filter((s) => s.name).length);
  expect(tagged(r, pathOfNote(b))).toEqual([]);
  expect(mutations(r)).toEqual([]);
  return r;
}
async function withTags(b: Base, tags: string[]) {
  // Existing validation retry is the positive control: today's missing extension can still file safely, untagged.
  return run(b, [select(b, [], DEST), intent(b, tags), intent(b)]);
}
function growthEffect(r: CaseRun) {
  const effect = frozen(r).operations.find((op) => op.effect.kind === 'write-runner-json' && String(op.effect.path) === TAGS
    || op.effect.kind === 'create-text' && op.effect.name === 'tags.json');
  expect(effect, 'automatic additions must be frozen in the existing planning manifest').toBeDefined();
  if (!effect) throw new Error('B7 vocabulary planning effect is missing.');
  return effect;
}
function noProposals(r: CaseRun) {
  expect(report(r).questions).toEqual([]);
  expect(Object.keys(r.after).filter((p) => p.startsWith('.bower/proposals/'))).toEqual([]);
}

describe('B7 through production main', () => {
  it.each(['reuse-known', 'proposal-yes', 'proposal-budget', 'authority-full-cap'])('%s untagged positive control', async (slug) => {
    await control(await fixture(slug));
  });

  it.each(['{not json}\n', '{"v":2,"tags":["gardening"]}\n', '{"v":1,"tags":"gardening"}\n'])(
    'b7-list-strict-write-lenient-read invalid %j through main', async (raw) => {
      const b = await fixture('reuse-known', { raw });
      const r = await control(b);
      expect(r.after[TAGS]).toBe(raw);
      expect(mutations(r)).toEqual([]);
      expect(r.errors, 'invalid vocabulary logs its BowerError details, without cleanup').toMatch(/BowerError/);
  });

  it('b7-list-strict-write-lenient-read missing and over-cap positive control', async () => {
    const missing = await fixture('reuse-known', { vocabulary: null });
    const empty = await control(missing);
    expect(empty.after[TAGS]).toBeUndefined();
    const historical = Array.from({ length: 31 }, (_, i) => `topic-${i}`);
    const b = await fixture('reuse-known', { vocabulary: historical, words: 'File this. Tag it rainwater.' });
    const r = await control(b);
    expect(r.after[TAGS]).toBe(b.c.folder[TAGS]);
    expect(vocabulary(r)).toEqual(historical);
  });

  it('b7-runner-path-admission', async () => {
    const b = await fixture(); const r = await control(b);
    const m = frozen(r);
    const before = await b.drive.get(b.id(TAGS));
    const text = b.c.folder[TAGS] ?? '';
    const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: sha256Sync(text) };
    const original = { operationId: 'a'.repeat(64), ordinal: 0, dependsOn: [], effect: {
      kind: 'write-runner-json' as const, before: { fileId: before.id, name: 'questions.json', parents: before.parents,
        modifiedTime: before.modifiedTime, folder: false },
      beforeContent: { ...content, provenance: 'adapter-read' as const, observedModifiedTime: before.modifiedTime },
      path: SYSTEM.questions, text, content } };
    const own = b.id(SYSTEM.dir);
    const took = { taken: b.admission, deferred: [] };
    expect(outsideAdmitted({ ...m, operations: [original] }, took, own)).toBeNull();
    for (const path of ['.bower/private.json', '.bower/index.md/hidden.json', 'Resources/tags.json']) {
      const effect = { ...original.effect, before: { ...original.effect.before, name: path.split('/').at(-1) ?? '',
        ...(path.startsWith('Resources/') ? { parents: [b.id('Resources')] } : {}) }, path };
      const bad = { ...m, operations: [{ ...original, effect }] } as RunManifest;
      expect(outsideAdmitted(bad, took, own), path).not.toBeNull();
    }
    expect(readable('.bower/private.json', { v: 1, tags: [] })).toBe(false);
    expect(RUNNER_WRITES as readonly string[], 'the declared runner-only list admits exactly tags.json').toContain(TAGS);
    const allowed = { ...m, operations: [{ ...original, effect: { ...original.effect,
      before: { ...original.effect.before, name: 'tags.json' }, path: TAGS } }] } as RunManifest;
    expect(outsideAdmitted(allowed, took, own)).toBeNull();
  });

  it('b7-new-note-tags-through-main', async () => {
    await control(await fixture());
    for (const invalid of [['gardening', 'gardening'], ['unknown-topic'], [...KNOWN, 'fourth']]) {
      const b = await fixture();
      const refused = await run(b, [select(b, [], DEST), intent(b, invalid)]);
      failedReply(refused); expect(refused.frames).toHaveLength(3);
      expect(mutations(refused)).toEqual([]);
    }
    const b = await fixture(); const r = await withTags(b, KNOWN);
    expect(tagged(r, pathOfNote(b)), 'three installed tags survive the same authored create').toEqual(KNOWN);
    completed(r); expect(mutations(r)).toEqual([]);
    expect(r.events.filter((e) => e.path === pathOfNote(b) && e.method === 'POST')).toHaveLength(1);
    const replayEvents: Observation[] = [];
    const replay = await redispatchCase(b.c, r, 2, { claude: async () => { throw new Error('Replay must not model.'); },
      around: observe(b.drive, b.root, replayEvents), pacing: { sleep: async () => {} } });
    expect(tagged(replay, pathOfNote(b))).toEqual(KNOWN);
    expect(writes(replayEvents, pathOfNote(b))).toEqual([]);
  });

  it.each(['source', 'concept', 'project', 'area', 'moc'] as const)('b7-all-generation-routes %s', async (template) => {
    const plain = await control(await fixture());
    expect(tagged(plain, 'Resources/Gardening/Garden workshop.md')).toEqual([]);
    // Every B6 creation template uses the same serializer, never guessed tags from its destination.
      const n: NoteFile = { template, byBower: true, summary: 'Alex grows herbs.', tags: KNOWN, currentState: [],
        body: 'Alex grows herbs.', timeline: [], original: template === 'source' ? 'Garden workshop.txt' : undefined,
        properties: [{ key: 'created', label: 'Created', value: '2026-10-11' },
          { key: 'updated', label: 'Updated', value: '2026-10-11' }, { key: 'source', label: 'Source', value: 'Garden workshop' },
          { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' }] };
      expect(parseNote('Created.md', serializeNote(n)).tags, template).toEqual(KNOWN);
      expect(() => serializeNote({ ...n, tags: ['unsafe/tag'] }), `${template} cannot bypass the shared grammar`).toThrow();
    const b = await fixture(); const r = await withTags(b, ['gardening']);
    expect(tagged(r, pathOfNote(b))).toEqual(['gardening']);
  });

  it('b7-automatic-growth-no-proposal', async () => {
    const reuse = await fixture('reuse-known', { words: 'File this. Tag it Remote_work.' });
    const reused = await control(reuse);
    expect(vocabulary(reused)).toEqual(KNOWN);
    // Exact person requests are the ruled growth input available before the automatic-candidate declaration is frozen.
    const b = await fixture('proposal-yes', { words: 'File this rainwater guide. Tag it rainwater.' });
    const r = await run(b, [select(b, [], DEST), intent(b)]);
    completed(r); noProposals(r);
    expect(vocabulary(r), 'a named topic installs automatically without a consent reply field')
      .toEqual([...(JSON.parse(b.c.folder[TAGS] ?? '{}') as { tags: string[] }).tags, 'rainwater']);
    expect(mutations(r)).toHaveLength(1); growthEffect(r);
    const log = r.after['.bower/log/2026-10.md'] ?? '';
    expect(log).toMatch(/decision.*rainwater.* · op:[a-f0-9]{12}/);
    expect(Object.keys(r.after).filter((p) => p.startsWith('.bower/proposals/'))).toEqual([]);
    expect(r.frames).toHaveLength(2);
    // An idle later press never grows again, logs again, or modifies the installed vocabulary.
    const laterEvents: Observation[] = [];
    const later = await runOnDrive(b.c, b.drive, b.root, { claude: async () => reply({ kind: 'tidy-intent', v: 1, things: [] }),
      around: observe(b.drive, b.root, laterEvents), pacing: { sleep: async () => {} } }, 2);
    expect(later.after[TAGS]).toBe(r.after[TAGS]);
    expect(writes(laterEvents, TAGS)).toEqual([]);
    expect(later.after['.bower/log/2026-10.md']).toBe(log);
  });

  it('b7-three-thirty-two growth and duplicate-before-cap', async () => {
    await control(await fixture());
    const b = await fixture('reuse-known', { words: 'File this. Tag it rainwater, Rain_water, compost and seed-saving.' });
    const r = await run(b, [select(b, [], DEST), intent(b)]);
    completed(r);
    expect(vocabulary(r), 'equivalent candidates dedupe before the two-addition bound').toEqual([...KNOWN, 'rainwater', 'compost']);
    expect(mutations(r)).toHaveLength(1); noProposals(r);
  });

  it.each([[] as string[], null])('b7-explicit-growth-origin initial vocabulary %j', async (initial) => {
    const source = await fixture('authority-full-cap'); const safe = await control(source);
    expect(safe.after['Resources/Alex plans.md']).toBe(source.c.folder['Resources/Alex plans.md']);
    expect(safe.after['Rules.md']).toBe(source.c.folder['Rules.md']);
    const b = await fixture('reuse-known', { vocabulary: initial, words: 'File this. Tag it rainwater, compost and seed-saving.' });
    const r = await run(b, [select(b, [], DEST), intent(b)]); completed(r); noProposals(r);
    expect(vocabulary(r), 'exact person request installs only the two topics that fit').toEqual(['rainwater', 'compost']);
    expect(mutations(r)).toHaveLength(1);
    expect(Object.keys(r.after).filter((p) => /pending.*tag|tag.*queue/i.test(p))).toEqual([]);
    expect(r.after['Rules.md']).toBe(b.c.folder['Rules.md']);
  });

  it('b7-person-source-no-retag', async () => {
    const b = await fixture('authority-full-cap');
    const r = await withTags(b, ['gardening']);
    expect(r.after['Resources/Alex plans.md']).toBe(b.c.folder['Resources/Alex plans.md']);
    expect(r.after[DEST + '/Seed packet.md']).toBe(b.c.folder[DEST + '/Seed packet.md']);
    expect(r.after[DEST + '/Alex notes.md']).toBe(b.c.inboxFiles['Alex notes.md']);
    expect(tagged(r, DEST + '/Garden bulletin.md'), 'only the new Bower companion gains validated tags').toEqual(['gardening']);
    expect(r.events.filter((e) => e.media && e.method === 'PATCH' && [DEST + '/Seed packet.md', 'Resources/Alex plans.md'].includes(e.path))).toEqual([]);
  });

  it.each(['unchanged', 'changed', 'refused'] as const)('b7-growth-before-dependent-create %s', async (fault) => {
    await control(await fixture());
      const b = await fixture('proposal-yes', { words: 'File this. Tag it rainwater.' });
      let changed = false; let refused = false;
      const r = await run(b, [select(b, [], DEST), intent(b)], { beforeReply: async (turn) => {
        if (turn === 2 && fault === 'changed') {
          changed = true; await b.drive.writeText(b.id(TAGS), '{"v":1,"tags":["other-topic"]}\n', (await b.drive.get(b.id(TAGS))).modifiedTime);
        }
      }, around: (fetch) => async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const write = (init.method ?? 'GET') === 'PATCH' && url.pathname.endsWith('/' + b.id(TAGS));
        if (write && fault === 'refused') { refused = true; return new Response('{"error":{"code":403}}', { status: 403 }); }
        return fetch(input, init);
      } });
      const op = growthEffect(r);
      const dependent = frozen(r).operations.find((entry) => entry.effect.kind === 'create-text' && entry.effect.name === 'Rain barrel guide.md');
      expect(dependent?.dependsOn, 'a note containing the new topic waits for its install operation').toContain(op.operationId);
      if (fault === 'unchanged') {
        expect(tagged(r, pathOfNote(b))).toContain('rainwater');
        const sends = r.events.filter((e) => ['POST', 'PATCH'].includes(e.method));
        expect(sends.findIndex((e) => e.path === TAGS)).toBeLessThan(sends.findIndex((e) => e.path === pathOfNote(b)));
      } else {
        expect(fault === 'changed' ? changed : refused, 'fault really reached the declared vocabulary effect').toBe(true);
        expect(r.after[pathOfNote(b)]).toBeUndefined();
        expect(report(r).filed).toEqual([]);
      }
  });

  it('b7-29-to-30-growth', async () => {
    const full = await fixture('authority-full-cap'); const capacity = await control(full);
    expect(vocabulary(capacity)).toHaveLength(30); expect(mutations(capacity)).toEqual([]);
    const before = vocabulary(capacity).slice(0, 29);
    const b = await fixture('reuse-known', { vocabulary: before, words: 'File this. Tag it rainwater and new-topic.' });
    const r = await run(b, [select(b, [], DEST), intent(b)]); completed(r);
    expect(vocabulary(r), 'only the first candidate fits the thirtieth slot').toEqual([...before, 'rainwater']);
    expect(vocabulary(r)).toHaveLength(30); expect(mutations(r)).toHaveLength(1);
  });

  it('b7-lost-vocabulary-response', async () => {
    await control(await fixture());
    const b = await fixture('proposal-yes', { words: 'File this. Tag it rainwater.' });
    let lost = false;
    const r = await run(b, [select(b, [], DEST), intent(b)], { around: (fetch) => async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const path = url.pathname.endsWith('/' + b.id(TAGS));
      if (lost && path) throw new TypeError('Made-up lost vocabulary connection');
      const response = await fetch(input, init);
      if (path && (init.method ?? 'GET') === 'PATCH' && response.ok) { lost = true; throw new TypeError('Made-up lost vocabulary reply'); }
      return response;
    } });
    expect(lost, 'fault must fire after the vocabulary after-text actually lands').toBe(true);
    const events: Observation[] = [];
    const replay = await redispatchCase(b.c, r, 2, { claude: async () => { throw new Error('Replay must not model.'); },
      around: observe(b.drive, b.root, events), pacing: { sleep: async () => {} } });
    expect(vocabulary(replay)).toEqual(['gardening', 'rainwater']);
    expect(writes(events, TAGS)).toEqual([]);
    expect(tagged(replay, pathOfNote(b))).toContain('rainwater');
    expect((replay.after['.bower/log/2026-10.md'] ?? '').split('\n').filter((line) => /decision.*rainwater/.test(line))).toHaveLength(1);
  });

  it('b7-no-stamp-only-write', async () => {
    const known = await fixture(); const unchanged = await control(known);
    expect(unchanged.after[TAGS]).toBe(known.c.folder[TAGS]); expect(mutations(unchanged)).toEqual([]);
    const b = await fixture('reuse-known', { words: 'File this. Tag it rainwater and compost.' });
    const r = await run(b, [select(b, [], DEST), intent(b)]);
    expect(mutations(r), 'two real additions use one vocabulary mutation, never a stamp-only PATCH').toHaveLength(1);
    expect(JSON.parse(mutations(r)[0]?.text ?? '{}')).toEqual({ v: 1, tags: [...KNOWN, 'rainwater', 'compost'] });
    const op = growthEffect(r);
    expect(op.effect.kind).toBe('write-runner-json');
    if (op.effect.kind === 'write-runner-json') {
      expect(op.effect.before?.fileId).toBe(b.id(TAGS));
      expect(op.effect.beforeContent?.observedModifiedTime).toBe(op.effect.before?.modifiedTime);
    }
  });

  it('b7-person-move-byte-identity', async () => {
    const b = await fixture('authority-full-cap'); const id = b.sources.find((s) => s.name === 'Alex notes.md')?.itemId ?? '';
    const bytes = await b.drive.readBytes(id); const r = await control(b);
    expect(await b.drive.readBytes(id)).toEqual(bytes);
    expect(r.pathsById[id]).toBe(DEST + '/Alex notes.md');
    expect(tagged(r, DEST + '/Alex notes.md')).toEqual(['My Topic', 'rainwater', 'personal', 'reminders']);
    for (const kind of ['name', 'place'] as const) {
      const changed = await fixture('authority-full-cap');
      const personId = changed.sources.find((s) => s.name === 'Alex notes.md')?.itemId ?? '';
      const before = await changed.drive.get(personId);
      const out = await run(changed, [select(changed, [], DEST), intent(changed)], { beforeReply: async (turn) => {
        if (turn === 2) await changed.drive.update(personId, kind === 'name' ? { name: 'Alex renamed.md' }
          : { addParent: changed.id('Resources'), removeParent: before.parents[0] });
      } });
      expect(out.pathsById[personId]).not.toBe(DEST + '/Alex notes.md');
      expect(await changed.drive.readBytes(personId)).toEqual(bytes);
      expect(out.events.filter((e) => e.method === 'PATCH' && e.path.endsWith('/Alex notes.md') && e.media)).toEqual([]);
    }
  });

  it('b7-undo-keeps-vocabulary', async () => {
    await control(await fixture());
    const b = await fixture('proposal-yes', { words: 'File this. Tag it rainwater.' });
    const first = await run(b, [select(b, [], DEST), intent(b)]);
    expect(vocabulary(first), 'Undo control first installs the run vocabulary').toEqual(['gardening', 'rainwater']);
    const sourceId = b.sources[0]?.itemId ?? '';
    const move = frozen(first).operations.find((op) => op.effect.kind === 'move' && op.effect.before.fileId === sourceId);
    expect(move).toBeDefined();
    const companion = Object.entries(first.pathsById).find(([, path]) => path === pathOfNote(b))?.[0];
    expect(companion).toBeDefined();
    if (!companion || !move) throw new Error('The B7 Undo control must first settle a move and a companion.');
    const file = await b.drive.get(sourceId);
    await b.drive.update(sourceId, { addParent: b.id('Inbox'), removeParent: file.parents[0], name: b.sources[0]?.name ?? '' });
    await b.drive.trash(companion);
    await b.drive.createText(b.id(SYSTEM.changes), 'b7-undo.json', JSON.stringify({ v: 1, id: 'b7-undo',
      device: 'device-1', at: AT + 1, kind: 'move', what: 'Put back the gardening guide.',
      undoes: move.operationId, fileId: sourceId, path: 'Inbox/' + b.sources[0]?.name, from: DEST + '/' + b.sources[0]?.name }));
    await b.drive.createText(b.id(SYSTEM.changes), 'b7-undo-request.json', JSON.stringify({ v: 1, id: 'b7-undo-request',
      device: 'device-1', at: AT + 1, kind: 'request', what: 'Undo the last tidy-up', text: 'Undo the last tidy-up' }));
    const events: Observation[] = [];
    const undone = await runOnDrive({ ...b.c, scope: 'undo' }, b.drive, b.root,
      { claude: async () => reply({ kind: 'tidy-intent', v: 1, things: [] }), answerStart: { scope: 'instructions', requestId: 'b7-undo-run' },
        around: observe(b.drive, b.root, events), pacing: { sleep: async () => {} } }, 2);
    expect(undone.code).toBe(0); expect(undone.after[TAGS]).toBe(first.after[TAGS]);
    expect(undone.after[pathOfNote(b)]).toBeUndefined(); expect(writes(events, TAGS)).toEqual([]);
    expect(undone.after['Inbox/' + b.sources[0]?.name]).toBe(b.c.inboxFiles[b.sources[0]?.name ?? '']);
    const replay = await redispatchCase(b.c, undone, 2, { claude: async () => { throw new Error('Undo replay must not model.'); }, pacing: { sleep: async () => {} } });
    expect(replay.after[TAGS]).toBe(first.after[TAGS]); expect(replay.after[pathOfNote(b)]).toBeUndefined();
  });

  it.each(['reuse-known', 'proposal-yes', 'proposal-budget', 'authority-full-cap'])('%s corpus oracle through main', async (slug) => {
    const b = await fixture(slug);
    const replies = JSON.parse(await readFile(resolve(b.c.dir, 'replies.json'), 'utf8')) as Array<{ things: Array<{ fileId: string }> }>;
    const bind = (base: Base): { things: Array<{ note?: { tags?: string[] } }> } =>
      JSON.parse(JSON.stringify(replies[0]).replace(/\$file:([^"\\]+)/g, (_, name: string) =>
        base.sources.find((s) => s.name === name)?.itemId ?? 'missing-fixture-id')) as { things: Array<{ note?: { tags?: string[] } }> };
    const bound = bind(b);
    const wants = [b.id(DEST + '/Gardening.md'), b.id(DEST + '/Seed packet.md')];
    const positive = await fixture(slug);
    const positiveBound = bind(positive);
    for (const thing of positiveBound.things) if (thing.note) delete thing.note.tags;
    const valid = await run(positive, [select(positive, [positive.id(DEST + '/Gardening.md'), positive.id(DEST + '/Seed packet.md')], DEST), positiveBound]);
    completed(valid, positive.sources.length);
    const r = await run(b, [select(b, wants, DEST), bound]);
    const oracle = JSON.parse(await readFile(resolve(b.c.dir, 'expected-tag-results.json'), 'utf8')) as {
      runs: Array<{ vocabulary: string[]; noteTags: Record<string, string[]>; vocabularyMutationSends: number }>;
    };
    expect(r.code, 'corpus reply with known tags is accepted by the existing validator').toBe(0);
    expect(vocabulary(r)).toEqual(oracle.runs[0]?.vocabulary);
    for (const [path, tags] of Object.entries(oracle.runs[0]?.noteTags ?? {})) expect(tagged(r, path), path).toEqual(tags);
    expect(mutations(r)).toHaveLength(oracle.runs[0]?.vocabularyMutationSends ?? 0);
  });
});
