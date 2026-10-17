/**
 * C06 c06-body-links (specs/c06-connections/spec.md AC4-AC7): a link a model writes in a note carries its reason on
 * the same line, names only a note it was shown (or its own thing), and is refused at the reply, with one retry, by the
 * same identity rule the planner applies, never as a failed run (TL-P4-34 rulings 1, 3 and 5).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { empty, failedReply, note, run, select, setup, type Base } from './b1-planning-support';

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
async function refusedThenCorrected(base: Base, wants: string[], bad: unknown, good: unknown, why: RegExp) {
  const result = await run(base, [select(base, wants.map(base.id), 'Projects/Job hunt'), bad, good]);
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
