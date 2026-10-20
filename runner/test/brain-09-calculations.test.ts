/** brain-09: a requested count, sum or difference is computed by Bower from cited operands, never taken from the reply (made-up data only). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { intentOf, type RefusalKind, type Seen } from '../src/claude';

const HOME = 'Resources/Finance';
const FINANCE = `${HOME}/Finance.md`;
const OTHER = 'Resources/Other.md';
const DOLLARS = 'Resources/Dollars.md';
const INV1 = `${HOME}/INV-001.md`;
const INV2 = `${HOME}/INV-002.md`;
const QUESTION = 'How many invoices have I paid and what do they cost together?';

function context() {
  const taken: AdmissionManifest = { v: 1, id: 'admission', rootId: 'root', scope: 'instructions', at: 0, journal: [], piles: [] };
  const notes: Array<[string, string]> = [[FINANCE, 'Finance costs €10.00.'], [OTHER, 'Other costs €20.00.'], [DOLLARS, 'Dollars costs $20.00.'],
    [INV1, 'Invoice INV-001, paid.'], [INV2, 'Invoice INV-002, paid.']];
  const seen: Seen = { notes: new Set(notes.map(([path]) => path)), folders: new Set([HOME]), words: '',
    files: new Map(notes.map(([path]) => [path, path])), noteTexts: new Map(notes),
    shownNotes: notes.map(([path, text]) => `${path}\n${text}`).join('\n'), requests: new Map([['r1', { id: 'request-1', text: QUESTION }]]) };
  return { taken, deferred: [], seen };
}
const answer = (text: string) => ({ kind: 'tidy-intent', v: 1, things: [], answers: [{ requestId: 'r1', text }] });
const document = (summary: string, body: string) => ({ kind: 'tidy-intent', v: 1, things: [],
  documents: [{ requestId: 'r1', to: HOME, title: 'Expense report', summary, body }] });
/** The answer Bower keeps for the request, as rendered. */
const answered = (text: string): string | undefined => {
  const c = context();
  const got = intentOf(answer(text), c, c.seen);
  expect(got).toMatchObject({ ok: true });
  return got.ok ? got.filing.answers?.get('request-1') : undefined;
};
const refuses = (value: unknown, kind: RefusalKind, says?: string) => {
  const c = context();
  const got = intentOf(value, c, c.seen);
  expect(got).toMatchObject({ ok: false, kind, source: 'r1' });
  if (!got.ok && says) expect(got.why).toContain(says);
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('brain-09 AC1 two cited amounts produce the real sum', () => {
  it('a sum of two cited amounts is rendered by Bower as €30.00', () => {
    expect(answered('Together they cost {{sum: €10.00 [[Finance]]; €20.00 [[Other]]}}.')).toBe('Together they cost €30.00 ([[Finance]], [[Other]]).');
  });
  it('a proposed total of €999999.99 is refused and never kept', () => {
    refuses(answer('Together [[Finance]] and [[Other]] cost €999999.99.'), 'numbers', '"999999.99"');
    refuses(answer('Together they cost €999999.99, {{sum: €10.00 [[Finance]]; €20.00 [[Other]]}}.'), 'numbers', '"999999.99"');
  });
  it('a document summary and body are rendered the same way', () => {
    const c = context();
    const got = intentOf(document('The two cost {{sum: €10.00 [[Finance]]; €20.00 [[Other]]}}.', '| Item | Cost |\n| --- | --- |\n| Total | {{sum: €10.00 [[Finance]]; €20.00 [[Other]]}} |'), c, c.seen);
    expect(got).toMatchObject({ ok: true });
    const kept = got.ok ? got.filing.documents?.get('request-1') : undefined;
    expect(kept?.what).toBe('The two cost €30.00 ([[Finance]], [[Other]]).');
    expect(kept?.body).toBe('| Item | Cost |\n| --- | --- |\n| Total | €30.00 ([[Finance]], [[Other]]) |');
  });
  it('a difference is the first operand less the second', () => {
    expect(answered('[[Other]] costs {{difference: €20.00 [[Other]]; €10.00 [[Finance]]}} more than [[Finance]].')).toBe('[[Other]] costs €10.00 ([[Other]], [[Finance]]) more than [[Finance]].');
  });
  it('an operand no cited note holds is refused at its figure', () => {
    refuses(answer('Together they cost {{sum: €10.00 [[Finance]]; €25.00 [[Other]]}}.'), 'numbers', '"25.00"');
  });
});

describe('brain-09 AC2 count uses resolved unique members', () => {
  it('two invoices, one cited twice, count 2', () => {
    expect(answered('You have paid {{count: [[INV-001]]; [[INV-002]]; [[INV-001]]}} invoices.')).toBe('You have paid 2 ([[INV-001]], [[INV-002]]) invoices.');
  });
  it('a name and a whole path of one note count once', () => {
    expect(answered(`You have paid {{count: [[INV-001]]; [[${INV1.replace(/\.md$/, '')}]]}} invoice.`)).toBe('You have paid 1 ([[INV-001]]) invoice.');
  });
  it('a proposed count of 999999 is refused', () => {
    refuses(answer('You have paid 999999 invoices, {{count: [[INV-001]]; [[INV-002]]}}.'), 'numbers', '"999999"');
  });
});

describe('brain-09 AC3 incompatible or incomplete operands do not produce a total', () => {
  it('euros plus dollars are refused, no total', () => {
    refuses(answer('Together they cost {{sum: €10.00 [[Finance]]; $20.00 [[Dollars]]}}.'), 'numbers', 'different currencies or units');
  });
  it('an operand with no amount is refused', () => {
    refuses(answer('Together they cost {{sum: €10.00 [[Finance]]; [[Other]]}}.'), 'numbers', 'not one figure');
  });
  it('a counted item that is not a link to a note shown is refused', () => {
    refuses(answer('You have paid {{count: [[INV-001]]; an invoice I lost}} invoices.'), 'numbers', 'not each one link');
    refuses(answer('You have paid {{count: [[INV-001]]; [[INV-003]]}} invoices.'), 'noteLink');
  });
  it('a difference of three figures and an unknown operation are refused', () => {
    refuses(answer('{{difference: €20.00 [[Other]]; €10.00 [[Finance]]; €10.00 [[Finance]]}} is left.'), 'numbers', 'exactly two figures');
    refuses(answer('Together they cost {{total: €10.00 [[Finance]]; €20.00 [[Other]]}}.'), 'numbers', 'cannot read');
  });
  it('the refusal holds in a document', () => {
    refuses(document('What the two cost.', 'Together {{sum: €10.00 [[Finance]]; $20.00 [[Dollars]]}}.'), 'numbers', 'different currencies or units');
  });
});

describe('brain-09 normal use: plain answers and figures copied from a note are unchanged', () => {
  const texts = ['[[Finance]] costs €10.00 and [[Other]] costs €20.00.', 'Expense report for 2026: [[Finance]] costs €10.00.',
    'Due 20 October, at 14:30 on 2026-11-02, as [[INV-001]] says.', 'Step 3: pay [[INV-002]].'];
  it.each(texts)('kept as written: %s', (text) => {
    expect(answered(text)).toBe(text);
  });
  it('a document with no calculation is kept as written', () => {
    const c = context();
    const body = '## Step 3 Check the costs\n\n1. [[Finance]] costs €10.00.\n2. [[Other]] costs €20.00.';
    const got = intentOf(document('What the two cost in 2026.', body), c, c.seen);
    expect(got.ok ? got.filing.documents?.get('request-1')?.body : got).toBe(body);
  });
});
