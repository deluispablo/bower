/**
 * C06 c06-body-links (specs/c06-connections/spec.md AC4-AC7): a link a model writes in a note carries its reason on
 * the same line, names only a note it was shown (or its own thing), and is refused at the reply, with one retry, by the
 * same identity rule the planner applies, never as a failed run (TL-P4-34 rulings 1, 3 and 5).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { empty, failedReply, note, run, select, setup, type Base } from './b1-planning-support';
import { SYSTEM } from '../../src/data/vault/layout';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const JOB = 'Projects/Job hunt/Job hunt.md';
const FLAT = 'Projects/Flat hunt/Flat hunt.md';
const NOTE = 'Projects/Job hunt/Saltmere offer.md';
const OFFER = 'Saltmere offer.txt';
const LEAD = 'The map designer offer has an office beside Saltmere station.';
const GOOD = `${LEAD}\n\nSee also [[Job hunt]]: the role search it belongs to.`;
const hub = (summary: string, words: string) => note(summary, `${words}\n\n## Timeline\n- 2026-10-02 · Started.\n`, true);
const FOLDER = {
  [JOB]: hub('Alex is finding a job.', 'Alex wants a role in Saltmere.'),
  [FLAT]: hub('Alex is finding a flat.', 'Alex is considering flats near Saltmere station.'),
  'Projects/Job hunt/Old offer.txt': 'An earlier offer from another studio.',
  'Projects/Job hunt/Notes.md': hub('Notes on the job hunt.', 'Interview notes.'),
  'Projects/Flat hunt/Notes.md': hub('Notes on the flat hunt.', 'Viewing notes.'),
};
const INBOX = [{ line: 'File this offer with Job hunt.', files: [OFFER] }];
const INBOX_FILES = { [OFFER]: 'Offer for Alex. Role: map designer. The office is beside Saltmere station, near the Flat hunt shortlist.\n' };

const fixture = (inbox = INBOX, files: Record<string, string> = INBOX_FILES): Promise<Base> => setup({ folder: { ...FOLDER }, inbox, inboxFiles: files });
const offer = (base: Base, body: string, summary = 'A map designer offer beside Saltmere station.') => ({ ...empty,
  things: [{ fileId: base.sources.find((s) => s.name === OFFER)?.itemId, to: 'Projects/Job hunt', name: OFFER, note: { name: 'Saltmere offer.md', summary, body } }] });
/** A refused first reply, then the corrected one: three calls, the retry naming `why`, the corrected note written. */
async function refusedThenCorrected(base: Base, wants: string[], bad: unknown, good: unknown, why: RegExp, kind = 'unknown') {
  const selection = select(base, wants.map(base.id), 'Projects/Job hunt');
  const result = await run(base, [{ ...selection, items: selection.items.map((item) => ({ ...item, kind })) }, bad, good]);
  expect(result.frames[2]?.call.input ?? '', 'refused once at the reply, with its reason').toMatch(why);
  expect(result.frames[2]?.call.input ?? '').not.toContain('a line with keys outside the intent');
  expect(result.code, 'the corrected reply is accepted').toBe(0);
  expect(result.frames).toHaveLength(3);
  return result;
}

it.each([
  ['a link alone', '[[Job hunt]]'],
  ['a list item', '- [[Job hunt]]'],
  ['a Related label', 'Related: [[Job hunt]], [[Flat hunt]]'],
  ['See also with no reason', 'See also [[Job hunt]].'],
  ['a Sources label', `Sources: [[${OFFER}]] and [[Job hunt]].`],
  ['a quoted line', '> [[Job hunt]]'],
])('AC4 c06-body-links-reason: %s is refused once, and the corrected reply is written (R1, R2)', async (_name, line) => {
  const base = await fixture();
  const result = await refusedThenCorrected(base, [JOB, FLAT], offer(base, `${LEAD}\n\n${line}`), offer(base, GOOD), /^Your reply was refused: .*with no reason on its line/m);
  expect(result.after[NOTE]).toContain(GOOD);
});

it.each([
  ['See also with its reason', `${LEAD}\n\nSee also [[Flat hunt]]: the shortlist is near the same station.`],
  ['a sentence that says why', `The office is near the station the [[Flat hunt]] shortlist uses. It belongs with [[Job hunt]].`],
  ['no link at all: zero relations is a valid answer', LEAD],
  ['a quoted line that says why', `${LEAD}\n\n> See also [[Job hunt]]: the role search it belongs to.`],
  // The one link grammar (note-format.ts linksIn, CommonMark 0.31.2 §4.5): a fenced code block holds examples, never links.
  ['a bare link inside a fenced code block, an example and no link', `${LEAD}\n\n\`\`\`\n[[Job hunt]]\n\`\`\``],
])('AC4 guard c06-body-links-reason: %s is written on the first execution call', async (_name, body) => {
  const base = await fixture();
  const result = await run(base, [select(base, [JOB, FLAT].map(base.id), 'Projects/Job hunt'), offer(base, body)]);
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(result.after[NOTE]).toContain(body);
});

it.each([
  ['in the body', (base: Base) => offer(base, `${LEAD}\n\nSee also [[Flat hunt]]: the shortlist is near the same station.`)],
  ['in the summary', (base: Base) => offer(base, LEAD, 'A map designer offer near the [[Flat hunt]] shortlist.')],
])('AC5 c06-body-links-shown: a link %s to a note not shown is refused once; the corrected reply leaves it out (R3)', async (_name, bad) => {
  const base = await fixture();
  const result = await refusedThenCorrected(base, [JOB], bad(base), offer(base, GOOD), /^Your reply was refused: .*you were not shown/m);
  expect(result.after[NOTE]).not.toContain('[[Flat hunt]]');
});

it.each([
  ['AC4 c06-body-links-reason: a bare link', [JOB, FLAT], `${LEAD}\n\n- [[Job hunt]]`, /^Your reply was refused: .*with no reason on its line/m],
  ['AC5 c06-body-links-shown: a link to a note not shown', [JOB], `${LEAD}\n\nSee also [[Flat hunt]]: the shortlist is near the same station.`, /^Your reply was refused: .*you were not shown/m],
])('%s, sent again after its refusal, fails the run honestly with one retry; nothing is filed', async (_name, wants, body, why) => {
  const base = await fixture();
  const result = await run(base, [select(base, wants.map(base.id), 'Projects/Job hunt'), offer(base, body), offer(base, body)]);
  expect(result.frames[2]?.call.input ?? '', 'refused once at the reply, with its reason').toMatch(why);
  expect(result.frames, 'one retry, as every refusal').toHaveLength(3);
  failedReply(result);
  expect(result.after[NOTE]).toBeUndefined();
});

it('AC6 c06-body-links-one-rule: a link to a file that is not a note is refused at the reply, never as a failed run (R4)', async () => {
  const base = await fixture();
  await refusedThenCorrected(base, [JOB], offer(base, `${LEAD}\n\nSee also [[Old offer.txt]]: the earlier offer to compare.`), offer(base, GOOD),
    /^Your reply was refused: .*not a note/m);
});

it('AC6 c06-body-links-one-rule: a link to a note this reply also writes is refused at the reply (R4)', async () => {
  const MAP = 'Station map.txt';
  const base = await fixture([{ line: 'File this offer and its map with Job hunt.', files: [OFFER, MAP] }],
    { ...INBOX_FILES, [MAP]: 'A map of the streets around Saltmere station.\n' });
  const map = base.sources.find((s) => s.name === MAP)?.itemId;
  const both = (body: string) => ({ ...offer(base, body), things: [...offer(base, body).things,
    { fileId: map, to: 'Projects/Job hunt', name: MAP, note: { name: 'Station map.md', summary: 'Streets around Saltmere station.', body: 'Streets around Saltmere station.' } }] });
  await refusedThenCorrected(base, [JOB], both(`${LEAD}\n\nSee also [[Station map]]: the streets around the office.`), both(GOOD),
    /^Your reply was refused: .*this reply also writes/m);
});

it.each([
  ['the one in the destination folder', 'Projects/Job hunt'],
  ['the one in another folder', 'Projects/Flat hunt'],
])('AC6 c06-body-links-one-rule: a bare name two notes share is refused; the corrected path to %s is written (R4, R5)', async (_name, where) => {
  const base = await fixture();
  const path = `${where}/Notes`;
  const result = await refusedThenCorrected(base, [JOB, 'Projects/Job hunt/Notes.md', 'Projects/Flat hunt/Notes.md'],
    offer(base, `${LEAD}\n\nSee also [[Notes]]: the notes it adds to.`), offer(base, `${LEAD}\n\nSee also [[${path}]]: the notes it adds to.`),
    /^Your reply was refused: .*two notes share/m);
  expect(result.after[NOTE]).toContain(`See also [[${path}]]: the notes it adds to.`);
});

it('AC6 guard c06-body-links-one-rule: a path to one of two notes that share a name is written on the first call', async () => {
  const base = await fixture();
  const body = `${LEAD}\n\nSee also [[Projects/Flat hunt/Notes]]: the viewing notes near the station.`;
  const result = await run(base, [select(base, [JOB, 'Projects/Flat hunt/Notes.md'].map(base.id), 'Projects/Job hunt'), offer(base, body)]);
  expect(result.code).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(result.after[NOTE]).toContain(body);
});

it('AC7 c06-body-links-prompt: the execution prompt asks for 0 to 5 related notes shown, each with its reason, and hub news only (R6)', async () => {
  const base = await fixture();
  const result = await run(base, [select(base, [JOB].map(base.id), 'Projects/Job hunt'), offer(base, GOOD)]);
  const input = result.frames[1]?.call.input ?? '';
  const instructions = input.slice(0, input.lastIndexOf('\n'));
  expect(instructions).toMatch(/You plan one Bower tidy-up/);
  expect(instructions, 'zero is valid (ruling 5)').toMatch(/0 to 5 related notes shown below/);
  expect(instructions, 'the reason on the same line (ruling 1)').toMatch(/"See also \[\[[^\]]+\]\]: [^"]+\."/);
  expect(instructions).toMatch(/never a bare link/i);
  expect(instructions, 'never linked blind (ruling 5)').toMatch(/never a note not shown/i);
  expect(instructions, 'a hub line only for news (ruling 2)').toMatch(/only when the thing is news for it/);
});

// Review gaps, round 1 (specs/c06-connections/review-gaps-c06-body-links.md): binding reds.
const MAP = 'Station map.txt';
const TWO = [{ line: 'File this offer and its map with Job hunt.', files: [OFFER, MAP] }];
const TWO_FILES = { ...INBOX_FILES, [MAP]: 'A map of the streets around Saltmere station.\n' };
const withMap = (base: Base, body: string) => ({ ...offer(base, body), things: [...offer(base, body).things,
  { fileId: base.sources.find((s) => s.name === MAP)?.itemId, to: 'Projects/Job hunt', name: MAP, note: { name: 'Streets.md', summary: 'Streets around Saltmere station.', body: 'Streets around Saltmere station.' } }] });
const OFFER_TYPES = { v: 1, rows: [{ id: 'offer', match: ['offer'], template: 'source', properties: { contact: { type: 'text' }, skills: { type: 'list' } }, table: [] }] };
const typed = (): Promise<Base> => setup({ folder: { ...FOLDER, [SYSTEM.typeTable]: JSON.stringify(OFFER_TYPES, null, 2) }, inbox: INBOX, inboxFiles: INBOX_FILES });
const firstCall = async (base: Base, wants: string[], intent: unknown) => {
  const result = await run(base, [select(base, wants.map(base.id), 'Projects/Job hunt'), intent]);
  expect(result.frames[2]?.call.input.match(/^Your reply was refused: .*$/m)?.[0], 'no refusal').toBeUndefined();
  expect(result.code, result.errors).toBe(0);
  expect(result.frames, 'written on the first execution call').toHaveLength(2);
  return result;
};

it.each([
  ['its own source', `${LEAD}\n\nSee also [[${OFFER}]]: the letter itself.`],
  ['a sibling source filed by the same reply', `${LEAD}\n\nSee also [[${MAP}]]: the streets around the office.`],
])('AC5 gap 1 c06-body-links-shown: a note linking %s, a thing this reply files, is written on the first call (R3)', async (_name, body) => {
  const base = await fixture(TWO, TWO_FILES);
  const result = await firstCall(base, [JOB], withMap(base, body));
  expect(result.after[NOTE]).toContain(body);
});

it('AC5 gap 2 c06-body-links-shown: an offer-kind reply linking its own filed source is written, never refused as noteBody (R3)', async () => {
  const base = await typed();
  const body = `${LEAD}\n\nSee also [[${OFFER}]]: the letter itself.`;
  const result = await firstCall(base, [JOB], offer(base, body));
  expect(result.after[NOTE]).toContain(body);
});

it.each([
  ['a backtick fence', '```\n[[Nowhere at all]]\n```'],
  ['a tilde fence', '~~~\n[[Nowhere at all]]\n~~~'],
])('AC4 gap 3 c06-body-links-reason: a link to no note inside %s is an example, written as is with no refusal', async (_name, fence) => {
  const base = await fixture();
  const body = `${LEAD}\n\n${fence}`;
  const result = await firstCall(base, [JOB], offer(base, body));
  expect(result.after[NOTE]).toContain(body);
});

it.each([
  ['an alias', '[[Job hunt|the hunt]]', '[[Flat hunt|the flats]]'],
  ['a heading', '[[Job hunt#Timeline]]', '[[Flat hunt#Timeline]]'],
  ['a block', '[[Job hunt^b]]', '[[Flat hunt^b]]'],
])('AC5 gap 3 c06-body-links-shown: %s link to a shown note with a reason is written; the same to a note not shown is refused', async (_name, shown, unshown) => {
  const good = `${LEAD}\n\nSee also ${shown}: the role search it belongs to.`;
  const ok = await fixture();
  expect((await firstCall(ok, [JOB], offer(ok, good))).after[NOTE]).toContain(good);
  const base = await fixture();
  await refusedThenCorrected(base, [JOB], offer(base, `${LEAD}\n\nSee also ${unshown}: the shortlist near the station.`), offer(base, good),
    /^Your reply was refused: .*you were not shown/m);
});

it('AC5 gap 4 c06-body-links-shown: an unknown note in an authored property is refused at the reply; the corrected retry files', async () => {
  const base = await typed();
  const withContact = (contact: string) => {
    const intent = offer(base, LEAD);
    const thing = intent.things[0];
    return { ...intent, things: [{ ...thing, note: { ...thing?.note, typeRow: 'offer', properties: { contact } } }] };
  };
  const result = await refusedThenCorrected(base, [JOB], withContact('[[Nowhere at all]]'), withContact('[[Job hunt]]'), /^Your reply was refused: .*you were not shown/m, 'offer');
  expect(result.after[NOTE]).toContain('[[Job hunt]]');
});

it('AC4 gap 5 c06-body-links-reason: a numbered bare link gets the link refusal, not numbers', async () => {
  const base = await fixture();
  const result = await refusedThenCorrected(base, [JOB], offer(base, `${LEAD}\n\n1. [[Job hunt]]`), offer(base, GOOD), /^Your reply was refused: .*with no reason on its line/m);
  expect(result.frames[2]?.call.input ?? '').not.toMatch(/^Your reply was refused: a number/m);
});

it('AC4 gap 5 c06-body-links-reason: a list marker is not a figure: "1. [[Job hunt]]: why" with no 1 in any source is written', async () => {
  const base = await fixture();
  const body = `${LEAD}\n\n1. [[Job hunt]]: the role search it belongs to.`;
  const result = await firstCall(base, [JOB], offer(base, body));
  expect(result.after[NOTE]).toContain(body);
});

// Review gaps, round 2 (items 8 and 9): binding reds.
it('AC5 gap 8 c06-body-links-shown: an unclosed fence in the body never hides a property link; noteLink, then the corrected retry files', async () => {
  const base = await typed();
  const withContact = (contact: string, body: string) => {
    const intent = offer(base, body);
    const thing = intent.things[0];
    return { ...intent, things: [{ ...thing, note: { ...thing?.note, typeRow: 'offer', properties: { contact } } }] };
  };
  // The corrected retry also closes the fence: a body left inside an open fence is no note Bower can read back.
  const result = await refusedThenCorrected(base, [JOB], withContact('[[Nowhere at all]]', `${LEAD}\n\n\`\`\`\nan example left open`),
    withContact('[[Job hunt]]', `${LEAD}\n\n\`\`\`\nan example\n\`\`\``), /^Your reply was refused: .*you were not shown/m, 'offer');
  expect(result.after[NOTE]).toContain('[[Job hunt]]');
  expect(result.after[NOTE]).not.toContain('Nowhere at all');
});

it.each([
  ['Timeline', (id: string | undefined, text: string) => ({ lines: [{ note: JOB, text, cites: id }] })],
  ['Current state', (id: string | undefined, text: string) => ({ states: [{ note: JOB, lines: [text], cites: id }] })],
])('AC4 gap 9 c06-body-links-reason: an unsupported leading figure in %s text is still refused as a number', async (_name, extra) => {
  const base = await fixture();
  const id = base.sources.find((s) => s.name === OFFER)?.itemId;
  const reply = (text: string) => ({ ...offer(base, GOOD), ...extra(id, text) });
  const result = await refusedThenCorrected(base, [JOB], reply('7. Alex has the map designer offer.'), reply('Alex has the map designer offer.'),
    /^Your reply was refused: a number that is in none of its sources: "7"/m);
  expect(result.after[JOB]).toContain('Alex has the map designer offer.');
  expect(result.after[JOB]).not.toContain('7. Alex');
});
