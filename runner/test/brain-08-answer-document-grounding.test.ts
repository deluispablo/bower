/** brain-08: answers, document summaries and document bodies follow the evidence rules notes follow (made-up data only). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { intentOf, type RefusalKind, type Seen } from '../src/claude';

const HOME = 'Resources/Finance';
const FINANCE = `${HOME}/Finance.md`;
const OTHER = 'Resources/Other.md';
const REPORT = 'Resources/Audit letter.txt';
const URL = 'https://invented.example/report';
const QUESTION = 'How many invoices have I paid, who approved them and what do they cost?';

function context(fileText = 'The audit letter says nothing more.') {
  const taken: AdmissionManifest = { v: 1, id: 'admission', rootId: 'root', scope: 'instructions', at: 0, journal: [], piles: [] };
  const notes: Array<[string, string]> = [[FINANCE, 'Paid invoices: 2. Finance costs €10.00.'], [OTHER, 'Other costs €20.00.']];
  const seen: Seen = { notes: new Set([FINANCE, OTHER]), folders: new Set([HOME]), words: '',
    files: new Map([[FINANCE, 'finance'], [OTHER, 'other'], [REPORT, 'report']]), noteTexts: new Map(notes),
    fileTexts: new Map([[REPORT, fileText]]), shownNotes: notes.map(([path, text]) => `${path}\n${text}`).join('\n'),
    requests: new Map([['r1', { id: 'request-1', text: QUESTION }]]) };
  return { taken, deferred: [], seen };
}
type Context = ReturnType<typeof context>;
const answer = (text: string) => ({ kind: 'tidy-intent', v: 1, things: [], answers: [{ requestId: 'r1', text }] });
const document = (summary: string, body: string) => ({ kind: 'tidy-intent', v: 1, things: [],
  documents: [{ requestId: 'r1', to: HOME, title: 'Expense report', summary, body }] });
const passes = (c: Context, value: unknown) => expect(intentOf(value, c, c.seen)).toMatchObject({ ok: true });
const refuses = (c: Context, value: unknown, kind: RefusalKind, figure?: string) => {
  const got = intentOf(value, c, c.seen);
  expect(got).toMatchObject({ ok: false, kind, source: 'r1' });
  if (!got.ok && figure) expect(got.why).toContain(`"${figure}"`);
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('brain-08 AC1 uncited integer and approver are refused', () => {
  it('an uncited whole number no source holds refuses the answer at its figure', () => {
    refuses(context(), answer('You have 999999 paid invoices and Alex approved them.'), 'numbers', '999999');
  });
  it('a whole number its linked note holds still passes', () => {
    passes(context(), answer('[[Finance]] lists 2 paid invoices.'));
  });
});

describe('brain-08 AC2 two citations do not exempt an amount', () => {
  it('a total in neither cited note refuses the answer and the document', () => {
    const line = 'Together [[Finance]] and [[Other]] cost €999999.99.';
    refuses(context(), answer(line), 'numbers', '999999.99');
    refuses(context(), document('What the two notes cost.', line), 'numbers', '999999.99');
  });
  it('a later part with no link is held to the earlier links', () => {
    refuses(context(), answer('[[Finance]] and [[Other]] are the two costs. Together they cost €30.00.'), 'numbers', '30.00');
  });
  it('figures each in one of the cited notes pass', () => {
    passes(context(), answer('Together [[Finance]] and [[Other]] cost €10.00 and €20.00.'));
  });
});

describe('brain-08 AC3 document summary is checked', () => {
  const body = '[[Finance]] lists 2 paid invoices.\n\n1. Finance costs €10.00, as [[Finance]] says.';
  it('a supported body with an invented summary figure is refused', () => {
    refuses(context(), document('You paid €888888.88.', body), 'numbers', '888888.88');
  });
  it('the same body with a plain summary passes', () => {
    passes(context(), document('What your paid invoices cost.', body));
  });
});

describe('brain-08 AC4 invented source fails in every link syntax', () => {
  const syntaxes: Array<[string, string, RefusalKind]> = [
    ['inline', `Alex approved every expense. [Audit source](${URL})`, 'noteMdLink'],
    ['reference', `Alex approved every expense. [Audit source][1]\n\n[1]: ${URL}`, 'noteWeb'],
    ['autolink', `Alex approved every expense. <${URL}>`, 'noteWeb'],
    ['bare', `Alex approved every expense, see ${URL}.`, 'noteWeb'],
  ];
  it.each(syntaxes)('%s: refused in a document body and in its summary', (_, body, kind) => {
    refuses(context(), document('An expense report.', body), kind);
    if (!body.includes('\n')) refuses(context(), document(body, 'The expenses, as [[Finance]] lists them.'), kind);
  });
  it.each(syntaxes)('%s: passes when a file shown holds the address', (_, body) => {
    passes(context(`The audit letter is at ${URL} today.`), document('An expense report.', body));
  });
  it.each(syntaxes)('%s: an answer never carries a web address', (_, body) => {
    refuses(context(`The audit letter is at ${URL} today.`), answer(body.replace('\n\n', ' ')), 'answerText');
  });
});

describe('brain-08 R-6 years, dates and step numbers are structure, not figures', () => {
  const texts = ['Expense report for 2026. [[Finance]] costs €10.00.', '## Step 3 Check the boiler', 'Due 20 October', 'Due 25 October, at 14:30 on 2026-11-02 or 3/11/2026.'];
  it.each(texts)('a document body passes: %s', (text) => {
    passes(context(), document('An expense report.', text));
  });
  it.each(texts.filter((t) => !t.startsWith('#')))('an answer passes: %s', (text) => {
    passes(context(), answer(text));
  });
});
