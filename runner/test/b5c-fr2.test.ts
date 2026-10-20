import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { note, run, select, setup, type Base } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

const CAREER = 'Areas/Career';
const PROFILE = `${CAREER}/Career profile.md`;
const CV = 'Alex CV.txt';
const FACT = 'Alex uses TypeScript.';
const DENIAL = 'It is untrue that Alex uses TypeScript.';
const HEALTH_LINK = '[[Alex has diabetes.]]';
// brain-07: an update keeps the earlier profile prose and appends the new cited sentences.
const EARLIER = 'Earlier career facts.\n';
const initialPaging = paging.size;
type Ref = { source: string; sentence: number };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { paging.size = initialPaging; vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture(text = FACT, template = 'source', missing = false) {
  const b = await setup({ folder: {
    [`${CAREER}/Career.md`]: note('Career documents.', '## Timeline\n', true),
    // A real link target reproduces pass 2; unknown-link validation must not mask the finding.
    'Resources/Alex has diabetes..md': note('Made-up health note.', 'Alex has diabetes.\n'),
    ...(!missing ? { [PROFILE]: note('Earlier career facts.',
      '## Current state\n<!-- bower:ownership/2 begin current -->\n- Earlier career facts.\n<!-- bower:ownership/2 end current -->\n'
      + '<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these words.\n<!-- bower:ownership/2 end personal -->\n'
      + '<!-- bower:ownership/2 begin timeline -->\n## Timeline\n<!-- bower:ownership/2 end timeline -->\n'
      + "<!-- bower:ownership/2 begin bower-note -->\n## Bower's note\nEarlier CV saved.\n<!-- bower:ownership/2 end bower-note -->\n"
      + '<!-- bower:ownership/2 begin profile -->\nEarlier career facts.\n<!-- bower:ownership/2 end profile -->\n', true)
      .replace('summary:', 'bower_format: ownership/2\nsummary:') } : {}),
  }, inbox: [{ line: '', files: [CV] }], inboxFiles: { [CV]: text } });
  if (!missing) await b.drive.update(b.id(PROFILE), { appProperties: { profile: 'cv' } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{
    id: 'cv', match: ['cv'], template, properties: {}, table: [], profile: { template: 'profile' },
  }] }));
  return b;
}
function selection(b: Base) {
  const value = select(b, [], CAREER);
  for (const item of value.items) item.kind = 'cv';
  return value;
}
function intent(b: Base, profile?: string | Ref[], typed = false) {
  return { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({
    fileId: s.itemId, to: CAREER, name: s.name,
    note: { name: 'Alex CV.md', summary: 'Career document.', body: b.c.inboxFiles[s.name],
      ...(typed ? { typeRow: 'cv' } : {}) },
    ...(profile === undefined ? {} : { profile }),
  })) };
}
function refs(b: Base, ...sentences: number[]): Ref[] {
  return sentences.map((sentence) => ({ source: b.sources[0]?.itemId ?? '', sentence }));
}
function payload(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const ownership = parseOwnership(bytes);
  expect(ownership.status).toBe('v2');
  const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
  expect(span, 'the real profile writer supplies an ownership region').toBeDefined();
  return new TextDecoder().decode(bytes.subarray(span?.start, span?.end));
}
async function completed(b: Base, replies: unknown[]) {
  const result = await run(b, [selection(b), ...replies]);
  expect(result.code, result.errors).toBe(0);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(result.after[`${CAREER}/${CV}`]).toBe(b.c.inboxFiles[CV]);
  return result;
}
async function ordinaryControl(text = FACT, typed = false, missing = false) {
  const b = await fixture(text, 'source', missing);
  const result = await completed(b, [intent(b, undefined, typed)]);
  expect(result.frames).toHaveLength(2);
  expect(result.after[`${CAREER}/Alex CV.md`]).toContain(text);
  if (!missing) {
    expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
    expect(payload(result.after[PROFILE] ?? '')).toBe('Earlier career facts.\n');
  }
  expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv'))
    .toHaveLength(missing ? 0 : 1);
}
async function selected(b: Base, references: Ref[], expected: string) {
  // A valid fallback lets absent ref support fail on profile bytes, rather than a failed run or a missing source.
  const result = await completed(b, [intent(b, references), intent(b)]);
  expect(payload(result.after[PROFILE] ?? ''), 'only script-copied whole source sentences and citations reach the profile')
    .toBe(expected);
  expect(result.frames).toHaveLength(2);
  return result;
}
async function refused(b: Base, profile: string | Ref[]) {
  const result = await completed(b, [intent(b, profile), intent(b)]);
  const refusal = result.frames[2]?.call.input.split('\n').find((line) => line.startsWith('Your reply was refused:'));
  expect(refusal, 'invalid profile content must be refused before any profile operation').toBeDefined();
  expect(result.frames).toHaveLength(3);
  expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
  return result;
}

it('b5c-fr2-refs-bytes control: ordinary filing preserves exact source bytes', async () => {
  await ordinaryControl('Alex uses TypeScript. Alex builds café tools!');
});
it('b5c-fr2-refs-bytes', async () => {
  await ordinaryControl('Alex uses TypeScript. Alex builds café tools!');
  const b = await fixture('Alex uses TypeScript. Alex builds café tools! Alex uses SQL.');
  const result = await selected(b, refs(b, 1, 2),
    `${EARLIER}${FACT} [[Alex CV]]\nAlex builds café tools! [[Alex CV]]\n`);
  expect(new TextEncoder().encode(payload(result.after[PROFILE] ?? ''))).toEqual(new TextEncoder().encode(
    `${EARLIER}${FACT} [[Alex CV]]\nAlex builds café tools! [[Alex CV]]\n`));
  expect(payload(result.after[PROFILE] ?? '')).not.toContain('Alex uses SQL.');
});

for (const identifier of ['ID-884422', '884422', 'AB12']) {
  it(`b5c-fr2-offered-${identifier} control: identifier-bearing original still files`, async () => {
    await ordinaryControl(`Alex has passport ${identifier}. ${FACT}`);
  });
  it(`b5c-fr2-offered-${identifier}`, async () => {
    await ordinaryControl(`Alex has passport ${identifier}. ${FACT}`);
    // Old text replies cannot reopen an excluded sentence. This reproduces the live finding before ref support exists.
    await refused(await fixture(`Alex has passport ${identifier}.`), `Alex has passport ${identifier}.`);
    const b = await fixture(`Alex has passport ${identifier}.`);
    await refused(b, refs(b, 1));
  });
}
it('b5c-fr2-made-up-index control: a source without profile refs files', async () => { await ordinaryControl(); });
it('b5c-fr2-made-up-index', async () => {
  await ordinaryControl();
  const b = await fixture();
  await selected(b, refs(b, 1), `${EARLIER}${FACT} [[Alex CV]]\n`);
  const invalid = await fixture();
  await refused(invalid, refs(invalid, 999));
});

it('b5c-fr2-no-model-links control: ordinary filing does not copy a real health-note link', async () => {
  await ordinaryControl();
});
it('b5c-fr2-no-model-links', async () => {
  await ordinaryControl();
  const b = await fixture();
  const result = await refused(b, `${FACT} ${HEALTH_LINK}`);
  expect(result.after[PROFILE]).not.toContain(HEALTH_LINK);
});
it('b5c-fr2-whole-denial control: ordinary filing preserves the denial', async () => { await ordinaryControl(DENIAL); });
it('b5c-fr2-whole-denial', async () => {
  await ordinaryControl(DENIAL);
  // Refusing the legacy substring is independent of implementing reference selection.
  await refused(await fixture(DENIAL), FACT);
});
it('b5c-fr2-select-denial control: an omitted denial changes no profile', async () => { await ordinaryControl(DENIAL); });
it('b5c-fr2-select-denial', async () => {
  await ordinaryControl(DENIAL);
  const b = await fixture(DENIAL);
  await selected(b, refs(b, 1), `${EARLIER}${DENIAL} [[Alex CV]]\n`);
});

for (const count of [1, 401]) {
  const text = Array(count).fill('TypeScript').join(' ');
  it(`b5c-fr2-profile-template-only-${count} control: declared source creates an ordinary note`, async () => {
    await ordinaryControl(text, true, true);
  });
  it(`b5c-fr2-profile-template-only-${count}`, async () => {
    await ordinaryControl(text, true, true);
    const b = await fixture(text, 'profile', true);
    const result = await completed(b, [intent(b, undefined, true), intent(b)]);
    expect((await b.drive.listAll(b.root)).filter((f) => f.appProperties?.profile === 'cv'),
      'a cv typeRow cannot create a profile outside profile admission').toHaveLength(0);
    expect(result.frames[2]?.call.input ?? '').toMatch(/Your reply was refused:.*profile/i);
    expect(result.frames).toHaveLength(3);
    expect(Object.values(result.after).some((value) => value.includes('begin profile'))).toBe(false);
  });
}

it('b5c-fr2-400-words control: a 401-word original remains losslessly fileable', async () => {
  await ordinaryControl(Array(401).fill('TypeScript').join(' '));
});
it('b5c-fr2-400-words', async () => {
  await ordinaryControl(Array(401).fill('TypeScript').join(' '));
  // The existing writer counts the two-word citation: the 3 earlier words, 395 source words and it are exactly 400.
  const sentence = `${Array(395).fill('TypeScript').join(' ')}.`;
  const b = await fixture(sentence);
  const result = await selected(b, refs(b, 1), `${EARLIER}${sentence} [[Alex CV]]\n`);
  expect(payload(result.after[PROFILE] ?? '').trim().split(/\s+/u)).toHaveLength(400);
  const over = await fixture(`${Array(401).fill('TypeScript').join(' ')}.`);
  await refused(over, refs(over, 1));
  const citationOver = await fixture(`${Array(399).fill('TypeScript').join(' ')}.`);
  await refused(citationOver, refs(citationOver, 1));
});
