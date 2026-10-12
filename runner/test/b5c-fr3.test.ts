import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { note, run, select, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

const CAREER = 'Areas/Career';
const PROFILE = `${CAREER}/Career profile.md`;
const CV = 'Alex CV.txt';
const FACT = 'Alex uses TypeScript.';
const ATTACK = 'Alex CV]] Alex has diabetes. [[CV.txt';
const initialPaging = paging.size;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { paging.size = initialPaging; vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture(options: { name?: string; text?: string; missing?: boolean; ordinary?: boolean } = {}) {
  const name = options.name ?? CV;
  const b = await setup({ folder: {
    [`${CAREER}/Career.md`]: note('Career documents.', '## Timeline\n', true),
    ...(!options.missing && !options.ordinary ? { [PROFILE]: note('Earlier career facts.',
      '## Current state\n<!-- bower:ownership/2 begin current -->\n- Earlier career facts.\n<!-- bower:ownership/2 end current -->\n'
      + '<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these words.\n<!-- bower:ownership/2 end personal -->\n'
      + '<!-- bower:ownership/2 begin timeline -->\n## Timeline\n<!-- bower:ownership/2 end timeline -->\n'
      + "<!-- bower:ownership/2 begin bower-note -->\n## Bower's note\nEarlier CV saved.\n<!-- bower:ownership/2 end bower-note -->\n"
      + '<!-- bower:ownership/2 begin profile -->\nEarlier career facts.\n<!-- bower:ownership/2 end profile -->\n', true)
      .replace('summary:', 'bower_format: ownership/2\nsummary:') } : {}),
  }, inbox: [{ line: '', files: [name] }], inboxFiles: { [name]: options.text ?? FACT } });
  if (!options.missing && !options.ordinary) await b.drive.update(b.id(PROFILE), { appProperties: { profile: 'cv' } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{
    id: 'cv', match: ['cv'], template: 'source', properties: {}, table: [],
    ...(!options.ordinary ? { profile: { template: 'profile' } } : {}),
  }] }));
  return b;
}
function intent(b: Base, name: string, profile: boolean) {
  return { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({
    fileId: s.itemId, to: CAREER, name,
    note: { name: 'Alex document.md', summary: 'Career document.', body: b.c.inboxFiles[s.name] },
    ...(profile ? { profile: [{ source: s.itemId, sentence: 1 }] } : {}),
  })) };
}
async function execute(b: Base, name = b.sources[0]?.name ?? CV, profile = true) {
  const selection = select(b, [], CAREER);
  for (const item of selection.items) item.kind = 'cv';
  // The existing retry can refuse the attack and still file the unchanged original safely.
  const result = await run(b, [selection, intent(b, name, profile), intent(b, b.sources[0]?.name ?? CV, false)]);
  expect(result.code, result.errors).toBe(0);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  const source = b.sources[0];
  expect(source).toBeDefined();
  const filed = await b.drive.get(source?.itemId ?? '');
  expect(await b.drive.readText(filed.id), 'ordinary filing keeps the original bytes').toBe(b.c.inboxFiles[source?.name ?? '']);
  const path = b.drive.pathOf(filed.id, b.root);
  expect(path, 'the existing safe fallback must still file the source').toMatch(/^Areas\/Career\//);
  const profiles = (await b.drive.listAll(b.root)).filter((file) => file.appProperties?.profile === 'cv');
  expect(profiles.length).toBeLessThanOrEqual(1);
  const profileText = profiles[0] ? await b.drive.readText(profiles[0].id) : undefined;
  return { result, filed, path, profileText };
}
function payload(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const ownership = parseOwnership(bytes);
  expect(ownership.status).toBe('v2');
  const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
  expect(span, 'main applies the real profile writer').toBeDefined();
  return new TextDecoder().decode(bytes.subarray(span?.start, span?.end));
}
function offered(result: Awaited<ReturnType<typeof run>>, source: string) {
  const context = JSON.parse(result.frames[1]?.call.input.split('\n').at(-1) ?? '{}') as {
    piles: Array<{ things: Array<{ fileId: string; sentences?: Array<{ sentence: number; text: string }> }> }>;
  };
  const thing = context.piles.flatMap((pile) => pile.things).find((item) => item.fileId === source);
  expect(thing, 'the execution prompt contains the actual admitted source').toBeDefined();
  return thing?.sentences ?? [];
}

for (const missing of [false, true]) {
  const mode = missing ? 'create' : 'edit';
  it(`b5c-fr3-rename-${mode} control: a safe rename supplies the resolved destination citation`, async () => {
    const b = await fixture({ missing });
    const { result, filed, profileText } = await execute(b, 'Alex skills.txt');
    expect(result.frames).toHaveLength(2);
    expect(filed.name).toBe('Alex skills.txt');
    expect(payload(profileText ?? '')).toBe(`${FACT} [[${CAREER}/Alex skills.txt]]\n`);
  });
  it(`b5c-fr3-rename-${mode}`, async () => {
    const b = await fixture({ missing });
    const { filed, profileText } = await execute(b, ATTACK);
    expect({
      unsafeNamePersisted: filed.name === ATTACK,
      injectedProfileText: (profileText ?? '').includes('Alex has diabetes.'),
    }, 'shared name validation refuses link-breaking names before a resolved citation reaches any profile')
      .toEqual({ unsafeNamePersisted: false, injectedProfileText: false });
  });
}

it('b5c-fr3-id-name control: an identifier-free passport name offers and cites its sentence', async () => {
  const b = await fixture({ name: 'Alex passport.txt' });
  const { result } = await execute(b);
  expect(result.frames).toHaveLength(2);
  expect(offered(result, b.sources[0]?.itemId ?? '')).toEqual([{ sentence: 1, text: FACT }]);
  expect(payload(result.after[PROFILE] ?? '')).toBe(`${FACT} [[${CAREER}/Alex passport.txt]]\n`);
});
it('b5c-fr3-id-name', async () => {
  const b = await fixture({ name: 'Alex passport ID-884422.txt' });
  const { result } = await execute(b);
  expect({
    offered: offered(result, b.sources[0]?.itemId ?? ''),
    identifierInProfile: (result.after[PROFILE] ?? '').includes('ID-884422'),
  }, 'an identifier-bearing source name excludes the contributor and cannot leak through its citation')
    .toEqual({ offered: [], identifierInProfile: false });
});

it('b5c-fr3-plain-rename control: ordinary filing accepts a safe rename without a profile row', async () => {
  const b = await fixture({ ordinary: true });
  const { result, filed } = await execute(b, 'Alex skills.txt', false);
  expect(result.frames).toHaveLength(2);
  expect(filed.name).toBe('Alex skills.txt');
  expect(result.after[PROFILE]).toBeUndefined();
});
it('b5c-fr3-plain-rename', async () => {
  const b = await fixture({ ordinary: true });
  const { result, filed } = await execute(b, 'Alex skills]].txt', false);
  expect(result.after[PROFILE]).toBeUndefined();
  expect(filed.name, 'the same name rule protects ordinary non-profile filing').not.toBe('Alex skills]].txt');
});

it('b5c-fr3-crlf control: an LF-wrapped sentence is offered and copied whole', async () => {
  const b = await fixture({ text: 'Alex does not\nuse TypeScript.' });
  const { result } = await execute(b);
  expect(result.frames).toHaveLength(2);
  expect(offered(result, b.sources[0]?.itemId ?? '')).toEqual([{ sentence: 1, text: 'Alex does not\nuse TypeScript.' }]);
  expect(payload(result.after[PROFILE] ?? '')).toBe(`Alex does not\nuse TypeScript. [[${CAREER}/${CV}]]\n`);
});
it('b5c-fr3-crlf', async () => {
  const b = await fixture({ text: 'Alex does not\r\nuse TypeScript.' });
  const { result } = await execute(b);
  expect({
    offered: offered(result, b.sources[0]?.itemId ?? ''),
    profile: payload(result.after[PROFILE] ?? ''),
  }, 'normalize CRLF to LF before numbering the single wrapped sentence, preserving its whole denial')
    .toEqual({ offered: [{ sentence: 1, text: 'Alex does not\nuse TypeScript.' }],
      profile: `Alex does not\nuse TypeScript. [[${CAREER}/${CV}]]\n` });
});
