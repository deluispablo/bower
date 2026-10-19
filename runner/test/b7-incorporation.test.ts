/// <reference lib="dom" />
/** B7 reds use the production main/provider/planner/adapter, with B1d selection by real candidate ids. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote, readTypeTable, serializeNote, type NoteFile } from '../../src/data/contracts/note-format';
import type { RunManifest } from '../../src/data/spine/records';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import type { Question } from '../../src/data/contracts/types';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { sha256Sync } from '../../src/data/contracts/hashes';
import { isRunnerFile, RUNNER_WRITES, SYSTEM } from '../../src/data/vault/layout';
import { DriveVault } from '../../src/data/vault/drive-vault';
import { outsideAdmitted } from '../src/spine/admitted';
import { loadCase } from '../src/corpus';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { AT, redispatchCase, runOnDrive, runScripted, scoreCase, seedCase, type CaseRun } from './corpus-run';
import { manifests, observe, writes, type Observation } from './b23-hot-observe';
import { completed, failedReply, reply, report, run, select, setup, type Base } from './b1-planning-support';
import { fixedDrive, paging } from './drive-v3';

const TAGS = '.bower/tags.json';
const GROWTH = 'c17-b7-automatic-growth-replay';
const CAPACITY = 'c17-b7-automatic-capacity-order';
const REUSE = 'c17-b7-reuse-known';
const FULL = 'c17-b7-authority-full-cap';
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

function intent(b: Base, tags?: string[], newTags?: string[]) {
  return { kind: 'tidy-intent', v: 1, ...(newTags === undefined ? {} : { newTags }), things: b.sources.filter((s) => s.name).map((s) => ({
    fileId: s.itemId, to: DEST, name: s.name,
    ...(!s.name.endsWith('.md') ? { note: { name: s.name.replace(/\.[^.]+$/, '.md'),
      summary: 'Alex keeps a gardening reference.', body: b.c.inboxFiles[s.name]?.trim() ?? 'Alex grows herbs.',
      ...(tags === undefined ? {} : { tags }) } } : {}),
  })) };
}
const pathOfNote = (b: Base): string => DEST + '/' + (b.sources.find((s) => !s.name.endsWith('.md'))?.name ?? '').replace(/\.[^.]+$/, '.md');
const vocabulary = (r: CaseRun): string[] => (JSON.parse(r.after[TAGS] ?? '{"tags":[]}') as { tags: string[] }).tags;
const tagged = (r: CaseRun, path: string): string[] => parseNote(path, r.after[path] ?? '').tags;
const mutations = (r: { events: Observation[] }) => writes(r.events, TAGS);
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
  it.each([{ tags: ['gardening', 'remote-work', 'learning', 'fourth'] }, { tags: ['unsafe/tag'] }])(
    'b7-r9 fourth installed or unsafe tag $tags refuses before effects and retries', async ({ tags }) => {
      const b = await fixture('reuse-known', { vocabulary: [...KNOWN, 'fourth'] });
      const exhausted = await run(b, [select(b, [], DEST), intent(b, tags)]);
      failedReply(exhausted);
      expect(exhausted.frames).toHaveLength(3);
      expect(exhausted.frames[2]?.call.input).toContain('Your reply was refused:');
      expect(mutations(exhausted)).toEqual([]);
      const retry = await fixture('reuse-known', { vocabulary: [...KNOWN, 'fourth'] });
      const r = await run(retry, [select(retry, [], DEST), intent(retry, tags), intent(retry, ['gardening'])]);
      expect(r.frames[2]?.events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method)
        && (!e.path.startsWith('.bower/') || /manifest-|\/changes\//.test(e.path)))).toEqual([]);
      expect(r.code, 'R9 the installed-tag retry is accepted after refusing the invalid assignment').toBe(0);
      expect(tagged(r, pathOfNote(retry)), 'R9 valid tagged retry files after the invalid assignment').toEqual(['gardening']);
      expect(r.events.filter((e) => e.path === pathOfNote(retry) && e.method === 'POST')).toHaveLength(1);
    });

  it('b7-r10 assignment normalization precedes membership and duplicate refusal', async () => {
    const duplicate = await fixture();
    const refused = await run(duplicate, [select(duplicate, [], DEST), intent(duplicate, ['remote-work', 'Remote_work'])]);
    failedReply(refused); expect(refused.frames).toHaveLength(3);
    const b = await fixture(); const r = await withTags(b, ['Remote_work']);
    expect(tagged(r, pathOfNote(b)), 'R10 alternative spelling files as the installed canonical slug').toEqual(['remote-work']);
    completed(r); expect(mutations(r)).toEqual([]);
  });

  it('b7-r11 execution provider shows installed vocabulary', async () => {
    const b = await fixture(); const r = await control(b);
    for (const tag of KNOWN) expect.soft(r.frames[1]?.call.input, `R11 execution model sees installed ${tag}`).toContain(tag);
  });

  it.each([
    ...(['source', 'concept', 'project', 'area', 'moc'] as const).map((template) => ({ template })),
    ...readTypeTable(null).table.rows.map((row) => ({ typeRow: row.id, template: row.template })),
  ])('b7-r12 main generation route $template declared $typeRow', async (route) => {
    const b = await fixture(); const selection = select(b, [], DEST);
    if ('typeRow' in route) for (const item of selection.items) item.kind = route.typeRow;
    const authored = (tags?: string[]) => {
      const value = intent(b, tags);
      return { ...value, things: value.things.map((thing) => ({ ...thing, note: { ...thing.note,
        ...('typeRow' in route ? { typeRow: route.typeRow } : { template: route.template }) } })) };
    };
    const r = await run(b, [selection, authored(['gardening']), authored()]);
    expect(r.code, r.errors).toBe(0);
    expect(parseNote(pathOfNote(b), r.after[pathOfNote(b)] ?? '').properties.find((p) => p.key === 'type')?.value)
      .toBe('typeRow' in route ? route.typeRow : route.template);
    expect(r.after[pathOfNote(b)]).toContain(`bower_template: ${route.template}`);
    expect(tagged(r, pathOfNote(b)), 'R12 the actual main-created route carries its assignment').toEqual(['gardening']);
    completed(r);
  });

  it('b7-r12 words link and comparison main outputs keep empty tags', async () => {
    const source = await fixture();
    const words = await setup({ folder: source.c.folder, inbox: [{ line: 'Alex grows herbs.', files: [] }] });
    const wordNote = DEST + '/Herb reminder.md';
    const wordRun = await run(words, [select(words, [], DEST), { kind: 'tidy-intent', v: 1, things: [],
      notes: [{ pileId: words.sources[0]?.pileId, to: DEST, name: 'Herb reminder.md' }] }]);
    completed(wordRun);
    expect(wordRun.after[wordNote], 'R12 words route creates a real note').toBeDefined();
    expect(tagged(wordRun, wordNote)).toEqual([]);
    const link = await setup({ folder: source.c.folder, inbox: [{ line: '', files: ['Herbs.url'] }],
      inboxFiles: { 'Herbs.url': 'https://herbs.example/reference\n' } });
    const linkRun = await run(link, [select(link, [], DEST), { kind: 'tidy-intent', v: 1,
      things: [{ fileId: link.sources[0]?.itemId, to: DEST, name: 'Herbs.md' }] }]);
    completed(linkRun);
    expect(linkRun.after[DEST + '/Herbs.md'], 'R12 link route creates a real note').toBeDefined();
    expect(tagged(linkRun, DEST + '/Herbs.md')).toEqual([]);
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c08-compare-flats'));
    c.folder[TAGS] = JSON.stringify({ v: 1, tags: KNOWN });
    const drive = fixedDrive(); const root = await seedCase(drive, c);
    const comparison = await runOnDrive(c, drive, root, { pacing: { sleep: async () => {} } }, 1);
    expect(comparison.code).toBe(0);
    const created = Object.keys(comparison.after).filter((path) => path.endsWith('.md')
      && !path.startsWith('.bower/') && !Object.hasOwn(c.folder, path) && path !== 'Bower health.md'); // B8 (R8)
    expect(created, 'R12 comparison route actually creates its table note').toHaveLength(1);
    expect(tagged(comparison, created[0] ?? '')).toEqual([]);
  });

  it('b7-r13 invalid vocabulary ignores assignments and logs once', async () => {
    const raw = '{"v":1,"tags":["gardening","unsafe/tag"]}\n';
    const b = await fixture('reuse-known', { raw });
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening', 'unsafe/tag', 'gardening', 'fourth'])]);
    expect.soft(r.code, 'R13 disabled tags do not refuse the reply').toBe(0);
    expect.soft(r.frames, 'R13 ignored assignments need no validation retry').toHaveLength(2);
    expect.soft(r.after[pathOfNote(b)], 'R13 invalid list still files the authored note').toBeDefined();
    expect(tagged(r, pathOfNote(b))).toEqual([]);
    expect(r.after[TAGS]).toBe(raw); expect(mutations(r)).toEqual([]);
    expect.soft(r.errors, 'R13 logged BowerError identifies the invalid vocabulary').toContain('Bower could not read your tag list');
    expect.soft(r.errors.match(/BowerError/g) ?? [], 'R13 exactly one logged vocabulary error per run').toHaveLength(1);
  });

  it('b7-r14 vocabulary is read once per version across execution and retry never discovery', async () => {
    const b = await fixture();
    const r = await run(b, [select(b, [], DEST), intent(b, ['unknown-topic']), intent(b)]);
    expect(r.code).toBe(0); expect(r.frames).toHaveLength(3);
    expect(r.frames[0]?.events.filter((e) => e.path === TAGS && e.method === 'GET' && e.media),
      'R14 discovery does not read vocabulary media').toEqual([]);
    expect(r.events.filter((e) => e.path === TAGS && e.method === 'GET' && e.media),
      'R14 provider planner and retry share one vocabulary version read').toHaveLength(1);
    expect(mutations(r)).toEqual([]);
  });

  it('b7-r15 tagging preserves authorized personal append and link rewrite with legacy tags', async () => {
    const source = await fixture();
    const personal = 'Resources/Alex plans.md';
    const legacy = 'tags: ["My Topic", "Writing, editing", "unsafe/tag", "My Topic"]\n';
    const before = '---\nsummary: Alex grows herbs.\n' + legacy + '---\n\nAlex follows [[Old seed]].\n\n## Timeline\n';
    const b = await setup({ folder: { ...source.c.folder, [personal]: before }, inbox: source.c.inbox,
      inboxFiles: source.c.inboxFiles });
    const request = await b.drive.createText(b.id(SYSTEM.changes), 'r15-request.json', JSON.stringify({
      v: 1, id: 'r15-request', device: 'device-1', at: AT - 1, kind: 'request',
      what: 'Update Alex plans', text: 'Update [[Alex plans]] from the gardening reference.' }));
    const rename = await b.drive.createText(b.id(SYSTEM.changes), 'r15-rename.json', JSON.stringify({
      v: 1, id: 'r15-rename', device: 'device-1', at: AT - 1, kind: 'rename', what: 'Renamed Old seed to Seed packet',
      from: DEST + '/Old seed.md', path: DEST + '/Seed packet.md' }));
    b.admission.journal = [request, rename].map((f) => ({ fileId: f.id, name: f.name,
      parents: f.parents, modifiedTime: f.modifiedTime }));
    const selection = select(b, [], DEST);
    selection.items.push({ itemId: request.id, kind: 'unknown', destination: b.id('Resources'), wants: [b.id(personal)] });
    const line = 'Alex grows herbs.';
    const authored = (tags?: string[]) => ({ ...intent(b, tags),
      lines: [{ note: personal, text: line, cites: b.sources[0]?.itemId }] });
    const r = await run(b, [selection, authored(['gardening']), authored()]);
    expect(r.code, r.errors).toBe(0);
    expect(r.after[personal], 'R15 authorized C05 append survives tagging').toContain(' · ' + line);
    expect(r.after[personal], 'R15 authorized link rewrite survives tagging').toContain('[[Seed packet]]');
    expect(r.after[personal]).not.toContain('[[Old seed]]');
    expect(r.after[personal]?.split('---')[1]).toBe(before.split('---')[1]);
    expect(tagged(r, personal)).toEqual(parseNote(personal, before).tags);
    expect(frozen(r).operations.filter((op) => op.effect.kind === 'edit-text').map((op) =>
      op.effect.kind === 'edit-text' ? op.effect.path : '')).toEqual([personal]);
    expect(r.after[DEST + '/Seed packet.md']).toBe(b.c.folder[DEST + '/Seed packet.md']);
    expect(tagged(r, pathOfNote(b)), 'R15 new companion is tagged in the same authorized-edit run').toEqual(['gardening']);
    expect(mutations(r)).toEqual([]);
  });

  it.each(['reuse-known', 'automatic-growth-replay', 'automatic-capacity-order', 'authority-full-cap'])('%s untagged positive control', async (slug) => {
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
    const before = await b.drive.get(b.id(SYSTEM.questions));
    const text = await b.drive.readText(before.id);
    const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: sha256Sync(text) };
    const original = { operationId: 'a'.repeat(64), ordinal: 0, dependsOn: [], effect: {
      kind: 'write-runner-json' as const, before: { fileId: before.id, name: before.name, parents: before.parents,
        modifiedTime: before.modifiedTime, folder: false },
      beforeContent: { ...content, provenance: 'adapter-read' as const, observedModifiedTime: before.modifiedTime },
      path: SYSTEM.questions, text, content } };
    const own = b.id(SYSTEM.dir);
    const took = { taken: b.admission, deferred: [] };
    if (!m.capture.places.some((p) => p.file.fileId === before.id)) {
      m.capture.places.push({ file: original.effect.before, path: SYSTEM.questions });
    }
    expect(outsideAdmitted({ ...m, operations: [original] }, took, own)).toBeNull();
    const mismatch = { ...original, effect: { ...original.effect, before: { ...original.effect.before, fileId: b.id(TAGS) } } };
    expect(outsideAdmitted({ ...m, operations: [mismatch] }, took, own), 'a questions path cannot alias the captured tags identity').not.toBeNull();
    for (const path of ['.bower/private.json', '.bower/index.md/hidden.json', 'Resources/tags.json']) {
      const effect = { ...original.effect, before: { ...original.effect.before, name: path.split('/').at(-1) ?? '',
        ...(path.startsWith('Resources/') ? { parents: [b.id('Resources')] } : {}) }, path };
      const bad = { ...m, operations: [{ ...original, effect }] } as RunManifest;
      expect(outsideAdmitted(bad, took, own), path).not.toBeNull();
    }
    expect(readable('.bower/private.json', { v: 1, tags: [] })).toBe(false);
    expect(RUNNER_WRITES as readonly string[], 'the declared runner-only list admits exactly tags.json').toContain(TAGS);
    const tags = await b.drive.get(b.id(TAGS));
    const tagText = await b.drive.readText(tags.id);
    const tagContent = { encoding: 'utf8' as const, size: new TextEncoder().encode(tagText).length, sha256: sha256Sync(tagText) };
    const allowed = { ...m, operations: [{ ...original, effect: { ...original.effect,
      before: { fileId: tags.id, name: tags.name, parents: tags.parents, modifiedTime: tags.modifiedTime, folder: false },
      beforeContent: { ...tagContent, provenance: 'adapter-read', observedModifiedTime: tags.modifiedTime },
      path: TAGS, text: tagText, content: tagContent } }] } as RunManifest;
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
    // The execution reply declares candidates from the person's request.
    const b = await fixture('automatic-growth-replay', { words: 'File this rainwater guide. Tag it rainwater.' });
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater'])]);
    completed(r); noProposals(r);
    expect(vocabulary(r), 'a named topic installs automatically without a consent reply field')
      .toEqual([...(JSON.parse(b.c.folder[TAGS] ?? '{}') as { tags: string[] }).tags, 'rainwater']);
    expect(mutations(r)).toHaveLength(1); growthEffect(r);
    expect(Object.keys(r.after).filter((p) => p.startsWith('.bower/proposals/'))).toEqual([]);
    expect(r.frames).toHaveLength(2);
    // An idle later press never grows again or modifies the installed vocabulary.
    const laterEvents: Observation[] = [];
    const later = await runOnDrive(b.c, b.drive, b.root, { claude: async () => reply({ kind: 'tidy-intent', v: 1, things: [] }),
      around: observe(b.drive, b.root, laterEvents), pacing: { sleep: async () => {} } }, 2);
    expect(later.after[TAGS]).toBe(r.after[TAGS]);
    expect(writes(laterEvents, TAGS)).toEqual([]);
  });

  it('b7-r17-normalize-equality b7-three-thirty-two growth and duplicate-before-cap', async () => {
    await control(await fixture());
    const b = await fixture('reuse-known', { words: 'File this. Tag it rainwater, RainWater, compost and seed-saving.' });
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater', 'RainWater', 'compost', 'seed-saving'])]);
    completed(r);
    expect(vocabulary(r), 'equivalent candidates dedupe before the two-addition bound').toEqual([...KNOWN, 'rainwater', 'compost']);
    expect(mutations(r)).toHaveLength(1); noProposals(r);
  });

  it('b7-r17-semantic-neighbours stay distinct when normalization differs', async () => {
    const b = await fixture();
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['RainWater', 'Rain water'])]);
    expect(vocabulary(r), 'R17 only normalizeTag equality dedupes candidates, not semantic similarity')
      .toEqual([...KNOWN, 'rainwater', 'rain-water']);
    completed(r); expect(mutations(r)).toHaveLength(1);
  });

  it('b7-r18-newTags-order wins over reversed things and admission order', async () => {
    const b = await fixture('automatic-capacity-order');
    const topics: Record<string, string> = { 'Rain barrel guide.txt': 'rainwater', 'Compost guide.txt': 'compost', 'Seed saving guide.txt': 'seed-saving' };
    const candidates = [b.sources[0], b.sources[2], b.sources[1]].map((source) => topics[source?.name ?? ''] ?? 'missing-topic');
    expect([...candidates].sort()).toEqual(['compost', 'rainwater', 'seed-saving']);
    const authored = intent(b, undefined, candidates);
    const admitted = b.sources.map((s) => s.itemId);
    authored.things.reverse();
    expect(authored.things.map((t) => t.fileId)).toEqual([...admitted].reverse());
    const r = await run(b, [select(b, [], DEST), authored]);
    expect(vocabulary(r), 'R18 first-fit follows newTags even when things reverse admission order')
      .toEqual(['gardening', ...candidates.slice(0, 2)]);
    completed(r, b.sources.length); expect(mutations(r)).toHaveLength(1); noProposals(r);
  });

  it.each([
    'rainwater', null, { topic: 'rainwater' }, ['rainwater', 7], ['unsafe/tag'], ['a'.repeat(41)],
    ['rainwater', 'compost', 'unsafe/tag'], ['rainwater', 'RainWater', 'unsafe/tag'],
  ].map((newTags) => ({ newTags })))('b7-r19-invalid-candidates $newTags refuse before dedupe or capacity dropping', async ({ newTags }) => {
    const b = await fixture('reuse-known', { vocabulary: [...KNOWN, ...Array.from({ length: 26 }, (_, i) => `topic-${i}`)] });
    const invalid = { ...intent(b), newTags };
    const exhausted = await run(b, [select(b, [], DEST), invalid]);
    expect.soft(exhausted.code, 'R19 malformed newTags exhausts the existing validation retry').toBe(1);
    expect.soft(exhausted.frames, 'R19 malformed newTags invokes the retry').toHaveLength(3);
    expect.soft(exhausted.after[pathOfNote(b)], 'R19 invalid candidates leave no note effect').toBeUndefined();
    expect(mutations(exhausted)).toEqual([]);
    const retry = await fixture();
    const r = await run(retry, [select(retry, [], DEST), { ...intent(retry), newTags }, intent(retry, ['gardening'])]);
    expect.soft(r.frames[2]?.call.input, 'R19 refusal reaches the existing retry prompt').toContain('Your reply was refused:');
    expect(tagged(r, pathOfNote(retry))).toEqual(['gardening']); expect(mutations(r)).toEqual([]);
  });

  it('b7-r20-provider declares growth field caps and installed-tag reuse', async () => {
    const b = await fixture(); const r = await control(b);
    expect(r.frames[1]?.value.tags).toEqual(KNOWN);
    const input = r.frames[1]?.prompt ?? '';
    // Inspect the field declaration and tag context without binding the provider to one prose sentence.
    expect.soft(input, 'R20 execution reply schema declares the newTags array').toMatch(/"newTags"\s*:\s*\[/);
    const context = input.split('\n').filter((line) => /tag|topic/i.test(line)).join('\n');
    expect.soft(context, 'R20 execution context declares two additions per run')
      .toMatch(/(?:2|two)[^\n]*(?:per run|per tidy|each run)|(?:per run|per tidy|each run)[^\n]*(?:2|two)/i);
    expect.soft(context, 'R20 execution context declares thirty installed tags').toMatch(/\b(?:30|thirty)\b/i);
    expect.soft(context, 'R20 execution context prefers reuse of installed tags')
      .toMatch(/(?:reuse|prefer)[^\n]*(?:installed|existing)|(?:installed|existing)[^\n]*(?:reuse|first)/i);
  });

  it('b7-r21-installed-equivalents consume no slot and cause no vocabulary write', async () => {
    const b = await fixture();
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening'], ['Gardening', 'gardening', 'Remote_work'])]);
    expect(r.code, 'R21 installed-equivalent candidates are accepted without growth').toBe(0);
    completed(r); expect(vocabulary(r)).toEqual(KNOWN); expect(mutations(r)).toEqual([]);
  });

  it('b7-r21-candidate-equivalents leave two slots and a later run writes nothing', async () => {
    const b = await fixture();
    const candidates = ['Gardening', 'rainwater', 'RainWater', 'compost', 'seed-saving'];
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, candidates)]);
    expect.soft(vocabulary(r), 'R21 installed and earlier equivalents consume no addition slots')
      .toEqual([...KNOWN, 'rainwater', 'compost']);
    expect.soft(mutations(r), 'R21 accepted candidates use one vocabulary write').toHaveLength(1);
    const source = await b.drive.createText(b.id('Inbox'), 'Later guide.txt', 'Alex keeps a gardening reference.', { pile: 'r21-later' });
    const admission = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 1, newId: () => 'r21-later-admission' });
    expect(admission.kind).toBe('manifest');
    if (admission.kind !== 'manifest') throw new Error('R21 later source needs a real admission.');
    const later = { ...b, admission: admission.manifest, sources: [{ itemId: source.id,
      pileId: admission.manifest.piles[0]?.pileId ?? '', name: source.name }] };
    const repeated = await run(later, [select(later, [], DEST), intent(later, undefined, ['RainWater', 'Compost'])], { press: 2 });
    completed(repeated); expect(repeated.after[TAGS]).toBe(r.after[TAGS]); expect(mutations(repeated)).toEqual([]);
  });

  it('b7-r22-invalid-list ignores growth and assignments without a retry', async () => {
    const raw = '{"v":1,"tags":["unsafe/tag"]}\n';
    const b = await fixture('reuse-known', { raw });
    const r = await run(b, [select(b, [], DEST), { ...intent(b, ['unsafe/tag', 'gardening', 'gardening', 'fourth']), newTags: ['unsafe/tag', 7] }]);
    expect(r.frames, 'R22 disabled tags ignore newTags without a validation retry').toHaveLength(2);
    completed(r); expect(tagged(r, pathOfNote(b))).toEqual([]); expect(r.after[TAGS]).toBe(raw);
    expect(mutations(r)).toEqual([]); expect(r.errors.match(/BowerError/g) ?? []).toHaveLength(1);
  });

  it.each([30, 31])('b7-r22-full-list %i freezes growth while installed assignments apply', async (count) => {
    const before = ['gardening', ...Array.from({ length: count - 1 }, (_, i) => `topic-${i}`)];
    const b = await fixture('reuse-known', { vocabulary: before });
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening'], ['rainwater', 'compost'])]);
    expect(tagged(r, pathOfNote(b)), 'R22 frozen growth still permits installed assignments').toEqual(['gardening']);
    completed(r); expect(tagged(r, pathOfNote(b))).toEqual(['gardening']);
    expect(r.after[TAGS]).toBe(b.c.folder[TAGS]); expect(mutations(r)).toEqual([]);
  });

  it.each([30, 31])('b7-r31-full-list %i normalizes declarations and drops their assignments without growth', async (count) => {
    const before = ['gardening', ...Array.from({ length: count - 1 }, (_, i) => `topic-${i}`)];
    const b = await fixture('reuse-known', { vocabulary: before });
    const r = await run(b, [select(b, [], DEST), intent(b, ['Gardening', 'Rain water'], ['RAIN_WATER', 'compost'])]);
    completed(r); expect(r.frames, 'R31 declared but dropped assignments file without a retry').toHaveLength(2);
    expect(tagged(r, pathOfNote(b)), 'R31 installed tags survive and normalized dropped candidates disappear').toEqual(['gardening']);
    expect(r.after[TAGS]).toBe(b.c.folder[TAGS]); expect(mutations(r)).toEqual([]);
  });

  it('b7-r31-full-list validates unsafe candidates before freezing growth', async () => {
    const before = ['gardening', ...Array.from({ length: 29 }, (_, i) => `topic-${i}`)];
    const b = await fixture('reuse-known', { vocabulary: before });
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening'], ['unsafe/tag'])]);
    failedReply(r); expect(r.frames).toHaveLength(3);
    expect(r.frames[2]?.call.input).toContain('Your reply was refused:');
    expect(r.after[pathOfNote(b)], 'R31 unsafe declarations leave no note effect').toBeUndefined();
    expect(r.after[TAGS]).toBe(b.c.folder[TAGS]); expect(mutations(r)).toEqual([]);
  });

  it('b7-r23-assignments keep installed and accepted tags and lose dropped additions', async () => {
    const b = await fixture();
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening', 'RainWater', 'seed-saving'], ['rainwater', 'compost', 'seed-saving'])]);
    expect(tagged(r, pathOfNote(b)), 'R23 installed and accepted tags survive; the dropped candidate is removed')
      .toEqual(['gardening', 'rainwater']);
    completed(r); expect(vocabulary(r)).toEqual([...KNOWN, 'rainwater', 'compost']);
    const unknown = await fixture();
    const refused = await run(unknown, [select(unknown, [], DEST), intent(unknown, ['undeclared'], ['rainwater'])]);
    failedReply(refused); expect(refused.frames).toHaveLength(3); expect(mutations(refused)).toEqual([]);
    const retry = await fixture();
    const valid = await run(retry, [select(retry, [], DEST), intent(retry, ['undeclared'], ['rainwater']), intent(retry, ['gardening'])]);
    expect(valid.frames).toHaveLength(3); expect(tagged(valid, pathOfNote(retry))).toEqual(['gardening']);
    expect(mutations(valid)).toEqual([]);
  });

  it('b7-r24-refused-candidates leave no effect when retry declares different additions', async () => {
    const b = await fixture();
    const r = await run(b, [select(b, [], DEST), intent(b, ['gardening', 'Gardening'], ['refused-topic']),
      intent(b, ['gardening'], ['accepted-topic'])]);
    expect(r.frames).toHaveLength(3); expect(r.frames[2]?.call.input).toContain('Your reply was refused:');
    expect(r.frames[2]?.events.filter((e) => ['POST', 'PATCH', 'DELETE'].includes(e.method)
      && (e.path === TAGS || !e.path.startsWith('.bower/') || /manifest-|\/changes\//.test(e.path)))).toEqual([]);
    expect(vocabulary(r), 'R24 only accepted retry candidates grow the vocabulary').toEqual([...KNOWN, 'accepted-topic']);
    expect(mutations(r)).toHaveLength(1); expect(tagged(r, pathOfNote(b))).toEqual(['gardening']);
    expect(frozen(r).operations.some((op) => 'text' in op.effect && op.effect.text.includes('refused-topic'))).toBe(false);
  });

  it('b7-r25-missing-list lost create reply recovers by reserved id and completes the dependent note once', async () => {
    const b = await fixture('automatic-growth-replay', { vocabulary: null });
    let reserved: string | undefined; let lost = false;
    const r = await run(b, [select(b, [], DEST), intent(b, ['rainwater'], ['rainwater'])], {
      around: (fetch) => async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (!lost && init.method === 'POST' && url.pathname === '/upload/drive/v3/files'
          && url.searchParams.get('uploadType') === 'multipart') {
          const body = await new Response(init.body).text();
          const boundary = /^--([^\r\n]+)\r\n/.exec(body)?.[1] ?? '';
          const part = body.split(`--${boundary}`)[1] ?? '';
          const meta = JSON.parse(part.slice(part.indexOf('\r\n\r\n') + 4).trim()) as { name?: string; id?: string };
          if (meta.name === 'tags.json') {
            reserved = meta.id;
            const response = await fetch(input, init);
            expect(response.ok, 'R25 loss occurs after the reserved-id create lands').toBe(true);
            lost = true; throw new TypeError('Made-up lost tags create reply');
          }
        }
        return fetch(input, init);
      },
    });
    expect(lost, 'R25 the missing vocabulary create must actually land before losing its reply').toBe(true);
    expect(reserved).toBeTruthy();
    const op = growthEffect(r);
    expect(op.effect).toMatchObject({ kind: 'write-runner-json', path: TAGS, before: null, beforeContent: null });
    expect(r.traffic.some((t) => t.method === 'GET' && t.url.pathname === `/drive/v3/files/${reserved}`)).toBe(true);
    const checkpoints = Object.entries(r.after).filter(([path]) => /\/checkpoint-[^/]+\.json$/.test(path))
      .map(([, text]) => JSON.parse(text) as Checkpoint).sort((a, b) => a.revision - b.revision);
    expect(checkpoints.at(-1)?.outcomes.find((outcome) => outcome.operationId === op.operationId))
      .toMatchObject({ state: 'applied', evidence: { file: { fileId: reserved } } });
    const lists = (await b.drive.listAll(b.root)).filter((f) => f.name === 'tags.json');
    expect(lists.map((f) => f.id)).toEqual([reserved]); expect(vocabulary(r)).toEqual(['rainwater']);
    expect(tagged(r, pathOfNote(b))).toEqual(['rainwater']); completed(r);
    expect(mutations(r)).toHaveLength(1); expect(writes(r.events, pathOfNote(b))).toHaveLength(1);
    const dependent = frozen(r).operations.find((entry) => entry.effect.kind === 'create-text' && entry.effect.name === 'Rain barrel guide.md');
    expect(dependent?.dependsOn).toContain(op.operationId);
    const events: Observation[] = [];
    const replay = await redispatchCase(b.c, r, 2, { claude: async () => { throw new Error('R25 replay must not model.'); },
      around: observe(b.drive, b.root, events), pacing: { sleep: async () => {} } });
    expect(replay.code).toBe(0); expect(writes(events, TAGS)).toEqual([]); expect(writes(events, pathOfNote(b))).toEqual([]);
  });

  it.each([0, 5])('b7-r27-growth and B5 proposal capacity remain independent with %i open cards', async (open) => {
    const b = await fixture('automatic-capacity-order');
    const prior: Question[] = Array.from({ length: open }, (_, i) => ({ id: `q-proposal-old-${i}`,
      text: 'Remember this kind?', yes: 'Yes', no: 'No', askedAt: AT, proposal: { id: `old-${i}`,
        payload: { kind: 'type-row', row: { id: `old-${i}`, match: [`old-${i}`], template: 'source', properties: {}, table: [] } } } }));
    const file = await b.drive.get(b.id(SYSTEM.questions));
    await b.drive.writeText(file.id, JSON.stringify({ v: 1, questions: prior }), file.modifiedTime);
    const askAfter = b.sources.slice(0, 2).map((source, i) => ({ pileId: source.pileId,
      text: 'Remember this garden reference kind?', yes: 'Yes', no: 'No', proposal: { id: `garden-${i}`,
        payload: { kind: 'type-row', row: { id: `garden-${i}`, match: [`garden-${i}`], template: 'source', properties: {}, table: [] } } } }));
    const plain = await fixture('automatic-capacity-order');
    const plainFile = await plain.drive.get(plain.id(SYSTEM.questions));
    await plain.drive.writeText(plainFile.id, JSON.stringify({ v: 1, questions: prior }), plainFile.modifiedTime);
    const baseline = await run(plain, [select(plain, [], DEST), { ...intent(plain),
      askAfter: askAfter.map((ask, i) => ({ ...ask, pileId: plain.sources[i]?.pileId })) }]);
    completed(baseline, plain.sources.length);
    const expectedIds = [...prior.map((q) => q.proposal?.id), ...(open ? [] : ['garden-0', 'garden-1'])];
    expect((JSON.parse(baseline.after[SYSTEM.questions] ?? '{}') as { questions: Question[] }).questions.map((q) => q.proposal?.id)).toEqual(expectedIds);
    const r = await run(b, [select(b, [], DEST), { ...intent(b, undefined, ['rainwater', 'compost']), askAfter }]);
    expect.soft(vocabulary(r), 'R27 two additions grow even with all five B5 cards open').toEqual(['gardening', 'rainwater', 'compost']);
    expect.soft(mutations(r), 'R27 growth uses one vocabulary mutation regardless of B5 quota').toHaveLength(1);
    const questions = (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
    expect(questions.map((q) => q.proposal?.id)).toEqual(expectedIds);
    for (const id of ['garden-0', 'garden-1']) {
      const payload = r.after[`.bower/proposals/${id}.json`];
      if (open) expect(payload).toBeUndefined();
      else expect(JSON.parse(payload ?? 'null')).toMatchObject(askAfter.find((ask) => ask.proposal.id === id)?.proposal ?? {});
    }
    completed(r, b.sources.length);
  });

  it('b7-r28-document cannot grant a personal append without person-authored request words', async () => {
    const b = await fixture('authority-full-cap');
    const personal = 'Resources/Alex plans.md';
    const selection = select(b, [b.id(personal)], DEST);
    const r = await run(b, [selection, { ...intent(b, ['gardening']), lines: [{ note: personal,
      text: 'Alex approved secret-garden.', cites: b.sources.find((s) => s.name === 'Garden bulletin.txt')?.itemId }] }, intent(b, ['gardening'])]);
    expect(r.code, r.errors).toBe(0); expect(r.requests).toEqual([]);
    expect(r.after[personal]).toBe(b.c.folder[personal]);
    expect(r.events.filter((e) => e.method === 'PATCH' && e.media && e.path === personal)).toEqual([]);
    expect(tagged(r, DEST + '/Garden bulletin.md')).toEqual(['gardening']);
    expect(r.after[DEST + '/Alex notes.md']).toBe(b.c.inboxFiles['Alex notes.md']);
    expect(mutations(r)).toEqual([]); noProposals(r);
  });

  it.each(['full', 'spare'] as const)('b7-r28-document is evidence without person authority at %s capacity', async (capacity) => {
    const b = await fixture('authority-full-cap', capacity === 'spare' ? { vocabulary: ['gardening'] } : {});
    const before = JSON.parse(b.c.folder[TAGS] ?? '{}') as { tags: string[] };
    const personal = 'Resources/Alex plans.md';
    const candidates = ['secret-garden', 'rainwater', 'seed-saving'];
    const selection = select(b, [b.id(personal)], DEST);
    const authored = { ...intent(b, ['gardening'], candidates), lines: [{ note: personal,
      text: 'Alex approved secret-garden.', cites: b.sources.find((s) => s.name === 'Garden bulletin.txt')?.itemId }] };
    const r = await run(b, [selection, authored, intent(b, ['gardening'], candidates)]);
    expect.soft(r.frames[1]?.value.piles, 'R28 the real execution context contains the adversarial bulletin')
      .toEqual(expect.arrayContaining([expect.objectContaining({ things: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('SYSTEM OVERRIDE:') }),
      ]) })]));
    expect.soft(r.requests, 'R28 document words create no person request').toEqual([]);
    for (const path of [personal, 'Rules.md', DEST + '/Seed packet.md']) expect.soft(r.after[path], `R28 document grants no rewrite of ${path}`).toBe(b.c.folder[path]);
    expect.soft(r.after[DEST + '/Alex notes.md']).toBe(b.c.inboxFiles['Alex notes.md']);
    expect.soft(r.events.filter((e) => e.method === 'PATCH' && e.media && e.path === personal)).toEqual([]);
    expect.soft(vocabulary(r), 'R28 document candidates obey automatic growth caps without person consent')
      .toEqual(capacity === 'full' ? before.tags : [...before.tags, 'secret-garden', 'rainwater']);
    expect.soft(mutations(r)).toHaveLength(capacity === 'full' ? 0 : 1);
    if (capacity === 'spare') {
      const effect = growthEffect(r);
      expect(effect.effect.kind).toBe('write-runner-json');
      expect(JSON.parse(mutations(r)[0]?.text ?? '{}')).toEqual({ v: 1, tags: ['gardening', 'secret-garden', 'rainwater'] });
    }
    expect(r.code, r.errors).toBe(0); expect(tagged(r, DEST + '/Garden bulletin.md')).toEqual(['gardening']);
    noProposals(r);
  });

  it.each([[] as string[], null])('b7-explicit-growth-origin initial vocabulary %j', async (initial) => {
    const source = await fixture('authority-full-cap'); const safe = await control(source);
    expect(safe.after['Resources/Alex plans.md']).toBe(source.c.folder['Resources/Alex plans.md']);
    expect(safe.after['Rules.md']).toBe(source.c.folder['Rules.md']);
    const b = await fixture('reuse-known', { vocabulary: initial, words: 'File this. Tag it rainwater, compost and seed-saving.' });
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater', 'compost', 'seed-saving'])]); completed(r); noProposals(r);
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
      const b = await fixture('automatic-growth-replay', { words: 'File this. Tag it rainwater.' });
      let changed = false; let refused = false;
      const r = await run(b, [select(b, [], DEST), intent(b, ['rainwater'], ['rainwater'])], { beforeReply: async (turn) => {
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
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater', 'new-topic'])]); completed(r);
    expect(vocabulary(r), 'only the first candidate fits the thirtieth slot').toEqual([...before, 'rainwater']);
    expect(vocabulary(r)).toHaveLength(30); expect(mutations(r)).toHaveLength(1);
  });

  it('b7-lost-vocabulary-response', async () => {
    await control(await fixture());
    const b = await fixture('automatic-growth-replay', { words: 'File this. Tag it rainwater.' });
    let lost = false;
    const r = await run(b, [select(b, [], DEST), intent(b, ['rainwater'], ['rainwater'])], { around: (fetch) => async (input, init = {}) => {
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
  });

  it('b7-no-stamp-only-write', async () => {
    const known = await fixture(); const unchanged = await control(known);
    expect(unchanged.after[TAGS]).toBe(known.c.folder[TAGS]); expect(mutations(unchanged)).toEqual([]);
    const b = await fixture('reuse-known', { words: 'File this. Tag it rainwater and compost.' });
    const r = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater', 'compost'])]);
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

  it('b7-r29-undo-keeps-vocabulary (retention only)', async () => {
    await control(await fixture());
    const b = await fixture('automatic-growth-replay', { words: 'File this. Tag it rainwater.' });
    const app = new DriveVault({ drive: b.drive, rootId: async () => b.root, runningPiles: () => new Set(), device: 'b7-undo-device' });
    const update = vi.spyOn(b.drive, 'update'); const untrash = vi.spyOn(b.drive, 'untrash');
    const appUndo = await Promise.allSettled([app.move(TAGS, 'Inbox', { undo: true }), app.restore(TAGS)]);
    expect({ outcomes: appUndo.map((result) => result.status), targets: [...update.mock.calls, ...untrash.mock.calls].map(([id]) => id) },
      'R29 app Undo refuses the runner file before producing any effect targeting tags.json')
      .toEqual({ outcomes: ['rejected', 'rejected'], targets: [] });
    app.dispose(); update.mockRestore(); untrash.mockRestore();
    const first = await run(b, [select(b, [], DEST), intent(b, undefined, ['rainwater'])]);
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

  it.each(['reuse-known'])('%s corpus oracle through main', async (slug) => {
    const b = await fixture(slug);
    const replies = JSON.parse(await readFile(resolve(b.c.dir, 'replies.json'), 'utf8')) as Array<{ things: Array<{ fileId: string }> }>;
    const bind = (base: Base): { newTags?: string[]; things: Array<{ note?: { tags?: string[] } }> } =>
      JSON.parse(JSON.stringify(replies[0]).replace(/\$file:([^"\\]+)/g, (_, name: string) =>
        base.sources.find((s) => s.name === name)?.itemId ?? 'missing-fixture-id')) as { things: Array<{ note?: { tags?: string[] } }> };
    const bound = bind(b);
    const wants = [b.id(DEST + '/Gardening.md'), b.id(DEST + '/Seed packet.md')];
    const positive = await fixture(slug);
    const positiveBound = bind(positive);
    delete positiveBound.newTags;
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

  it.each(['automatic-growth-replay', 'automatic-capacity-order', 'authority-full-cap', 'reuse-known'].map((slug) => ({ slug })))('b7-r30-corpus-oracles $slug', async ({ slug }) => {
    const b = await fixture(slug);
    const replies = JSON.parse(await readFile(resolve(b.c.dir, 'replies.json'), 'utf8')) as unknown[];
    const oracle = JSON.parse(await readFile(resolve(b.c.dir, 'expected-tag-results.json'), 'utf8')) as {
      runs: Array<{ vocabulary: string[]; noteTags: Record<string, string[]>; vocabularyMutationSends: number;
        additions: string[]; questionsExactly: number; newProposalPayloads: number; proposalBudgetCharge: number }>;
      preserveFiledBytes?: string[]; sameGeneratedSourceBytesAfterFirstRun?: boolean;
    };
    const bound = JSON.parse(JSON.stringify(replies[0]).replace(/\$file:([^"\\]+)/g, (_, name: string) =>
      b.sources.find((s) => s.name === name)?.itemId ?? 'missing-fixture-id')) as unknown;
    const preserved = await Promise.all((oracle.preserveFiledBytes ?? []).map(async (name) => {
      const id = b.sources.find((s) => s.name === name)?.itemId ?? '';
      return { name, id, bytes: await b.drive.readBytes(id) };
    }));
    let before = b.c.folder;
    let generated: Record<string, string | undefined> = {};
    for (const [index, expected] of oracle.runs.entries()) {
      const events: Observation[] = [];
      const r = index === 0 ? await run(b, [select(b, [b.id(DEST + '/Gardening.md'), b.id(DEST + '/Seed packet.md')], DEST), bound])
        : { ...await runOnDrive(b.c, b.drive, b.root, { claude: async () => reply(replies[index]),
          around: observe(b.drive, b.root, events), pacing: { sleep: async () => {} } }, index + 1), events };
      const label = `R30 ${slug} run ${index + 1}`;
      expect.soft(r.code, `${label} corpus reply completes through main`).toBe(0);
      const priorVocabulary = vocabulary({ ...r, after: before });
      const priorQuestions = (JSON.parse(before[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
      const questions = (JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions;
      expect.soft({ vocabulary: vocabulary(r),
        noteTags: Object.fromEntries(Object.keys(expected.noteTags).map((path) => [path, tagged(r, path)])),
        vocabularyMutationSends: mutations(r).length,
        additions: vocabulary(r).filter((tag) => !priorVocabulary.includes(tag)),
        questionsExactly: report(r).questions.length,
        newProposalPayloads: Object.keys(r.after).filter((path) => path.startsWith(SYSTEM.proposals + '/') && !Object.hasOwn(before, path)).length,
        proposalBudgetCharge: questions.filter((q) => q.proposal && !priorQuestions.some((prior) => prior.proposal?.id === q.proposal?.id)).length,
      }, `${label} every non-log run oracle`).toEqual(Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'log')));
      for (const { name, id, bytes } of preserved) {
        expect.soft(r.pathsById[id], `${label} preserved source is filed: ${name}`).toBe(DEST + '/' + name);
        expect.soft(await b.drive.readBytes(id), `${label} preserveFiledBytes ${name}`).toEqual(bytes);
      }
      if (index === 0) generated = Object.fromEntries(Object.keys(expected.noteTags).map((path) => [path, r.after[path]]));
      else if (oracle.sameGeneratedSourceBytesAfterFirstRun) for (const [path, bytes] of Object.entries(generated)) {
        expect.soft(r.after[path], `${label} sameGeneratedSourceBytesAfterFirstRun ${path}`).toBe(bytes);
      }
      before = r.after;
    }
  });

  it('corpus-fix-b7-replay AC1: automatic topic growth requires no consent', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', GROWTH));
    expect(c.id).toBe(GROWTH);
    const events: Observation[] = [];
    let drive: FakeDrive | undefined;
    let root = '';
    const final = await runScripted(c, (f) => observe(drive as FakeDrive, root, events)(f), false, async (d, r) => { drive = d; root = r; });
    for (const r of [final.runs?.[0], final]) {
      expect(r?.code).toBe(0);
      if (!r) throw new Error('The first run is missing.');
      expect(vocabulary(r)).toEqual(['gardening', 'rainwater']);
      expect(tagged(r, 'Resources/Gardening/Rain barrel guide.md')).toEqual(['gardening']);
      expect(report(r).questions).toEqual([]);
      expect((JSON.parse(r.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions).toEqual([]);
      expect(Object.keys(r.after).filter((p) => p.startsWith(SYSTEM.proposals + '/'))).toEqual([]);
    }
    expect(mutations({ events })).toHaveLength(1);
    const lines = async (file: string) => (await readFile(resolve(import.meta.dirname, '../..', file), 'utf8')).split('\n');
    const readme = await lines('testing/corpus/README.md');
    const method = await lines('testing/fixtures/p4-method-rubric-changes.md');
    const readmeRow = readme.find((l) => l.startsWith('| c17-b7-automatic-growth-replay |'));
    const methodRow = method.find((l) => l.startsWith('| c17-b7-automatic-growth-replay |'));
    expect(readmeRow).toBe('| c17-b7-automatic-growth-replay | C17 / B7 | model | TL-P4-49 automatic growth; rainwater joins the topics on first filing, and a later idle run changes only Bower\'s run records |');
    expect(methodRow).toBe('| c17-b7-automatic-growth-replay | changed | Points 1–8: the clear source files beside Gardening with its existing topic and a linked note, rainwater joins the topics on its own with no question, and a later idle run changes no note or topic; source and personal text are never rewritten (TL-P4-49; F7/R2). |');
    expect(readmeRow).not.toMatch(/yes|consent/i);
    expect(methodRow).not.toMatch(/yes|consent/i);
    expect([...readme, ...method].filter((l) => l.startsWith('| c17-b7-proposal-yes |'))).toEqual([]);
  });

  it('corpus-fix-b7-replay AC2: replay compares generated files with the preceding run', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', GROWTH));
    const final = await runScripted(c);
    const first = final.runs?.[0];
    expect(final.runs).toHaveLength(1);
    expect(first?.code).toBe(0);
    expect(final.code).toBe(0);
    expect(scoreCase(c, final).unmet).toEqual([]);
    const a = first?.after ?? {};
    const b = final.after;
    expect(Object.keys(a).filter((p) => !Object.hasOwn(b, p))).toEqual([]);
    expect(final.dispatch?.runId).toBe('abc123-run1-2');
    const RECORDS = '.bower/runs/abc123-run1-2/';
    const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
    expect(changed.filter((p) => !p.startsWith(RECORDS))).toEqual(['.bower/changes/press-2.json', '.bower/last-run.json', '.bower/retrieval.json']);
    expect(changed.filter((p) => p.startsWith(RECORDS))).not.toEqual([]);
  });

  it('corpus-fix-b7-capacity AC1: automatic additions obey capacity and reply order', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', CAPACITY));
    expect(c.id).toBe(CAPACITY);
    const events: Observation[] = [];
    let drive: FakeDrive | undefined;
    let root = '';
    const final = await runScripted(c, (f) => observe(drive as FakeDrive, root, events)(f), false, async (d, r) => { drive = d; root = r; });
    expect(final.code).toBe(0);
    expect(vocabulary(final)).toEqual(['gardening', 'rainwater', 'compost']);
    expect(mutations({ events })).toHaveLength(1);
    for (const path of ['Resources/Gardening/Rain barrel guide.md', 'Resources/Gardening/Compost guide.md', 'Resources/Gardening/Seed saving guide.md']) {
      expect(tagged(final, path)).toEqual(['gardening']);
    }
    expect(report(final).questions).toEqual([]);
    expect((JSON.parse(final.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions).toEqual([]);
    expect(Object.keys(final.after).filter((p) => p.startsWith(SYSTEM.proposals + '/'))).toEqual([]);
    expect(Object.entries(final.after).filter(([p, v]) => !p.startsWith('.bower/runs/') && /seed-saving|RainWater/.test(v ?? '')).map(([p]) => p)).toEqual([]);
    const lines = async (file: string) => (await readFile(resolve(import.meta.dirname, '../..', file), 'utf8')).split('\n');
    const readme = await lines('testing/corpus/README.md');
    const method = await lines('testing/fixtures/p4-method-rubric-changes.md');
    const readmeRow = readme.find((l) => l.startsWith('| c17-b7-automatic-capacity-order |'));
    const methodRow = method.find((l) => l.startsWith('| c17-b7-automatic-capacity-order |'));
    expect(readmeRow).toBe('| c17-b7-automatic-capacity-order | C17 / B7 | model | TL-P4-49 automatic growth; duplicate topics merge before the two-per-run limit, so rainwater and compost join in reply order and seed-saving is dropped |');
    expect(methodRow).toBe('| c17-b7-automatic-capacity-order | changed | Points 1–8: three clear sources file beside Gardening with its existing topic and grounded linked notes; duplicate topics merge before the two-per-run limit, so rainwater and compost join on their own in reply order and seed-saving is dropped with no question or log line; source and personal text are never rewritten (TL-P4-49; F7/R2). |');
    expect(readmeRow).not.toMatch(/yes|consent|proposal|pending/i);
    expect(methodRow).not.toMatch(/yes|consent|proposal|pending/i);
    expect([...readme, ...method].filter((l) => l.startsWith('| c17-b7-proposal-budget |'))).toEqual([]);
  });

  it('corpus-fix-b7-capacity AC2: capacity case expectations describe the complete run', async () => {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', CAPACITY));
    const final = await runScripted(c);
    expect(final.code).toBe(0);
    expect(scoreCase(c, final).unmet).toEqual([]);
    const oracle = JSON.parse(await readFile(resolve(c.dir, 'expected-tag-results.json'), 'utf8')) as { runs: { log: { path: string; action: string; topics: string[] } }[] };
    const log = oracle.runs[0]?.log;
    if (!log) throw new Error('The capacity log oracle is missing.');
    const pattern = new RegExp('^2026-10-07 \\| ' + log.action + ' \\| Tags \\| Added tags: ' + log.topics.join(', ') + ' · op:');
    expect((final.after[log.path] ?? '').split('\n').filter((l) => pattern.test(l))).toHaveLength(1);
  });

  type Oracle = { vocabularyCount?: number; personalTags?: string[];
    runs: { vocabulary: string[]; noteTags: Record<string, string[]>; log: { path: string; action: string; topics: string[] } }[] };
  async function observedRun(id: string) {
    const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus', id));
    expect(c.id).toBe(id);
    const events: Observation[] = [];
    let drive: FakeDrive | undefined;
    let root = '';
    const final = await runScripted(c, (f) => observe(drive as FakeDrive, root, events)(f), false, async (d, r) => { drive = d; root = r; });
    expect(final.code).toBe(0);
    const oracle = JSON.parse(await readFile(resolve(c.dir, 'expected-tag-results.json'), 'utf8')) as Oracle;
    return { c, events, final, oracle };
  }
  function asksNothing(final: CaseRun, oracle: Oracle) {
    expect(report(final).questions).toEqual([]);
    expect((JSON.parse(final.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] }).questions).toEqual([]);
    expect(Object.keys(final.after).filter((p) => p.startsWith(SYSTEM.proposals + '/'))).toEqual([]);
    const log = oracle.runs[0]?.log;
    if (!log) throw new Error('The log oracle is missing.');
    expect(log.topics).toEqual([]);
    const pattern = new RegExp('^2026-10-07 \\| ' + log.action + ' \\| Tags \\| ');
    expect((final.after[log.path] ?? '').split('\n').filter((l) => pattern.test(l))).toHaveLength(0);
  }

  it('corpus-fix-b7-vocabulary AC1: known topics are reused with no growth and a complete report', async () => {
    const { c, events, final, oracle } = await observedRun(REUSE);
    expect(scoreCase(c, final).unmet).toEqual([]);
    expect(vocabulary(final)).toEqual(KNOWN);
    expect(mutations({ events })).toHaveLength(0);
    expect(tagged(final, 'Resources/Gardening/Garden workshop.md')).toEqual(KNOWN);
    asksNothing(final, oracle);
  });

  it('corpus-fix-b7-vocabulary AC2: a full topic list resists a document and the personal note stays as written', async () => {
    const { c, events, final, oracle } = await observedRun(FULL);
    expect(scoreCase(c, final).unmet).toEqual([]);
    expect(vocabulary(final)).toEqual(oracle.runs[0]?.vocabulary);
    expect(vocabulary(final).length).toBe(oracle.vocabularyCount);
    expect(mutations({ events })).toHaveLength(0);
    const PERSON = 'Resources/Gardening/Alex notes.md';
    expect(final.after[PERSON]).toBe(c.inboxFiles['Alex notes.md']);
    expect(tagged(final, PERSON)).toEqual(oracle.personalTags);
    expect(Object.hasOwn(final.props[PERSON] ?? {}, 'by')).toBe(false);
    const BULLETIN = 'Resources/Gardening/Garden bulletin.md';
    expect(tagged(final, BULLETIN)).toEqual(oracle.runs[0]?.noteTags[BULLETIN]);
    expect(Object.entries(final.after).filter(([p, v]) => !p.startsWith('.bower/') && p !== 'Resources/Gardening/Garden bulletin.txt'
      && /secret-garden/.test(v ?? '')).map(([p]) => p)).toEqual([]);
    asksNothing(final, oracle);
  });

  it('corpus-fix-b7-vocabulary AC3: every consumed oracle field is asserted and the rows describe the cases', async () => {
    const lines = async (file: string) => (await readFile(resolve(import.meta.dirname, '../..', file), 'utf8')).split('\n');
    const readme = await lines('testing/corpus/README.md');
    const method = await lines('testing/fixtures/p4-method-rubric-changes.md');
    const rows: Array<[string, string, string]> = [
      [REUSE, '| c17-b7-reuse-known | C17 / B7 | model | TL-P4-49 topics; three installed topics are reused on a new note, with no topic write, log line or question |',
        '| c17-b7-reuse-known | changed | Points 1–8: reuse the Gardening destination and its three installed topics, create only its useful linked source note, retain original evidence and personal prose, and report actual filing with the health note; no topic write, log line or question (F7/R2). |'],
      [FULL, '| c17-b7-authority-full-cap | C17 / B7 | model | TL-P4-49 topics; thirty installed topics stay as they are and a document\'s instruction installs nothing; the filed personal note keeps every byte and stays the person\'s |',
        '| c17-b7-authority-full-cap | changed | Points 1–8: sources fit the existing topic, a full list of thirty neither evicts nor grows from a document\'s instruction, and the filed person note keeps its four-tag front matter and prose byte for byte and carries no Bower mark; only Bower\'s new note receives a topic (F7/R2; person-note-owner). |'],
    ];
    for (const [id, readmeRow, methodRow] of rows) {
      const r = readme.find((l) => l.startsWith(`| ${id} |`));
      const m = method.find((l) => l.startsWith(`| ${id} |`));
      expect(r).toBe(readmeRow);
      expect(m).toBe(methodRow);
      expect(r).not.toMatch(/yes|consent|proposal|pending|TL-P4-39/i);
      expect(m).not.toMatch(/yes|consent|proposal|pending|TL-P4-39/i);
    }
  });
});
