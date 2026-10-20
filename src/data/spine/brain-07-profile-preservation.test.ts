// @vitest-environment node
/**
 * brain-07 (rulings in specs/brain-audit/brain-07-rulings.md): updating an existing profile keeps its earlier cited
 * sentences and appends only the new sentence-plus-source lines it does not hold yet. Old prose is never cut to make room:
 * when the profile has no room for a document's lines, the document files without them and the run logs one line (R-9);
 * the document stays their source. Prior art: append-only merge of cited statements, as a set union keyed by the exact
 * line (the existing region writer and `profileTextOk`). Names are made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileTextOk, stateMark } from '../contracts/note-edit';
import { parseOwnership } from '../contracts/ownership-format';
import { note, run, select, setup, type Base } from '../../../runner/test/b1-planning-support';
import { AT } from '../../../runner/test/corpus-run';

const PROFILE = 'Areas/Career/Career profile.md';
const TABLE = '.bower/type-table.json';
const SOURCE = 'Safety course.txt';
const COURSE = 'Completed the safety course.';
const EARLIER = 'Works at Acme. [[Earlier CV]]\nSpeaks French. [[Language certificate]]\n';
const ADDED = `${COURSE} [[Safety course]]\n`;
const PERSONAL = '## My notes\nAlex keeps these words: café.\n';
const HISTORY = '## Timeline\n- 2026-10-01 · Read the earlier CV · [[Earlier CV]]\n';
const framed = (key: string, text: string) => `<!-- bower:ownership/2 begin ${key} -->\n${text}<!-- bower:ownership/2 end ${key} -->\n`;
const bytes = (text: string) => new TextEncoder().encode(text);
const profileNote = (region: string) => note('Alex works at Acme.', '## Current state\n' + framed('current', '- Alex works at Acme.\n')
  + framed('personal', PERSONAL) + framed('timeline', HISTORY)
  + framed('bower-note', "## Bower's note\nEarlier CV saved.\n") + framed('profile', region), true)
  .replace('summary:', 'bower_format: ownership/2\nsummary:')
  .replace('by: bower\n', `by: bower\nbower_state: ${stateMark(['Alex works at Acme.'])}\n`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function profileBase(region: string): Promise<Base> {
  const b = await setup({ folder: {
    [PROFILE]: profileNote(region),
    'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true),
  }, inbox: [{ line: '', files: [SOURCE] }], inboxFiles: { [SOURCE]: `${COURSE}\n` } });
  await b.drive.update(b.id(PROFILE), { appProperties: { profile: 'cv' } });
  const table = JSON.stringify({ v: 1, rows: [{ id: 'cv', match: ['cv'], template: 'source', properties: {}, table: [],
    profile: { template: 'profile' } }] });
  await b.drive.createText(b.id('.bower'), 'type-table.json', table);
  b.c.folder[TABLE] = table;
  return b;
}

/** The selection names the profile and the cv row; the execution reply files the source and selects sentence 1. */
async function contribute(b: Base) {
  const selection = select(b, [b.id(PROFILE)], 'Areas/Career');
  for (const item of selection.items) item.kind = 'cv';
  const filing = { kind: 'tidy-intent', v: 1, things: b.sources.map((s) => ({ fileId: s.itemId, to: 'Areas/Career', name: s.name,
    note: { name: 'Safety course.md', summary: COURSE, body: COURSE }, profile: [{ source: s.itemId, sentence: 1 }] })) };
  return run(b, [selection, filing]);
}

function region(text: string | undefined): string {
  const all = bytes(text ?? '');
  const ownership = parseOwnership(all);
  const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
  expect(span, 'the profile keeps its region').toBeDefined();
  return new TextDecoder().decode(all.subarray(span?.start, span?.end));
}

describe('brain-07 AC1 qualification does not erase employment or language', () => {
  it('keeps Works at Acme. and Speaks French. with their citations and appends the course sentence', async () => {
    const b = await profileBase(EARLIER);
    const result = await contribute(b);
    expect(result.code, result.errors).toBe(0);
    expect(region(result.after[PROFILE])).toBe(EARLIER + ADDED);
    expect(result.after[PROFILE]).toContain(PERSONAL);
    expect(result.after[PROFILE]).toContain(HISTORY);
  });
});

describe('brain-07 AC2 repeated contribution adds no duplicate', () => {
  it('leaves the region unchanged when it already holds the same sentence and source', async () => {
    const b = await profileBase(EARLIER + ADDED);
    const result = await contribute(b);
    expect(result.code, result.errors).toBe(0);
    expect(result.after[`Areas/Career/${SOURCE}`]).toBe(`${COURSE}\n`);
    expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
  });
});

describe('brain-07 AC3 profile limit never deletes old facts', () => {
  it('files the document without its profile lines when the profile has no room, keeping prose, personal and history bytes', async () => {
    const long = `Works at Acme. [[Earlier CV]]\nSpeaks French${' and French'.repeat(194)}. [[Language certificate]]\n`;
    expect(profileTextOk(long), 'the earlier prose fits the bound').toBe(true);
    expect(profileTextOk(long + ADDED), 'the merged prose does not').toBe(false);
    const b = await profileBase(long);
    const result = await contribute(b);
    expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
    expect(result.code, result.errors).toBe(0);
    expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(result.after[`Areas/Career/${SOURCE}`], 'the document files').toBe(`${COURSE}\n`);
    expect(result.errors).toContain('A profile had no room for the lines of');
  });
  it('a stored profile over 400 words that already holds the contribution is not written', async () => {
    const over = `Works at Acme. [[Earlier CV]]\nSpeaks French${' and French'.repeat(200)}. [[Language certificate]]\n${ADDED}`;
    expect(profileTextOk(over), 'the stored prose is past the bound').toBe(false);
    const b = await profileBase(over);
    const result = await contribute(b);
    expect(result.after[PROFILE]).toBe(b.c.folder[PROFILE]);
    expect(result.code, result.errors).toBe(0);
    expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
    expect(result.after[`Areas/Career/${SOURCE}`]).toBe(`${COURSE}\n`);
  });
});
