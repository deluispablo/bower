/** B4c-b: consolidated About me lines: grammar, projection, validator and the deterministic checks (owner rulings 2026-10-14). */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as observations from './observations';
import { parseObservations, validLearnedBlock } from './observations';
import { timelineLine } from './timeline-line';

type Ledger = ReturnType<typeof parseObservations>;
type Region = 'about-you' | 'about-working-on' | 'about-preferences';
type Shown = { date: string; text: string; factIds: string[] };
type Line = { text: string; factIds: string[]; form: 'current' | 'past' };
type InputFact = { factId: string; date: string; text: string; status: 'live' | 'ended'; ended?: { date: string; quote: string } };
const api = observations as unknown as Record<string, unknown>;
/** The new homes, read without widening today's exports so the reds typecheck on main. */
function home<T>(name: string, ...args: unknown[]): T {
  expect(api[name], `observations.ts exports ${name}`).toBeTypeOf('function');
  return (api[name] as (...values: unknown[]) => T)(...args);
}
const learnedLines = (ledger: Ledger, section: Region) => home<Shown[]>('learnedLines', ledger, section);
const consolidationDue = (ledger: Ledger, section: Region, runId: string) => home<boolean>('consolidationDue', ledger, section, runId);
const consolidationInput = (ledger: Ledger, section: Region) => home<InputFact[] | null>('consolidationInput', ledger, section);
const lineFaults = (ledger: Ledger, event: Record<string, unknown>) => home<Array<string | null>>('lineFaults', ledger, event);
const consolidationOk = (ledger: Ledger, event: Record<string, unknown>, runId: string) => home<boolean>('consolidationOk', ledger, event, runId);

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fact = (id: string, section: Region, date: string, text: string, runId = 'history-run') => ({
  v: 1, kind: 'observation', eventId: `event-${id}`, factId: id, date, section, text,
  category: section === 'about-preferences' ? 'preference' : 'biography',
  source: { fileId: `words-${id}`, sha256: sha(`${text}\n`) },
  origin: { kind: 'words', runId, captureId: sha(runId), pileId: `pile-${id}` } });
const consolidation = (id: string, section: Region, date: string, lines: Line[], extra: Record<string, unknown> = {}) => ({
  v: 1, kind: 'consolidation', eventId: id, section, date, factIds: [...new Set(lines.flatMap((l) => l.factIds))],
  runId: 'consolidating-run', operationId: `op-${id}`, successful: true, lines, dropped: [], ...extra });
const forget = (id: string) => ({ v: 1, kind: 'tombstone', eventId: `forget-${id}`, date: '2026-10-07', factId: id,
  sourceId: `words-${id}`, reason: 'forget', runId: 'forget-run' });
const ended = (id: string, quote: string, runId = 'ending-run') => ({ v: 1, kind: 'ended', eventId: `ended-${id}`, date: '2026-10-06',
  factId: id, quote, source: { fileId: `words-end-${id}`, sha256: sha(`${quote}\n`) }, runId });
const read = (events: readonly unknown[], undone: string[] = []): Ledger =>
  parseObservations(new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n'), undone);
const current = (text: string, factIds: string[]): Line => ({ text, factIds, form: 'current' });

const G1 = fact('g1', 'about-you', '2026-10-05', 'I grow beans on the north plot.');
const P1 = fact('p1', 'about-preferences', '2026-10-05', 'I like short written updates that say what changed and why.');
const P2 = fact('p2', 'about-preferences', '2026-10-05', 'I want a small list of roles with clear tasks.');
const P3 = fact('p3', 'about-preferences', '2026-10-05', 'I never want meetings before 9 on a Monday.', 'monday-run');
const P4 = fact('p4', 'about-preferences', '2026-10-06', 'I prefer tea to coffee in the morning.');
const L1 = current('I like short written updates and a small list of roles with clear tasks.', ['p1', 'p2']);
const L2 = current('I never want meetings before 9 on a Monday.', ['p3']);
const C1 = consolidation('c1', 'about-preferences', '2026-10-06', [L1, L2]);
const base = [G1, P1, P2, P3, C1, P4];
/** The owner's garden example: potatoes end, tomatoes stay. */
const POT = fact('pot', 'about-you', '2026-10-05', 'I have potatoes in the garden.');
const TOM = fact('tom', 'about-you', '2026-10-05', 'I have tomatoes in the garden.');
const NO_POTATOES = 'I no longer have potatoes in the garden.';
const PAST: Line = { text: 'I had potatoes in the garden.', factIds: ['pot'], form: 'past' };
const TOMS = current(TOM.text, ['tom']);
const BROAD = current('I have a vegetable garden.', ['pot', 'tom']);
const own = (f: { date: string; text: string; factId: string }): Shown => ({ date: f.date, text: f.text, factIds: [f.factId] });
const shown = (l: Line, date = '2026-10-06'): Shown => ({ date, text: l.text, factIds: l.factIds });

/** Bower's learned section as maintain writes it, from the lines given per region. */
function block(regions: Partial<Record<Region, Shown[]>>): string {
  const labels: Record<Region, string> = { 'about-you': 'About you', 'about-working-on': "What you're working on", 'about-preferences': 'How you like things' };
  return '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\nI keep my own notes here.\n\n## What Bower has learned\n'
    + (Object.keys(labels) as Region[]).map((r) => `<!-- bower:ownership/2 begin ${r} -->\n### ${labels[r]}\n`
      + (regions[r] ?? []).map((l) => timelineLine({ date: l.date, text: l.text, source: 'Your words' }) + '\n').join('')
      + `<!-- bower:ownership/2 end ${r} -->\n`).join('');
}
const quiet = (check: () => void) => { vi.spyOn(console, 'error').mockImplementation(() => {}); try { check(); } finally { vi.restoreAllMocks(); } };

describe('AC7 b4c-lines-grammar', () => {
  it('a consolidation event carries its lines and dropped facts; an event without both keeps its frontier meaning', () => {
    expect(read(base).events.find((e) => e.kind === 'consolidation'), 'the lines are part of the stored event').toMatchObject({ lines: [L1, L2], dropped: [] });
    const { lines: _lines, dropped: _dropped, ...frontier } = C1;
    expect(read([G1, P1, P2, P3, frontier]).events).toHaveLength(5);
  });
  it('facts of the event that no line holds are allowed (lines the checks refused)', () => {
    expect(read([G1, P1, P2, P3, { ...C1, lines: [L2] }]).events).toHaveLength(5);
  });
  it('a line of exactly 200 characters is one short line', () => {
    const longest = ('I like short written updates and a small list of roles with clear tasks, ' + 'said plainly and kept short, '.repeat(6)).slice(0, 199) + '.';
    expect(longest).toHaveLength(200);
    expect(read([G1, P1, P2, P3, { ...C1, lines: [{ ...L1, text: longest }, L2] }]).events).toHaveLength(5);
  });
  const without = (key: string) => Object.fromEntries(Object.entries(C1).filter(([k]) => k !== key));
  it.each<[string, Record<string, unknown>]>([
    ['lines without dropped', without('dropped')],
    ['dropped without lines', without('lines')],
    ['no lines', { ...C1, lines: [] }],
    ['a member outside the event', { ...C1, lines: [L1, { ...L2, factIds: ['p3', 'p9'] }] }],
    ['a dropped fact outside the event', { ...C1, dropped: ['p9'] }],
    ['a fact in two lines', { ...C1, lines: [L1, { ...L2, factIds: ['p2', 'p3'] }] }],
    ['a fact in a line and dropped', { ...C1, dropped: ['p2'] }],
    ['a line without facts', { ...C1, lines: [L1, L2, current('I like tea.', [])] }],
    ['a form that is neither current nor past', { ...C1, lines: [{ ...L1, form: 'future' }, L2] }],
    ['a line without a form', { ...C1, lines: [{ text: L1.text, factIds: L1.factIds }, L2] }],
    ['a line break', { ...C1, lines: [{ ...L1, text: 'I like short written updates\nand a small list.' }, L2] }],
    ['a link in the text', { ...C1, lines: [{ ...L1, text: 'I like short written updates and [[a small list]] of roles with clear tasks.' }, L2] }],
    ['the line separator in the text', { ...C1, lines: [{ ...L1, text: 'I like short written updates · a small list of roles with clear tasks.' }, L2] }],
    ['a text over 200 characters', { ...C1, lines: [{ ...L1, text: `I like ${'short '.repeat(40)}updates.` }, L2] }],
    ['an unknown key in a line', { ...C1, lines: [{ ...L1, why: 'shorter' }, L2] }],
    ['an unknown key on the event', { ...C1, why: 'shorter' }],
    ['a fact twice in one line', { ...C1, lines: [{ ...L1, factIds: ['p1', 'p1', 'p2'] }, L2] }],
    ['a member id that is not an id', { ...C1, factIds: ['p1', 'p2', 'p/3'], lines: [L1, { ...L2, factIds: ['p/3'] }] }],
  ])('%s freezes the ledger, never a silent empty view', (_name, event) => {
    quiet(() => expect(() => read([G1, P1, P2, P3, event])).toThrow('Bower could not read its learned facts.'));
  });
});

describe('AC8 b4c-learned-lines', () => {
  it('the latest consolidation\'s lines, then the facts no line cites; no consolidation keeps one line per fact', () => {
    expect(learnedLines(read(base), 'about-preferences')).toEqual([shown(L1), shown(L2), own(P4)]);
    expect(learnedLines(read(base), 'about-you')).toEqual([own(G1)]);
    expect(learnedLines(read([G1, P1, P2, P3, P4]), 'about-preferences')).toEqual([own(P1), own(P2), own(P3), own(P4)]);
  });
  it('facts of the event that no line holds show as their own lines after the lines', () => {
    expect(learnedLines(read([G1, P1, P2, P3, { ...C1, lines: [L2] }, P4]), 'about-preferences')).toEqual([shown(L2), own(P1), own(P2), own(P4)]);
  });
  it('a forgotten member makes its line fall back, in place, to the remaining facts; the last member removes it', () => {
    expect(learnedLines(read([...base, forget('p2')]), 'about-preferences')).toEqual([own(P1), shown(L2), own(P4)]);
    expect(learnedLines(read([...base, forget('p1'), forget('p2')]), 'about-preferences')).toEqual([shown(L2), own(P4)]);
  });
  it('an undone member falls back the same way', () => {
    expect(learnedLines(read(base, ['monday-run']), 'about-preferences')).toEqual([shown(L1), own(P4)]);
  });
  it('a member ended after the consolidation makes its line fall back; the ended fact is not shown', () => {
    expect(learnedLines(read([...base, ended('p2', 'I no longer want a list of roles.')]), 'about-preferences')).toEqual([own(P1), shown(L2), own(P4)]);
  });
  it('a past line citing a fact ended before it is shown; an Undo of that ending makes the line fall back', () => {
    const events = [POT, TOM, ended('pot', NO_POTATOES), consolidation('c3', 'about-you', '2026-10-07', [PAST, TOMS])];
    expect(learnedLines(read(events), 'about-you')).toEqual([shown(PAST, '2026-10-07'), shown(TOMS, '2026-10-07')]);
    expect(learnedLines(read(events, ['ending-run']), 'about-you')).toEqual([own(POT), shown(TOMS, '2026-10-07')]);
    expect(learnedLines(read([...events, forget('pot')]), 'about-you'), 'a forgotten ended member takes its past line with it')
      .toEqual([shown(TOMS, '2026-10-07')]);
    expect(learnedLines(read([...events, { ...forget('pot'), eventId: 'bin-pot', reason: 'bin' }]), 'about-you'), 'so does a Bin of its source')
      .toEqual([shown(TOMS, '2026-10-07')]);
  });
  it('a broader line may cite an ended fact; an ended fact that no line cites is hidden', () => {
    expect(learnedLines(read([POT, TOM, ended('pot', NO_POTATOES), consolidation('c4', 'about-you', '2026-10-07', [BROAD])]), 'about-you'))
      .toEqual([shown(BROAD, '2026-10-07')]);
    expect(learnedLines(read([POT, TOM, ended('pot', NO_POTATOES)]), 'about-you')).toEqual([own(TOM)]);
    const dropping = consolidation('c5', 'about-you', '2026-10-07', [TOMS], { factIds: ['pot', 'tom'], dropped: ['pot'] });
    expect(learnedLines(read([POT, TOM, ended('pot', NO_POTATOES), dropping]), 'about-you')).toEqual([shown(TOMS, '2026-10-07')]);
  });
  it('only the latest consolidation counts; a replay is no new member; the same ledger gives the same lines', () => {
    const older = consolidation('c0', 'about-preferences', '2026-10-05', [current('I like short written updates.', ['p1'])]);
    const replay = { ...P1, eventId: 'event-p1-again', factId: 'p1-again' };
    const ledger = read([G1, P1, older, P2, P3, C1, P4, replay]);
    expect(learnedLines(ledger, 'about-preferences')).toEqual([shown(L1), shown(L2), own(P4)]);
    expect(learnedLines(read([G1, P1, older, P2, P3, C1, P4, replay]), 'about-preferences')).toEqual(learnedLines(ledger, 'about-preferences'));
  });
  it('a consolidated line that reads exactly as a forgotten fact falls back to its own facts', () => {
    const X = fact('x', 'about-preferences', '2026-10-04', 'I want a small list of roles.');
    const ledger = read([X, forget('x'), P2, P3, consolidation('c2', 'about-preferences', '2026-10-06', [current('I want a small list of roles.', ['p2']), L2])]);
    expect(learnedLines(ledger, 'about-preferences')).toEqual([own(P2), shown(L2)]);
  });
  // Grammar-valid events only a hand-edited ledger holds (C never writes them; the manifest refuses them): no new reader
  // refusal, and no fact moves between regions or before its own words (R10).
  it('a line citing another region\'s fact falls back; that fact shows only in its own region', () => {
    const across = consolidation('c6', 'about-preferences', '2026-10-06', [L1, current('I never want meetings before 9 on a Monday, and I grow beans.', ['p3', 'g1'])]);
    const ledger = read([G1, P1, P2, P3, across, P4]);
    expect(learnedLines(ledger, 'about-preferences')).toEqual([shown(L1), own(P3), own(P4)]);
    expect(learnedLines(ledger, 'about-you')).toEqual([own(G1)]);
    expect(validLearnedBlock(block({ 'about-you': [own(G1)], 'about-preferences': [shown(L1), own(P3), own(P4)] }), ledger)).toBe(true);
  });
  it('a line citing a fact the ledger holds only after the consolidation falls back to its facts', () => {
    const ahead = consolidation('c7', 'about-preferences', '2026-10-06', [L1, current('I never want early Monday meetings, and I prefer tea.', ['p3', 'p4'])]);
    const ledger = read([G1, P1, P2, P3, ahead, P4]);
    expect(learnedLines(ledger, 'about-preferences')).toEqual([shown(L1), own(P3), own(P4)]);
    expect(validLearnedBlock(block({ 'about-you': [own(G1)], 'about-preferences': [shown(L1), own(P3), own(P4)] }), ledger)).toBe(true);
  });
});

describe('AC11 b4c-validator', () => {
  it('accepts the projection, consolidated and past lines included', () => {
    expect(validLearnedBlock(block({ 'about-you': [own(G1)], 'about-preferences': [shown(L1), shown(L2), own(P4)] }), read(base))).toBe(true);
    expect(validLearnedBlock(block({ 'about-you': [own(G1)], 'about-preferences': [own(P1), shown(L2), own(P4)] }), read([...base, forget('p2')]))).toBe(true);
    const past = read([POT, TOM, ended('pot', NO_POTATOES), consolidation('c3', 'about-you', '2026-10-07', [PAST, TOMS])]);
    expect(validLearnedBlock(block({ 'about-you': [shown(PAST, '2026-10-07'), shown(TOMS, '2026-10-07')] }), past)).toBe(true);
  });
  it('a live fact the person still holds may contain a forgotten fact\'s words (the old whole-block freeze)', () => {
    const both = fact('both', 'about-you', '2026-10-06', 'I have potatoes and tomatoes in the garden.');
    const ledger = read([fact('old', 'about-you', '2026-10-04', 'I have potatoes'), forget('old'), both]);
    expect(validLearnedBlock(block({ 'about-you': [own(both)] }), ledger)).toBe(true);
  });
  it.each<[string, unknown[], Partial<Record<Region, Shown[]>>]>([
    ['a consolidated line whose member is forgotten', [...base, forget('p2')], { 'about-you': [own(G1)], 'about-preferences': [shown(L1), shown(L2), own(P4)] }],
    ['a line of an older consolidation', [G1, P1, consolidation('c0', 'about-preferences', '2026-10-05', [current('I like short written updates.', ['p1'])]), P2, P3, C1, P4],
      { 'about-you': [own(G1)], 'about-preferences': [{ date: '2026-10-05', text: 'I like short written updates.', factIds: ['p1'] }, shown(L1), shown(L2), own(P4)] }],
    ['an invented line', base, { 'about-you': [own(G1)], 'about-preferences': [shown(L1), shown(L2), own(P4), { date: '2026-10-06', text: 'I always want meetings.', factIds: [] }] }],
    ['a consolidated line that reads as a forgotten fact', [fact('x', 'about-preferences', '2026-10-04', 'I want a small list of roles.'), forget('x'), G1, P2, P3,
      consolidation('c2', 'about-preferences', '2026-10-06', [current('I want a small list of roles.', ['p2']), L2])],
    { 'about-you': [own(G1)], 'about-preferences': [{ date: '2026-10-06', text: 'I want a small list of roles.', factIds: ['p2'] }, shown(L2)] }],
    ['an ended fact in its own words', [POT, TOM, ended('pot', NO_POTATOES)], { 'about-you': [own(POT), own(TOM)] }],
    ['a line whose member ended after its consolidation', [...base, ended('p2', 'I no longer want a list of roles.')],
      { 'about-you': [own(G1)], 'about-preferences': [shown(L1), shown(L2), own(P4)] }],
  ])('refuses %s', (_name, events, regions) => {
    expect(validLearnedBlock(block(regions), read(events))).toBe(false);
  });
});

// The gate case's eight facts: a frontier after three, four newer, and the fifth from this run.
const PREFS = [
  'I prefer remote roles, except when a role offers regular mentoring in Saltmere, so I can ask questions and learn with the team before I decide if it suits me.',
  'I like short written updates that say what changed, why it changed and what comes next, in plain words, so I can follow a change without opening other notes.',
  'I want a small list of roles with clear tasks and regular feedback, so I can compare each one with care before I draft a reply and keep it for later.',
  'I like garden plans that keep the path by the amber gate in Saltmere clear, with watering jobs said plainly and room to carry a can past the beds.',
  'I want recipe notes to keep each ingredient next to its step, say when to add it and keep the first amounts, and never guess a new serving size from a summary.',
  'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip until I say so.',
  'I want comparisons that say what is missing and keep each source apart, so a choice that is not sure stays not sure until I add the words that settle it.',
  'I prefer to keep the amber gate clear when I plan garden work in Saltmere, and I do not want tools left on the path by the beds at any time of day.',
];
type Reply = Array<{ text: string; facts: number[]; form?: 'current' | 'past' }>;
const REPLY: Reply = [
  { text: 'I prefer remote roles, except when a role offers regular mentoring in Saltmere, before I decide if it suits me.', facts: [1] },
  { text: 'I like short written updates that say what changed, why and what comes next, without opening other notes, and a small list of roles with clear tasks and regular feedback.', facts: [2, 3] },
  { text: 'I like garden plans that keep the path by the amber gate in Saltmere clear, and when I plan garden work I do not want tools left on the path.', facts: [4, 8] },
  { text: 'I want recipe notes to keep each ingredient next to its step and the first amounts, and never guess a new serving size.', facts: [5] },
  { text: 'I like travel notes that keep the meeting place and the first date, with any weather conditions, and never treat a maybe plan as a booked trip.', facts: [6] },
  { text: 'I want comparisons that say what is missing, so a choice that is not sure stays not sure until I add the words that settle it.', facts: [7] },
];
/** A preference that ended after the frontier: it comes after the live facts, as fact 9. */
const MUG = fact('mug', 'about-preferences', '2026-10-05', 'I want my tea in the blue mug.');
const MUG_END = ended('mug', 'I no longer want my tea in the blue mug.');
const WITH_MUG = [MUG, MUG_END];
const PAST_MUG = { text: 'I wanted my tea in the blue mug.', facts: [9], form: 'past' as const };
/** The last fact counted comes from this run. */
const prefs = (texts = PREFS, count = texts.length) => texts.slice(0, count).map((text, i) => fact(`pref-${i + 1}`, 'about-preferences',
  i < 3 ? '2026-10-05' : '2026-10-06', text, i === count - 1 ? 'run-now' : i < 3 ? 'history-run-1' : 'history-run-2'));
const frontier = { v: 1, kind: 'consolidation', eventId: 'frontier-1', section: 'about-preferences', date: '2026-10-05',
  factIds: ['pref-1', 'pref-2', 'pref-3'], runId: 'history-run-1', operationId: 'history-op-1', successful: true };
const trialEvents = (texts = PREFS, count = 8, after: unknown[] = []) => { const f = prefs(texts, count); return [...f.slice(0, 3), frontier, ...f.slice(3), ...after]; };
const trial = (texts = PREFS, count = 8, after: unknown[] = []) => read(trialEvents(texts, count, after));
const id = (n: number) => (n === 9 ? 'mug' : `pref-${n}`);
const EIGHT = PREFS.map((_, i) => id(i + 1));
const event = (reply: Reply = REPLY, factIds = EIGHT, extra: Record<string, unknown> = {}) => ({ v: 1, kind: 'consolidation',
  eventId: 'consolidation-now', section: 'about-preferences', date: '2026-10-07', factIds, runId: 'run-now', operationId: 'op-archive', successful: true,
  lines: reply.map((l) => ({ text: l.text, factIds: l.facts.map(id), form: l.form ?? 'current' })), dropped: [], ...extra });
const edit = (i: number, text: string, form: 'current' | 'past' = 'current') => REPLY.map((l, j) => (j === i ? { ...l, text, form } : l));
const habits = (count: number) => Array.from({ length: count }, (_, i) => fact(`habit-${i + 1}`, 'about-preferences', '2026-10-06',
  `I keep habit number ${i + 1} for the garden.`, i === count - 1 ? 'run-now' : 'history-run'));

describe('AC14 b4c-gate-and-checks', () => {
  it('the gate: over budget and five live facts newer than the frontier, one of them from this run', () => {
    expect(consolidationDue(trial(), 'about-preferences', 'run-now')).toBe(true);
    expect(consolidationDue(trial(PREFS, 7), 'about-preferences', 'run-now'), 'four newer facts wait').toBe(false);
    expect(consolidationDue(trial(), 'about-preferences', 'other-run'), 'a run that added no fact there does not consolidate').toBe(false);
    expect(consolidationDue(trial(PREFS.map((t) => t.split(' ').slice(0, 8).join(' ') + '.')), 'about-preferences', 'run-now'), 'within budget').toBe(false);
    const replay = { ...prefs(PREFS, 7)[4], eventId: 'event-pref-5-again', factId: 'pref-5-again' };
    expect(consolidationDue(trial(PREFS, 7, [replay]), 'about-preferences', 'run-now'), 'a replay is no fifth fact').toBe(false);
    expect(consolidationDue(trial(PREFS, 8, [forget('pref-5')]), 'about-preferences', 'run-now'), 'a forgotten fact does not count').toBe(false);
    expect(consolidationDue(trial(PREFS, 8, [ended('pref-5', 'I no longer keep recipe notes.')]), 'about-preferences', 'run-now'), 'an ended fact does not count').toBe(false);
  });
  it('the learning-run rule: this run\'s fact counts only as a live fact of the section newer than the frontier', () => {
    const runs = (runOf: (i: number) => string, after: unknown[] = []) => {
      const f = prefs().map((x, i) => ({ ...x, origin: { ...x.origin, runId: runOf(i), captureId: sha(runOf(i)) } }));
      return read([...f.slice(0, 3), frontier, ...f.slice(3), ...after]);
    };
    const history = () => 'history-run-2';
    expect(consolidationDue(runs((i) => (i === 0 ? 'run-now' : 'history-run-2')), 'about-preferences', 'run-now'),
      'this run\'s fact before the frontier is no newer fact').toBe(false);
    const NINTH = fact('pref-9', 'about-preferences', '2026-10-06', 'I like plain labels on the seed boxes.', 'run-now');
    expect(consolidationDue(runs(history, [NINTH]), 'about-preferences', 'run-now'), 'control: a newer fact from this run').toBe(true);
    expect(consolidationDue(runs(history, [NINTH, forget('pref-9')]), 'about-preferences', 'run-now'), 'this run\'s fact, forgotten').toBe(false);
    expect(consolidationDue(runs(history, [NINTH, ended('pref-9', 'I no longer label the seed boxes.')]), 'about-preferences', 'run-now'),
      'this run\'s fact, ended').toBe(false);
    expect(consolidationDue(runs(history, [{ ...NINTH, section: 'about-you', category: 'biography' }]), 'about-preferences', 'run-now'),
      'this run\'s fact in another section').toBe(false);
    const eighth = prefs()[7];
    const again = eighth && { ...eighth, eventId: 'event-pref-8-again', factId: 'pref-8-again', origin: { ...eighth.origin, runId: 'run-now', captureId: sha('run-now') } };
    expect(consolidationDue(runs(history, [again]), 'about-preferences', 'run-now'), 'a run that only replayed a fact added none').toBe(false);
  });
  it('the input: the live facts with their dates, then the ended facts with their ending', () => {
    const live = PREFS.map((text, i): InputFact => ({ factId: id(i + 1), date: i < 3 ? '2026-10-05' : '2026-10-06', text, status: 'live' }));
    expect(consolidationInput(trial(), 'about-preferences')).toEqual(live);
    const mug: InputFact = { factId: 'mug', date: '2026-10-05', text: MUG.text, status: 'ended', ended: { date: '2026-10-06', quote: MUG_END.quote } };
    expect(consolidationInput(trial(PREFS, 8, [G1, ...WITH_MUG, forget('pref-2')]), 'about-preferences'), 'no forgotten fact, no other section')
      .toEqual([...live.filter((f) => f.factId !== 'pref-2'), mug]);
    const cited = event([...REPLY, PAST_MUG], [...EIGHT, 'mug']);
    expect(consolidationInput(read([...trialEvents(PREFS, 8, WITH_MUG), cited]), 'about-preferences'), 'an ended fact a line cites stays').toEqual([...live, mug]);
    const dropped = event(REPLY, [...EIGHT, 'mug'], { dropped: ['mug'] });
    expect(consolidationInput(read([...trialEvents(PREFS, 8, WITH_MUG), dropped]), 'about-preferences'), 'an ended fact it dropped is gone').toEqual(live);
    const copy = { ...prefs()[4], eventId: 'event-pref-5-again', factId: 'pref-5-again', origin: { ...prefs()[4]?.origin, runId: 'replay-run' } };
    expect(consolidationInput(trial(PREFS, 8, [copy]), 'about-preferences'), 'a replayed copy is no second fact').toEqual(live);
    expect(consolidationInput(read(trialEvents(), ['history-run-2']), 'about-preferences'), 'an Undo of their run removes facts 4 to 7')
      .toEqual(live.filter((f) => !['pref-4', 'pref-5', 'pref-6', 'pref-7'].includes(f.factId)));
  });
  it('the input holds at most 100 facts', () => {
    expect(consolidationInput(read(habits(100)), 'about-preferences')).toHaveLength(100);
    expect(consolidationInput(read(habits(101)), 'about-preferences'), 'over 100: no consolidation').toBeNull();
  });
  it('a free rewording passes the line checks when its numbers, names and negations come from its facts', () => {
    expect(lineFaults(trial(), event())).toEqual(REPLY.map(() => null));
    const reworded = edit(1, 'I want short, plain updates on what changed, why and what comes next, and a short list of roles with clear tasks and feedback.');
    reworded[2] = { ...REPLY[2] ?? { facts: [4, 8] }, text: 'When I plan garden work in Saltmere I keep the amber gate path clear and want no tools left on it.' };
    expect(lineFaults(trial(), event(reworded))).toEqual(REPLY.map(() => null));
    expect(lineFaults(trial(PREFS, 8, WITH_MUG), event([...REPLY, PAST_MUG], [...EIGHT, 'mug'])), 'a past line from an ended fact').toEqual([...REPLY.map(() => null), null]);
  });
  it.each<[string, number, Reply, Ledger?]>([
    ['a number no cited fact holds', 3, edit(3, 'I want recipe notes to keep each ingredient next to its step and the first 2 amounts, and never guess a new serving size.')],
    ['a name no cited fact holds', 0, edit(0, 'I prefer remote roles, except when a role offers regular mentoring in Briarhaven, before I decide if it suits me.')],
    ['a date no cited fact holds', 5, edit(5, 'Since 2026-10-05 I want comparisons that say what is missing, so a choice that is not sure stays not sure.')],
    ['a dropped negation', 5, edit(5, 'I want comparisons that say what is missing, so a choice that is not sure stays sure until I add the words that settle it.')],
    ['a past line that cites no ended fact', 4, edit(4, 'I liked travel notes that kept the meeting place and the first date, and never treated a maybe plan as a booked trip.', 'past')],
    ['a line longer than its facts', 3, edit(3, `${PREFS[4] ?? ''} Every single day.`)],
    ['a line that reads exactly as a forgotten fact', 0, edit(0, 'I prefer remote roles.'),
      trial(PREFS, 8, [fact('x', 'about-preferences', '2026-10-04', 'I prefer remote roles.'), forget('x')])],
  ])('%s is that line\'s fault, and only that line\'s', (_name, at, reply, ledger) => {
    const faults = lineFaults(ledger ?? trial(), event(reply));
    expect(faults[at]).toEqual(expect.any(String));
    expect(faults.filter((_fault, i) => i !== at)).toEqual(REPLY.slice(1).map(() => null));
  });
  it('an ended fact kept in the present is a fault', () => {
    const present = { text: MUG.text, facts: [9] };
    expect(lineFaults(trial(PREFS, 8, WITH_MUG), event([...REPLY, present], [...EIGHT, 'mug']))[6]).toEqual(expect.any(String));
  });
  it('accepts a valid consolidation, one whose refused lines leave their facts as they were, and a past or dropped ended fact', () => {
    expect(consolidationOk(trial(), event(), 'run-now')).toBe(true);
    expect(consolidationOk(trial(), event(REPLY.slice(2)), 'run-now'), 'lines 1 and 2 refused: facts 1-3 stay as they were').toBe(true);
    expect(consolidationOk(trial(PREFS, 8, WITH_MUG), event([...REPLY, PAST_MUG], [...EIGHT, 'mug']), 'run-now')).toBe(true);
    expect(consolidationOk(trial(PREFS, 8, WITH_MUG), event(REPLY, [...EIGHT, 'mug'], { dropped: ['mug'] }), 'run-now')).toBe(true);
  });
  it.each<[string, Record<string, unknown>, Ledger?, string?]>([
    ['four newer facts', event(REPLY.map((l) => ({ ...l, facts: l.facts.filter((n) => n < 8) })), EIGHT.slice(0, 7)), trial(PREFS, 7)],
    ['a run that added no fact there', event(), undefined, 'other-run'],
    ['facts the input does not list', event(REPLY.map((l) => ({ ...l, facts: l.facts.filter((n) => n < 8) })), EIGHT.slice(0, 7))],
    ['a forgotten member', event(), trial(PREFS, 8, [forget('pref-2')])],
    ['a live fact dropped', event(REPLY.slice(0, 5), EIGHT, { dropped: ['pref-7'] })],
    ['a line with a fault', event(edit(3, 'I want recipe notes to keep each ingredient next to its step and the first 2 amounts, and never guess a new serving size.'))],
    ['no shorter than what it replaces', event(PREFS.map((text, i) => ({ text, facts: [i + 1] })))],
    ['an unsuccessful consolidation', event(REPLY, EIGHT, { successful: false })],
    ['an event that does not parse', event(REPLY, EIGHT, { dropped: undefined })],
    ['more than 100 facts', { ...event(), factIds: habits(101).map((h) => h.factId), lines: [current('I keep habit 101.', ['habit-101'])] }, read(habits(101))],
  ])('refuses %s, and never throws', (_name, candidate, ledger, runId) => {
    quiet(() => expect(consolidationOk(ledger ?? trial(), candidate, runId ?? 'run-now')).toBe(false));
  });
});
