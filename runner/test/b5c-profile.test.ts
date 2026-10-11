import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyChanges } from '../../src/data/contracts/note-edit';
import type { Change } from '../../src/data/contracts/run-manifest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { note, run, select, setup } from './b1-planning-support';
import { AT } from './corpus-run';

const PROFILE = 'Areas/Career/Career profile.md';
const SOURCE = 'Alex CV.txt';
const PREVIOUS = 'Alex uses JavaScript. [[Earlier CV]]\n';
const NEXT = 'Alex uses TypeScript. [[Alex CV.txt]]\n';
const PERSONAL = '## My notes\nAlex keeps these words: café.\n';
const HISTORY = '## Timeline\n- 2026-10-01 · Read the earlier CV · [[Earlier CV]]\n';
const REGION = `<!-- bower:ownership/2 begin profile -->\n${PREVIOUS}<!-- bower:ownership/2 end profile -->\n`;
const bytes = (text: string) => new TextEncoder().encode(text);
const change: Change = { kind: 'profile-rewrite', recordIds: [], previous: PREVIOUS, text: NEXT };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// The provider has no profile intent yet. Exercise its real filing path, then the existing note-edit guard;
// this is guard evidence only, not a claim that main already plans profile updates.
async function filedProfile(owned: boolean) {
  const framed = (key: string, text: string) => `<!-- bower:ownership/2 begin ${key} -->\n${text}<!-- bower:ownership/2 end ${key} -->\n`;
  const before = note('Alex uses TypeScript.',
    framed('current', '## Current state\n- Alex uses JavaScript.\n')
    + framed('personal', PERSONAL) + framed('timeline', HISTORY)
    + framed('bower-note', "## Bower's note\nEarlier CV saved.\n") + REGION, owned)
    .replace('summary:', 'bower_format: ownership/2\nsummary:');
  const b = await setup({ folder: {
    [PROFILE]: before,
    'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true),
    'Projects/Job hunt/Job hunt.md': note('Job hunt.', 'Alex keeps the shortlist.\n', true),
  }, inbox: [{ line: '', files: [SOURCE] }], inboxFiles: { [SOURCE]: 'Alex uses TypeScript.\n' } });
  const id = b.sources.find((source) => source.name === SOURCE)?.itemId;
  expect(id).toBeDefined();
  const result = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), {
    kind: 'tidy-intent', v: 1,
    things: [{ fileId: id, to: 'Areas/Career', name: SOURCE,
      note: { name: 'Alex CV.md', summary: 'Alex uses TypeScript.', body: 'Alex uses TypeScript.' } }],
  }]);
  expect(result.code, result.errors).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(result.after[`Areas/Career/${SOURCE}`]).toBe('Alex uses TypeScript.\n');
  expect(result.after[PROFILE]).toBe(before);
  expect(result.after['Projects/Job hunt/Job hunt.md']).toBe(b.c.folder['Projects/Job hunt/Job hunt.md']);
  expect(result.frames[1]?.value.allowedTargets).toMatchObject({ [id ?? '']: expect.arrayContaining([b.id(PROFILE)]) });
  expect(parseOwnership(bytes(before)).status).toBe('v2');
  return before;
}

async function ownedControl() {
  const before = await filedProfile(true);
  const input = bytes(before);
  const copy = input.slice();
  const result = applyChanges(input, [change]);
  expect(result).toMatchObject({ ok: true, text: before.replace(PREVIOUS, NEXT) });
  expect(input).toEqual(copy);
  if (result.ok) {
    expect(result.text).toContain(PERSONAL);
    expect(result.text).toContain(HISTORY);
  }
}

it('b5-person-profile-not-adopted control: resolved Bower-owned region updates without changing personal/history bytes',
  ownedControl);

it('b5-person-profile-not-adopted', async () => {
  await ownedControl();
  const before = await filedProfile(false);
  const input = bytes(before);
  const copy = input.slice();
  expect(applyChanges(input, [change]), 'a profile-shaped mark never grants ownership of a personal note')
    .toEqual({ ok: false, reason: 'not-bower' });
  expect(input).toEqual(copy);
});

// Addendum 12: words on the existing item; targets belong to the script's row declaration.
import { currentStateOf, stateMark, STATE_READ, STATE_WRITE, undoChanges, undoEdit } from '../../src/data/contracts/note-edit';
import { typeRowOk } from '../../src/data/contracts/note-format';
import type { ManifestV2 } from '../../src/data/contracts/run-manifest';
import { NOTE_TEMPLATES } from '../../src/data/contracts/note-templates';
import { media, type Base } from './b1-planning-support';
import { redispatchCase } from './corpus-run';
import { readFileSync } from 'node:fs';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { paging } from './drive-v3';
const initialPaging = paging.size;
beforeEach(() => { paging.size = 1000; });
afterEach(() => { paging.size = initialPaging; });

const TABLE = '.bower/type-table.json';
const JOB = 'Projects/Job hunt/Job hunt.md';
const DECOY = 'Projects/Greenhouse repair/Greenhouse repair.md';
const FACT = 'Alex uses TypeScript.';
const framed = (key: string, text: string) =>
  `<!-- bower:ownership/2 begin ${key} -->\n${text}<!-- bower:ownership/2 end ${key} -->\n`;
const profileNote = () => note(FACT, '## Current state\n' + framed('current', '- Alex uses JavaScript.\n')
  + framed('personal', PERSONAL) + framed('timeline', HISTORY)
  + framed('bower-note', "## Bower's note\nEarlier CV saved.\n") + REGION, true)
  .replace('summary:', 'bower_format: ownership/2\nsummary:')
  .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['Alex uses JavaScript.'])}\n`);
const declaration = (kind = 'cv') => ({ id: kind, match: [kind], template: 'source',
  properties: {}, table: [], profile: { template: 'profile' } });

async function profileBase(options: { names?: string[]; text?: string; missing?: boolean; kind?: string } = {}) {
  const names = options.names ?? [SOURCE];
  const b = await setup({ folder: {
    ...(!options.missing ? { [PROFILE]: profileNote() } : {}),
    'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true),
    [JOB]: note('Alex searches for a TypeScript role.', '## Timeline\n', true),
    [DECOY]: note('Alex repairs a greenhouse.', '## Timeline\n', true),
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) =>
      [`Areas/Career/Neighbour ${i}.md`, note(FACT, 'Alex uses TypeScript.\n')])),
  }, inbox: [{ line: '', files: names }],
  inboxFiles: Object.fromEntries(names.map((name, i) => [name, options.text ?? `${FACT}\n${i ? 'Alex uses SQL.\n' : ''}`])) });
  if (!options.missing) await b.drive.update(b.id(PROFILE), { appProperties: { profile: options.kind ?? 'cv' } });
  const table = JSON.stringify({ v: 1, rows: [declaration(options.kind)] });
  await b.drive.createText(b.id('.bower'), 'type-table.json', table);
  b.c.folder[TABLE] = table;
  return b;
}
function itemReply(b: Base, sentences?: number[], to = 'Areas/Career', body = FACT) {
  return { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to, name: s.name,
    note: { name: s.name.replace(/\.[^.]+$/, '.md'), summary: FACT, body },
    ...(sentences === undefined ? {} : { profile: sentences.map((sentence) => ({ source: s.itemId, sentence })) }),
  })) };
}
async function mainProfile(b: Base, sentences: number[], options: Parameters<typeof run>[2] = {}, wants?: string[]) {
  const selection = select(b, wants ?? (b.c.folder[PROFILE] ? [b.id(PROFILE)] : []), 'Areas/Career');
  const row = (JSON.parse(b.c.folder[TABLE] ?? '{}') as { rows: Array<{ id: string }> }).rows[0];
  for (const item of selection.items) item.kind = row?.id ?? 'unknown';
  const result = await run(b, [selection, itemReply(b, sentences)], options);
  expect(result.code, `main must admit the ruled per-item profile references: ${result.errors}`).toBe(0);
  expect(result.frames, 'selection and execution without schema retries').toHaveLength(2);
  return result;
}
function edits(result: Awaited<ReturnType<typeof run>>, id: string) {
  const runId = result.dispatch?.runId;
  expect(runId, 'profile edits belong to the current dispatch').toBeDefined();
  const text = Object.entries(result.after).find(([path]) =>
    path.startsWith(`.bower/runs/${runId}/`) && /\/manifest-[^/]+\.json$/.test(path))?.[1];
  expect(text, 'the current dispatch has a retained manifest').toBeDefined();
  const value = JSON.parse(text ?? '') as ManifestV2;
  return value.operations.flatMap((op) => op.effect.kind === 'edit-text' && op.effect.before.fileId === id ? [op.effect] : []);
}

function copied(result: Awaited<ReturnType<typeof run>>, text: string, path = PROFILE) {
  const ownership = parseOwnership(bytes(result.after[path] ?? ''));
  expect(ownership.status).toBe('v2');
  const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
  expect(span).toBeDefined();
  expect(new TextDecoder().decode(bytes(result.after[path] ?? '').subarray(span?.start, span?.end))).toBe(text);
}

function preserved(b: Base, result: Awaited<ReturnType<typeof run>>) {
  expect(result.after[PROFILE]).toContain(PERSONAL); expect(result.after[PROFILE]).toContain(HISTORY);
  expect(result.after[JOB]).toBe(b.c.folder[JOB]); expect(result.after[DECOY]).toBe(b.c.folder[DECOY]);
}
async function ordinaryControl(names = [SOURCE], body = FACT) {
  const b = await profileBase({ names });
  const result = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), itemReply(b, undefined, 'Areas/Career', body)]);
  expect(result.code, result.errors).toBe(0); expect(result.frames).toHaveLength(2);
  for (const name of names) expect(result.after[`Areas/Career/${name}`]).toBe(b.c.inboxFiles[name]);
  expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]); preserved(b, result);
  return { b, result };
}
async function rejectedProfile(b: Base, sentences: number[], reason: RegExp) {
  const result = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), itemReply(b, sentences), itemReply(b)]);
  expect(result.code, 'valid retry files the source').toBe(0); expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
  expect(result.frames).toHaveLength(3);
  expect.soft(result.frames[2]?.call.input.split('\n').find((line) => line.startsWith('Your reply was refused:')), 'content refusal, not unknown item keys').toMatch(reason);
  return result;
}

async function corpusProfile(slug: string, control = false) {
  const b = await setup({ fixture: slug });
  const kind = slug.endsWith('cv-profile') ? 'cv' : 'offer';
  const rows = [declaration(kind)];
  await b.drive.update(b.id(PROFILE), { appProperties: { profile: kind } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows }));
  const replies = JSON.parse(readFileSync(new URL(`../../harness/corpus/${slug}/replies.json`, import.meta.url), 'utf8')) as
    Array<{ things: Array<{ profile?: string }> }>;
  if (control) for (const intent of replies) for (const thing of intent.things) delete thing.profile;
  let bound = JSON.stringify(replies[0]);
  for (const source of b.sources) bound = bound.replaceAll(`$file:${source.name}`, source.itemId);
  const cv = slug.endsWith('cv-profile');
  const parent = cv ? 'Areas/Career' : 'Projects/Job hunt';
  const hub = cv ? 'Areas/Career/Career.md' : JOB;
  const selection = { items: b.sources.map((source) => ({ itemId: source.itemId, kind: cv ? 'cv' : 'offer',
    destination: { parentId: b.id(parent), name: cv ? 'Originals' : 'Offers' },
    wants: [b.id(PROFILE), b.id(hub)],
  })), asks: [] };
  const result = await run(b, [selection, JSON.parse(bound) as unknown]);
  return { b, result, errors: result.errors };
}

it('b5-cv-profile-through-main control: sourced note and bounded region author work', async () => {
  await ordinaryControl();
  const corpus = await corpusProfile('c17-b56-cv-profile', true);
  expect(corpus.result.code, corpus.errors).toBe(0);
  expect(corpus.result.after[PROFILE]).toBe(corpus.b.c.folder[PROFILE]);
  const before = profileNote();
  expect(applyChanges(bytes(before), [change])).toMatchObject({ ok: true, text: before.replace(PREVIOUS, NEXT) });
  expect(applyChanges(bytes(before), [{ ...change, text: `${Array(398).fill('TypeScript').join(' ')} [[Alex CV.txt]]\n` }]).ok).toBe(true);
  expect(applyChanges(bytes(before), [{ ...change, text: `${Array(399).fill('TypeScript').join(' ')} [[Alex CV.txt]]\n` }]).ok).toBe(false);
});
it('b5-cv-profile-through-main', async () => {
  await rejectedProfile(await profileBase({ text: 'Alex earned 987654 credits.' }),
    [1], /profile.*reference|offered/i);
  await rejectedProfile(await profileBase({ text: `${Array(401).fill('TypeScript').join(' ')}.` }),
    [1], /ungrounded or overlong profile plan/i);
  const cv = await setup({ fixture: 'c17-b56-cv-profile' });
  await cv.drive.update(cv.id(PROFILE), { appProperties: { profile: 'cv' } });
  await cv.drive.createText(cv.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [declaration()] }));
  const replies = JSON.parse(readFileSync(new URL('../../harness/corpus/c17-b56-cv-profile/replies.json', import.meta.url), 'utf8')) as
    Array<{ things: Array<{ profile: Array<{ source: string; sentence: number }> }> }>;
  const span = 'Achievement: shipped an offline map editor.';
  expect(cv.c.inboxFiles[SOURCE]).toContain(span);
  for (const intent of replies) for (const thing of intent.things) thing.profile = [{ source: `$file:${SOURCE}`, sentence: 1 }];
  let bound = JSON.stringify(replies[0]);
  for (const source of cv.sources) bound = bound.replaceAll(`$file:${source.name}`, source.itemId);
  const selection = { items: cv.sources.map((source) => ({ itemId: source.itemId, kind: 'cv',
    destination: { parentId: cv.id('Areas/Career'), name: 'Originals' },
    wants: [cv.id(PROFILE), cv.id('Areas/Career/Career.md')],
  })), asks: [] };
  const corpus = await run(cv, [selection, JSON.parse(bound) as unknown]);
  expect.soft(corpus.code, 'CV corpus main admits the whole referenced source sentence').toBe(0);
  expect(corpus.frames).toHaveLength(2);
  expect.soft(corpus.after[PROFILE]).toContain(framed('profile', `${span} [[Areas/Career/Originals/Alex CV.txt]]\n[[Career]]\n`));
  const b = await profileBase(); const result = await mainProfile(b, [1]);
  copied(result, `${FACT} [[Areas/Career/${SOURCE}]]\n[[Earlier CV]]\n`); expect(result.after[PROFILE]).toMatch(/\[\[[^\]]*Alex CV/);
  expect(result.after[PROFILE]).not.toContain(PREVIOUS); preserved(b, result);
});

it('b5-profile-five-note-budget control: selected notes use the shared read cache', async () => {
  const { b, result } = await ordinaryControl([SOURCE, 'Second CV.txt']);
  expect(media(result, b.id(PROFILE))).toHaveLength(1);
  const allowed = result.frames[1]?.value.allowedTargets as Record<string, string[]>;
  for (const s of b.sources) expect(allowed[s.itemId]).toContain(b.id(PROFILE));
});
it('b5-profile-five-note-budget', async () => {
  const b = await profileBase({ names: [SOURCE, 'Second CV.txt'] });
  const wants = [b.id(PROFILE), b.id('Areas/Career/Career.md'), ...Array.from({ length: 3 }, (_, i) => b.id(`Areas/Career/Neighbour ${i}.md`))];
  const planningReads: URL[] = [];
  const result = await mainProfile(b, [1], { around: (fetch) => async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if ((!init?.method || init.method === 'GET') && url.pathname === `/drive/v3/files/${b.id(PROFILE)}`
      && url.searchParams.get('alt') === 'media' && !new Headers(init?.headers).has('Range')
      // The persisted manifest ends planning; later reads include the required apply fence.
      && !(await b.drive.listAll(b.root)).some((f) => /\/manifest-[^/]+\.json$/.test(b.drive.pathOf(f.id, b.root)))) {
      planningReads.push(url);
    }
    return fetch(input, init);
  } }, wants);
  const allowed = result.frames[1]?.value.allowedTargets as Record<string, string[]>;
  for (const s of b.sources) { expect(allowed[s.itemId]).toContain(b.id(PROFILE)); expect((allowed[s.itemId] ?? []).filter((id) => id !== b.id('Areas/Career')).length).toBeLessThanOrEqual(5); }
  expect(planningReads).toHaveLength(1); expect(edits(result, b.id(PROFILE))).toHaveLength(1);
  copied(result, `${FACT} [[Areas/Career/${SOURCE}]]\n${FACT} [[Areas/Career/Second CV.txt]]\n[[Earlier CV]]\n`);
  const saturated = await profileBase({ names: [SOURCE, 'Second CV.txt'] });
  const over = await run(saturated, [select(saturated, [...wants, saturated.id('Areas/Career/Neighbour 3.md')], 'Areas/Career')]);
  expect(over.code, 'six requested notes refused before execution').toBe(1);
  expect(over.after[PROFILE]).toBe(saturated.c.folder[PROFILE]);
});

it('b5-two-cvs-one-edit control: two CVs file and the existing author can restore previous region bytes', async () => {
  await ordinaryControl([SOURCE, 'Second CV.txt']); const before = profileNote(); const changed = applyChanges(bytes(before), [change]);
  expect(changed.ok).toBe(true);
  if (changed.ok) expect(applyChanges(bytes(changed.text), [{ ...change, previous: NEXT, text: PREVIOUS }])).toMatchObject({ ok: true, text: before });
});
it('b5-two-cvs-one-edit', async () => {
  const b = await profileBase({ names: [SOURCE, 'Second CV.txt'] }); const result = await mainProfile(b, [1]);
  copied(result, `${FACT} [[Areas/Career/${SOURCE}]]\n${FACT} [[Areas/Career/Second CV.txt]]\n[[Earlier CV]]\n`);
  const planned = edits(result, b.id(PROFILE)); expect(planned).toHaveLength(1);
  expect(planned[0]?.changes?.filter((c) => c.kind === 'profile-rewrite')).toHaveLength(1);
  expect(result.after[PROFILE]).toMatch(/\[\[[^\]]*Alex CV/); expect(result.after[PROFILE]).toMatch(/\[\[[^\]]*Second CV/);
  const version = (await b.drive.get(b.id(PROFILE))).modifiedTime;
  const replay = await redispatchCase(b.c, result, 2, { pacing: { sleep: async () => undefined } });
  expect((await b.drive.get(b.id(PROFILE))).modifiedTime).toBe(version);
  if (planned[0]) expect(await undoEdit(planned[0], bytes(result.after[PROFILE] ?? ''))).toMatchObject({ ok: true, text: b.c.folder[PROFILE] });
  expect(replay.code).toBe(0); expect(replay.after[PROFILE]).toBe(result.after[PROFILE]);
  expect(planned[0]?.changes?.find((c) => c.kind === 'profile-rewrite')).toMatchObject({ previous: PREVIOUS });
});

it('b5-first-document-creates-profile control: rows without profile and original templates remain accepted', async () => {
  const { profile: _profile, ...row } = declaration(); expect(typeRowOk(row)).toBe(true);
  expect(Object.keys(NOTE_TEMPLATES)).toEqual(expect.arrayContaining(['source', 'concept', 'project', 'area', 'moc']));
  await ordinaryControl();
});
it('b5-first-document-creates-profile', async () => {
  expect(typeRowOk(declaration()), 'strict new row accepts the optional profile declaration').toBe(true);
  expect(NOTE_TEMPLATES, 'shared templates contain the approved profile').toHaveProperty('profile');
  const unsafe = await profileBase({ missing: true });
  const refusal = await run(unsafe, [select(unsafe, [], 'Areas/Career'),
    itemReply(unsafe, [999]), itemReply(unsafe)]);
  expect(refusal.code, 'ungrounded creation retry still files the source').toBe(0);
  expect(Object.values(refusal.after).some((text) => text.includes('begin profile'))).toBe(false);
  const ambiguous = await profileBase({ missing: true });
  const a = await ambiguous.drive.createText(ambiguous.id('Areas/Career'), 'Career profile.md', profileNote(), { by: 'bower', profile: 'cv' });
  const b2 = await ambiguous.drive.createText(ambiguous.id('Areas/Career'), 'Career profile.md', profileNote(), { by: 'bower', profile: 'cv' });
  const omitted = await mainProfile(ambiguous, [1]);
  expect(await ambiguous.drive.readText(a.id)).toBe(profileNote());
  expect(await ambiguous.drive.readText(b2.id)).toBe(profileNote());
  expect(omitted.after[`Areas/Career/${SOURCE}`]).toBe(`${FACT}\n`);
  const b = await profileBase({ missing: true }); const first = await mainProfile(b, [1]);
  const profiles = [];
  for (const file of await b.drive.listAll(b.root)) if (!file.folder && file.name.endsWith('.md')
    && (await b.drive.readText(file.id)).includes('begin profile')) profiles.push(file);
  expect(profiles).toHaveLength(1);
  copied(first, `${FACT} [[Areas/Career/${SOURCE}]]\n`, b.drive.pathOf(profiles[0]?.id ?? '', b.root));
  const stored = JSON.parse(first.after[TABLE] ?? 'null') as { rows: Array<{ profile: { template: string } }> };
  expect(stored.rows[0]?.profile).toEqual({ template: 'profile' });
  expect(first.after[TABLE]).toBe(b.c.folder[TABLE]);
  expect(profiles[0]?.appProperties?.profile).toBe('cv');
  const next = await redispatchCase(b.c, first, 2, { pacing: { sleep: async () => undefined } });
  expect(next.after[TABLE]).toBe(first.after[TABLE]);
  expect(next.after[TABLE]).toBe(b.c.folder[TABLE]);
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv')).toHaveLength(1);
  const later = await b.drive.createText(b.id('Inbox'), 'Later CV.txt', 'Alex uses TypeScript and SQL.\n');
  const admitted = await planAdmission(fakeRead(b.drive), b.root, { scope: 'all', clock: () => AT + 1, newId: () => 'later-profile-cv' });
  expect(admitted.kind).toBe('manifest');
  if (admitted.kind === 'manifest') {
    const source = admitted.manifest.piles.find((p) => p.items.some((i) => i.fileId === later.id));
    expect(source).toBeDefined();
    b.sources = [{ itemId: later.id, pileId: source?.pileId ?? '', name: later.name }];
    b.admission = admitted.manifest;
    b.c.folder[TABLE] = first.after[TABLE] ?? '';
    const id = profiles[0]?.id ?? '';
    const selection = { items: [{ itemId: later.id, kind: 'cv', destination: b.id('Areas/Career'), wants: [id] }], asks: [] };
    const reused = await run(b, [selection, itemReply(b, [1])], { press: 2 });
    expect(reused.code).toBe(0);
    expect(edits(reused, id)).toHaveLength(1);
    copied(reused, `Alex uses TypeScript and SQL. [[Areas/Career/Later CV.txt]]\n[[Areas/Career/${SOURCE}]]\n`,
      b.drive.pathOf(id, b.root));
    expect(reused.after[TABLE]).toBe(first.after[TABLE]);
  }
});

it('b5-offer-factual-comparison control: sourced comparison uses real profile links', async () => {
  const { b, result, errors } = await corpusProfile('c17-b56-offer-job-search', true);
  expect(result.code, errors).toBe(0);
  expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
  expect(result.after[DECOY]).toBe(b.c.folder[DECOY]);
  expect(result.after['Projects/Job hunt/Offers/Ferrowick offer.md']).toContain('48000');
});
it('b5-offer-factual-comparison', async () => {
  for (const body of ['Ferrowick offers 48000 EUR.', 'This offer scores 7 out of 10.',
    'Alex should accept this offer.', 'Ferrowick offers TypeScript. [[Greenhouse repair]]']) {
    const badBase = await profileBase({ names: ['Offer.txt'], kind: 'offer', text: 'Ferrowick offers a TypeScript role at 48000. Currency is not stated.\n' });
    const bad = itemReply(badBase, undefined, 'Projects/Job hunt', body);
    const retry = itemReply(badBase, undefined, 'Projects/Job hunt', 'Ferrowick offers a TypeScript role at 48000.');
    const refused = await run(badBase, [select(badBase, [badBase.id(PROFILE), badBase.id(JOB)], 'Projects/Job hunt'), bad, retry]);
    expect(refused.code, `valid offer retry: ${refused.errors}`).toBe(0);
    expect.soft(refused.frames[2]?.call.input ?? '', `unsupported offer words: ${body}`).toMatch(/Your reply was refused:/);
    expect(refused.after[PROFILE]).toBe(badBase.c.folder[PROFILE]);
  }
  const b = await profileBase({ names: ['Offer.txt'], kind: 'offer', text: 'Ferrowick offers a TypeScript role at 48000. Currency is not stated.\n' });
  const selection = select(b, [b.id(PROFILE), b.id(JOB)], 'Projects/Job hunt');
  const good = { kind: 'tidy-intent', v: 1, things: [{ fileId: b.sources[0]?.itemId, to: 'Projects/Job hunt', name: 'Offer.txt',
    note: { name: 'Offer.md', summary: 'Ferrowick offers a TypeScript role.', body: 'Ferrowick offers a TypeScript role at 48000. Alex uses TypeScript. [[Career profile]] [[Job hunt]]' }, profile: [{ source: b.sources[0]?.itemId, sentence: 1 }] }] };
  const result = await run(b, [selection, good]);
  expect(result.code, 'offer item admits region words').toBe(0);
  expect(result.after[PROFILE], 'offer cannot mutate biography').toBe(b.c.folder[PROFILE]); expect(result.after[DECOY]).toBe(b.c.folder[DECOY]);
  expect(result.after['Projects/Job hunt/Offer.md']).toContain('48000');
  expect(result.after['Projects/Job hunt/Offer.md']).not.toMatch(/EUR|USD|7 out of 10|should|Greenhouse repair/);

});

it('b5-profile-current-state-edit control: C05 mark, person edit, yes, no and undo retain their bounds', async () => {
  const b = await profileBase();
  const proposed = { ...itemReply(b), states: [{ note: PROFILE, lines: [FACT], cites: b.sources[0]?.itemId }],
    lines: [{ note: PROFILE, text: FACT, cites: b.sources[0]?.itemId }] };
  const actual = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), proposed]);
  expect(actual.code, actual.errors).toBe(0);
  expect(currentStateOf(bytes(actual.after[PROFILE] ?? ''))).toMatchObject({ owner: 'bower', lines: [FACT] });
  expect(actual.after[PROFILE]).toContain(HISTORY);
  expect(actual.after[PROFILE]).toMatch(/\[\[[^\]]*Alex CV/);
  const before = profileNote();
  const state: Change = { kind: 'state-rewrite', recordIds: ['answer-yes'], previous: ['Alex uses JavaScript.'], lines: [FACT] };
  const written = applyChanges(bytes(before), [state]); expect(written.ok).toBe(true); if (!written.ok) return;
  expect(currentStateOf(bytes(written.text))).toMatchObject({ owner: 'bower', lines: [FACT] });
  const person = written.text.replace('- Alex uses TypeScript.', '- Alex keeps the search paused.');
  const changed: Change = { ...state, previous: ['Alex keeps the search paused.'] };
  expect(applyChanges(bytes(person), [changed])).toMatchObject({ ok: false, reason: 'person-edited' });
  const granted: Change = { ...changed, granted: { answer: 'answer-yes', mark: stateMark([FACT]) } };
  const yes = applyChanges(bytes(person), [granted]); expect(yes.ok).toBe(true);
  if (yes.ok) expect(applyChanges(bytes(yes.text), undoChanges([granted]))).toMatchObject({ ok: true, text: person });
  expect(STATE_WRITE).toEqual({ lines: 8, line: 200 }); expect(STATE_READ).toEqual({ lines: 20, line: 400 });
});
it('b5-profile-current-state-edit', async () => {
  const b = await profileBase(); const intent = { ...itemReply(b, [1]), states: [{ note: PROFILE, lines: [FACT], cites: b.sources[0]?.itemId }] };
  const first = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), intent]);
  expect(first.code, 'profile and C05 share ordinary note effects').toBe(0);
  copied(first, `${FACT} [[Areas/Career/${SOURCE}]]\n[[Earlier CV]]\n`);
  expect(currentStateOf(bytes(first.after[PROFILE] ?? ''))).toMatchObject({ owner: 'bower', lines: [FACT] });
  expect(first.after[PROFILE]).toMatch(/\[\[[^\]]*Alex CV/); expect(first.after[PROFILE]).toContain(HISTORY);
  const file = await b.drive.get(b.id(PROFILE)); const person = (first.after[PROFILE] ?? '').replace('- Alex uses TypeScript.', '- Alex keeps the search paused.');
  await b.drive.writeText(file.id, person, file.modifiedTime);
  const replay = await redispatchCase(b.c, first, 2, { pacing: { sleep: async () => undefined } }); expect(replay.after[PROFILE]).toBe(person);
  expect(STATE_WRITE).toEqual({ lines: 8, line: 200 }); expect(STATE_READ).toEqual({ lines: 20, line: 400 });
});

it('b5-profile-document-authority control: grounded inventory facts file without teaching schema', async () => {
  await ordinaryControl(['Certificate.txt', 'Identity document.txt']);
});
it('b5-profile-document-authority', async () => {
  const b = await profileBase({ kind: 'certificate', names: ['Certificate.txt'], text: 'Alex uses TypeScript. Alex has a TypeScript certificate.\n' });
  await rejectedProfile(b, [999], /profile.*reference|offered/i);
  const identity = await profileBase({ kind: 'identity-document', names: ['Identity document.txt'], text: 'Alex uses TypeScript. Alex has an identity document. Identity number ID-884422.\n' });
  await rejectedProfile(identity, [3], /profile.*reference|offered/i);
  const qualified = await profileBase({ kind: 'certificate', names: ['Certificate.txt'], text: 'Alex uses TypeScript. Alex has a TypeScript certificate.\n' });
  const result = await mainProfile(qualified, [2]);
  copied(result, 'Alex has a TypeScript certificate. [[Areas/Career/Certificate.txt]]\n[[Earlier CV]]\n');
});

it('b5-profile-read-to-act-fence control: unchanged inputs file with settled outcomes', async () => {
  const { result } = await ordinaryControl(); expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
});
it('b5-profile-read-to-act-fence', async () => {
  const stable = await profileBase(); const control = await mainProfile(stable, [1]); expect(edits(control, stable.id(PROFILE))).toHaveLength(1);
  copied(control, `${FACT} [[Areas/Career/${SOURCE}]]\n[[Earlier CV]]\n`);
  for (const race of ['bytes', 'name', 'place'] as const) {
    const b = await profileBase(); const id = b.id(PROFILE); let raced = false;
    const result = await mainProfile(b, [1], { around: (fetch) => async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      if (!raced && (!init?.method || init.method === 'GET') && url.pathname.endsWith(`/files/${id}`) && url.searchParams.get('alt') !== 'media'
        && (await b.drive.listAll(b.root)).some((f) => /\/manifest-[^/]+\.json$/.test(b.drive.pathOf(f.id, b.root)))) {
        raced = true; const file = await b.drive.get(id);
        if (race === 'bytes') await b.drive.writeText(id, profileNote().replace(PERSONAL, `${PERSONAL}A later thought.\n`), file.modifiedTime);
        else if (race === 'name') await b.drive.update(id, { name: 'Renamed profile.md' });
        else await b.drive.update(id, { addParent: b.id('Projects/Job hunt'), removeParent: file.parents[0] });
      }
      return fetch(input, init);
    } });
    expect(raced).toBe(true); expect(await b.drive.readText(id)).toContain(REGION);
    const report = result.lastRun as { run: { report?: { updated?: Array<{ path: string }> } } };
    expect(report.run.report?.updated?.some((row) => row.path === PROFILE) ?? false).toBe(false);
  }
});

it('b5-profile-template-compatibility control: real links and personal typed Source/MOC edits work', async () => {
  await ordinaryControl([SOURCE], `${FACT} [[Career profile]]`);
  const immutable = note(FACT, '[[Earlier CV]]\n', true).replace('summary:', 'type: source\nsummary:');
  expect(applyChanges(bytes(immutable), [{ kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Earlier CV', to: 'Alex CV' }] }]).ok).toBe(false);
  for (const type of ['source', 'moc']) {
    const before = note(FACT, '[[Earlier CV]]\n').replace('summary:', `type: ${type}\nsummary:`);
    expect(applyChanges(bytes(before), [{ kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Earlier CV', to: 'Alex CV' }] }]).ok).toBe(true);
  }
});
it('b5-profile-template-compatibility', async () => {
  await rejectedProfile(await profileBase(), [999], /profile.*reference|offered/i);
  const b = await profileBase(); const result = await mainProfile(b, [1]); expect(result.after[PROFILE]).toContain('begin profile');
  copied(result, `${FACT} [[Areas/Career/${SOURCE}]]\n[[Earlier CV]]\n`);
  const sourcePath = 'Areas/Career/Alex CV.md'; expect(result.after[sourcePath]).toBeDefined();
  const replay = await redispatchCase(b.c, result, 2, { pacing: { sleep: async () => undefined } });
  expect(replay.after[sourcePath]).toBe(result.after[sourcePath]); preserved(b, result);
});

// Addendum 14: identity comes from the run listing's app property, never a stored Drive id.
async function propertyRun(b: Base, sentences?: number[], press = 1) {
  const selection = select(b, [], 'Areas/Career');
  for (const item of selection.items) item.kind = 'cv';
  const result = await run(b, [selection, itemReply(b, sentences), itemReply(b)], { press });
  expect(result.code, result.errors).toBe(0);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  for (const source of b.sources) expect(result.after[`Areas/Career/${source.name}`]).toBe(b.c.inboxFiles[source.name]);
  expect(result.after[TABLE]).toBe(b.c.folder[TABLE]);
  return result;
}

it('b5-profile-property-first-create control: ordinary document filing creates no profile', async () => {
  const b = await profileBase({ missing: true });
  const result = await propertyRun(b);
  expect(result.errors).toBe(''); expect(result.frames).toHaveLength(2);
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv')).toHaveLength(0);
});
it('b5-profile-property-first-create', async () => {
  const b = await profileBase({ missing: true });
  const result = await propertyRun(b, [1]);
  const profiles = (await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv');
  expect(profiles, 'first document creates exactly one profile carrying the row id').toHaveLength(1);
  const profile = profiles[0]; expect(profile).toBeDefined(); if (!profile) return;
  const text = await b.drive.readText(profile.id);
  copied(result, `${FACT} [[Areas/Career/${SOURCE}]]\n`, b.drive.pathOf(profile.id, b.root));
  expect(text).toContain('begin profile'); expect(text).toContain(FACT); expect(text).toMatch(/\[\[[^\]]*Alex CV/);
  expect(parseOwnership(bytes(text)).status).toBe('v2');
  expect(result.errors).toBe(''); expect(result.frames).toHaveLength(2);
  await redispatchCase(b.c, result, 2, { pacing: { sleep: async () => undefined } });
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv')).toHaveLength(1);
});

async function laterDocument() {
  const b = await profileBase();
  await propertyRun(b);
  // Model a profile from an earlier tidy-up; neither its title nor its location identifies it.
  await b.drive.update(b.id(PROFILE), { name: 'Earlier skills.md', addParent: b.id('Projects/Job hunt'),
    removeParent: b.id('Areas/Career') });
  const later = await b.drive.createText(b.id('Inbox'), 'Later CV.txt', 'Alex uses TypeScript and SQL.\n');
  const admitted = await planAdmission(fakeRead(b.drive), b.root,
    { scope: 'all', clock: () => AT + 1, newId: () => 'property-later-cv' });
  expect(admitted.kind).toBe('manifest'); if (admitted.kind !== 'manifest') throw new Error('Expected made-up admission.');
  const pile = admitted.manifest.piles.find((p) => p.items.some((i) => i.fileId === later.id));
  expect(pile).toBeDefined();
  b.sources = [{ itemId: later.id, pileId: pile?.pileId ?? '', name: later.name }];
  b.admission = admitted.manifest; b.c.inboxFiles[later.name] = 'Alex uses TypeScript and SQL.\n';
  return b;
}
it('b5-profile-property-second-document control: later filing preserves the property-bound profile', async () => {
  const b = await laterDocument();
  await propertyRun(b, undefined, 2);
  expect(await b.drive.readText(b.id(PROFILE))).toBe(profileNote());
});
it('b5-profile-property-second-document', async () => {
  const b = await laterDocument(); const id = b.id(PROFILE);
  const result = await propertyRun(b, [1], 2);
  expect(edits(result, id), 'one listing match updates the existing profile by id').toHaveLength(1);
  const text = await b.drive.readText(id);
  copied(result, 'Alex uses TypeScript and SQL. [[Areas/Career/Later CV.txt]]\n'
    + '[[Earlier CV]]\n', 'Projects/Job hunt/Earlier skills.md');
  expect(text).toContain('Alex uses TypeScript and SQL.'); expect(text).toMatch(/\[\[[^\]]*Later CV/);
  expect(text).not.toContain(PREVIOUS); expect(text).toContain(PERSONAL); expect(text).toContain(HISTORY);
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv')).toHaveLength(1);
  expect(result.errors).toBe(''); expect(result.frames).toHaveLength(2);
});

async function duplicateProfiles(sentences?: number[]) {
  const b = await profileBase();
  const copy = await b.drive.createText(b.id('Projects/Job hunt'), 'Copied skills.md', profileNote(),
    { by: 'bower', profile: 'cv' });
  const result = await propertyRun(b, sentences);
  for (const id of [b.id(PROFILE), copy.id]) {
    expect(await b.drive.readText(id)).toBe(profileNote()); expect(edits(result, id)).toHaveLength(0);
  }
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv')).toHaveLength(2);
  return result;
}
it('b5-profile-property-duplicate control: duplicate properties do not obstruct ordinary filing', async () => {
  const result = await duplicateProfiles();
  expect(result.errors).toBe(''); expect(result.frames).toHaveLength(2);
});
it('b5-profile-property-duplicate', async () => {
  const result = await duplicateProfiles([1]);
  expect(result.errors, 'duplicate identity is unresolved, not a planning error').toBe('');
  expect(result.frames, 'unresolved duplicate target omits the update without refusing valid words').toHaveLength(2);
});
