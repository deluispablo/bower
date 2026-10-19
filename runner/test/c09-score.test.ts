/** C09/C08 scorer: answers read per request from requests.json as JSON, and tables read as rows (c09-score AC1-AC2). */
import { describe, expect, it } from 'vitest';
import { score, type Expected } from '../src/corpus';

const REQUESTS = '.bower/requests.json';
const ASKED = 'What are the rent and deposit for the Larkspur Lane flat?';
const OTHER = 'Which flat has the shorter commute?';
const LISTING = 'Projects/Flat hunt/Listing.txt';
const TERMS = 'Projects/Flat hunt/Deposit terms.txt';
const OLD = 'Archive/Old flat/Listing.txt';
const ANSWER = `Rent is 1,450 a month in [[${LISTING}]]. The deposit is 1,600 in [[Deposit terms.txt]].`;
const files = { [LISTING]: 'Rent: 1,450 a month.\n', [TERMS]: 'Deposit: 1,600.\n', [OLD]: 'Rent: 900 a month.\n' };
const requests = (rows: Array<{ text: string; done?: string }>): string =>
  `${JSON.stringify({ v: 1, done: rows.map((r, i) => ({ id: `change-${i + 1}`, at: i, ...r })) }, null, 2)}\n`;
/** The expectation as a case writes it; the keys are this task's, so the type is widened through unknown. */
const expecting = (value: Record<string, unknown>): Expected => value as unknown as Expected;
const run = (expected: Expected, after: Record<string, string>) => score({ expected, before: {}, after, lastRun: null });
const answers = (want: Record<string, unknown>) => expecting({ answers: [{ request: ASKED, ...want }] });
const unmet = (result: ReturnType<typeof score>, start: string) => result.unmet.filter((line) => line.startsWith(start));

describe('c09-score AC1: an answer is read per request, as JSON', () => {
  it('guard: the right row passes, with its exact links', () => {
    const result = run(answers({ contains: ['1,450', '1,600'], excludes: ['900'], links: [LISTING, TERMS] }),
      { ...files, [REQUESTS]: requests([{ text: ASKED, done: ANSWER }]) });
    expect(result).toEqual({ pass: true, unmet: [] });
  });

  it('AC1 c09-score-other-row: text found only in another request\'s row is unmet', () => {
    const result = run(answers({ contains: ['1,600'] }), { ...files, [REQUESTS]: requests([{ text: ASKED, done: 'Rent is 1,450 a month.' }, { text: OTHER, done: 'The deposit is 1,600.' }]) });
    expect(result.pass).toBe(false);
    expect(unmet(result, `answers "${ASKED}": lacks "1,600"`)).toHaveLength(1);
  });

  it('AC1 c09-score-no-row: a request with no done row is unmet, never a pass', () => {
    const result = run(answers({ contains: [] }), { ...files, [REQUESTS]: requests([{ text: OTHER, done: 'Cobble Row.' }]) });
    expect(unmet(result, `answers: no done row for "${ASKED}"`)).toHaveLength(1);
  });

  it('AC1 c09-score-two-rows: two rows with the same words are unmet (ambiguous)', () => {
    const result = run(answers({ contains: ['1,450'] }), { ...files, [REQUESTS]: requests([{ text: ASKED, done: ANSWER }, { text: ASKED, done: ANSWER }]) });
    expect(unmet(result, `answers: 2 rows for "${ASKED}"`)).toHaveLength(1);
  });

  it('AC1 c09-score-excludes: an excluded text in the row is unmet', () => {
    const result = run(answers({ excludes: ['1,450'] }), { ...files, [REQUESTS]: requests([{ text: ASKED, done: ANSWER }]) });
    expect(unmet(result, `answers "${ASKED}": has "1,450"`)).toHaveLength(1);
  });

  it('AC1 c09-score-shared-name: a link two files could take is unmet, whatever label it carries', () => {
    const shared = 'Rent is 1,450 a month in [[Listing.txt|the listing]].';
    const result = run(answers({ links: [LISTING] }), { ...files, [REQUESTS]: requests([{ text: ASKED, done: shared }]) });
    expect(unmet(result, `answers "${ASKED}": link [[Listing.txt]] could be 2 files`)).toHaveLength(1);
  });

  it('AC1 c09-score-links-exact: an extra or missing link is unmet; the paths are compared as a list', () => {
    const extra = `${ANSWER} See [[${OLD}]].`;
    const result = run(answers({ links: [LISTING, TERMS] }), { ...files, [REQUESTS]: requests([{ text: ASKED, done: extra }]) });
    expect(unmet(result, `answers "${ASKED}": links [${LISTING}, ${TERMS}, ${OLD}], expected [${LISTING}, ${TERMS}]`)).toHaveLength(1);
  });

  it('AC1 c09-score-done-absent: a row with no done, or an empty done, is not done', () => {
    for (const row of [{ text: ASKED }, { text: ASKED, done: '' }]) {
      const result = run(answers({ contains: [] }), { ...files, [REQUESTS]: requests([row]) });
      expect(unmet(result, `answers: no done row for "${ASKED}"`), JSON.stringify(row)).toHaveLength(1);
    }
  });

  it('AC1 c09-score-done-duplicate: with the same words twice, the row that has done counts', () => {
    const open = { text: ASKED };
    for (const rows of [[open, { text: ASKED, done: ANSWER }], [{ text: ASKED, done: ANSWER }, open]]) {
      const result = run(answers({ contains: ['1,450'], links: [LISTING, TERMS] }), { ...files, [REQUESTS]: requests(rows) });
      expect(result).toEqual({ pass: true, unmet: [] });
    }
  });

  it('AC1 c09-score-not-json: a requests file that is not JSON, or not its shape, is unmet', () => {
    for (const text of ['{"v":1,"done":[', '{"v":1,"rows":[]}\n']) {
      const result = run(answers({ contains: ['1,450'] }), { ...files, [REQUESTS]: text });
      expect(unmet(result, `answers: ${REQUESTS} is not a requests file`), text).toHaveLength(1);
    }
  });
});

const NOTE = 'Projects/Flat hunt/Shortlist comparison.md';
const HEADER = ['Flat', 'Rent', 'Commute', 'Deposit', 'Status'];
const ROWS = [['[[Larkspur Lane flat]]', '1,450 a month', '24 min', '1,450', 'viewing done'], ['[[Cobble Row flat]]', '1,580 a month', '18 min', 'Not stated', 'viewing booked']];
const table = (rows: string[][], separator = '| --- | --- | --- | --- | --- |') =>
  ['# Shortlist comparison', '', `| ${HEADER.join(' | ')} |`, separator, ...rows.map((r) => `| ${r.join(' | ')} |`), '', 'Trade-offs follow.', ''].join('\n');
const tables = expecting({ tables: [{ path: NOTE, header: HEADER, rows: ROWS }] });

describe('c09-score AC2: a table is read as rows', () => {
  it('guard: the exact rows pass, an escaped pipe read as a pipe', () => {
    expect(run(tables, { [NOTE]: table(ROWS) })).toEqual({ pass: true, unmet: [] });
    const piped = expecting({ tables: [{ path: NOTE, header: HEADER, rows: [['a | b', '1', '2', '3', '4']] }] });
    expect(run(piped, { [NOTE]: table([['a \\| b', '1', '2', '3', '4']]) })).toEqual({ pass: true, unmet: [] });
  });

  it('AC2 c09-score-swapped: a deposit given to the other flat is unmet', () => {
    const swapped = [[...ROWS[0]?.slice(0, 3) ?? [], 'Not stated', 'viewing done'], [...ROWS[1]?.slice(0, 3) ?? [], '1,450', 'viewing booked']];
    const result = run(tables, { [NOTE]: table(swapped) });
    expect(unmet(result, `tables ${NOTE}: rows`)).toHaveLength(1);
  });

  it('AC2 c09-score-duplicate: a duplicate row is unmet, though every expected row is there', () => {
    const result = run(tables, { [NOTE]: table([...ROWS, ROWS[1] ?? []]) });
    expect(unmet(result, `tables ${NOTE}: rows`)).toHaveLength(1);
  });

  it('AC2 c09-score-separator: a delimiter row whose cells do not match the header is no table (GFM)', () => {
    const result = run(tables, { [NOTE]: table(ROWS, '| --- | --- | --- | --- |') });
    expect(unmet(result, `tables ${NOTE}: no table with header [${HEADER.join(', ')}]`)).toHaveLength(1);
  });

  it('AC2 c09-score-table-end: a heading, quote or fence right after the table is not a row', () => {
    const rows = table(ROWS).split('\n').slice(0, -3).join('\n');
    for (const next of ['## Notes', '> Quoted', '```\ncode\n```', '~~~\ncode\n~~~']) {
      expect(run(tables, { [NOTE]: `${rows}\n${next}\n` })).toEqual({ pass: true, unmet: [] });
    }
  });

  it('AC2 c09-score-fence-close: a fence line with trailing text does not close it; a real close does', () => {
    const inside = `\`\`\`\n${table(ROWS)}\n\`\`\`not-a-close\n`;
    expect(unmet(run(tables, { [NOTE]: inside }), `tables ${NOTE}: no table`)).toHaveLength(1);
    expect(run(tables, { [NOTE]: `\`\`\`\ncode\n\`\`\`  \n${table(ROWS)}` })).toEqual({ pass: true, unmet: [] });
  });

  it('AC2 c09-score-missing: a missing note or header is unmet', () => {
    expect(unmet(run(tables, {}), `tables ${NOTE}: missing note`)).toHaveLength(1);
    const other = expecting({ tables: [{ path: NOTE, header: ['Flat', 'Rent'], rows: [] }] });
    expect(unmet(run(other, { [NOTE]: table(ROWS) }), `tables ${NOTE}: no table with header [Flat, Rent]`)).toHaveLength(1);
  });
});

describe('c09-score AC3: an expectation the scorer does not know is unmet, never skipped', () => {
  it('AC3 c09-score-unknown-key: a misspelt key, at the top, in a press or in an answer, is unmet', () => {
    const after = { ...files, [REQUESTS]: requests([{ text: ASKED, done: ANSWER }]) };
    expect(unmet(run(expecting({ answer: [{ request: ASKED, contains: ['1,450'] }] }), after), 'expected: unknown key "answer"')).toHaveLength(1);
    expect(unmet(run(expecting({ runs: [{ table: [] }] }), after), 'runs[0]: unknown key "table"')).toHaveLength(1);
    expect(unmet(run(answers({ contain: ['1,450'] }), after), `answers "${ASKED}": unknown key "contain"`)).toHaveLength(1);
    expect(run(expecting({ tables: [{ path: NOTE, header: HEADER, rows: ROWS, row: [] }] }), { [NOTE]: table(ROWS) }).unmet)
      .toEqual([`tables ${NOTE}: unknown key "row"`]);
  });

  it('AC3 c09-score-nested-typo: a typo inside a press\'s answer is caught when that press is scored, not at the top', () => {
    const after = { ...files, [REQUESTS]: requests([{ text: ASKED, done: ANSWER }]) };
    const press = answers({ contain: ['1,450'] });
    expect(unmet(run(press, after), `answers "${ASKED}": unknown key "contain"`)).toHaveLength(1);
    // The one run is that press (corpus-scorer-home): its line names the press, and the top-level key check passes it.
    expect(run(expecting({ runs: [press] }), after).unmet.filter((line) => line.includes('unknown key'))).toEqual([`run 1: answers "${ASKED}": unknown key "contain"`]);
  });

  it('AC3 c09-score-four-places: only the four places refuse a key; a note expectation is left as it is', () => {
    const result = run(expecting({ notes: [{ path: NOTE, contain: ['x'] }] }), { [NOTE]: table(ROWS) });
    expect(result.unmet.filter((line) => line.includes('unknown key'))).toEqual([]);
  });
});
