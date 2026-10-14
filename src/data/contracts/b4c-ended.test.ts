/** B4c-d: the ended event's grammar and what the ledger makes of it (owner ruling 2026-10-14, answer 4). */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseObservations } from './observations';

type Ledger = ReturnType<typeof parseObservations>;
type Ending = { fact: { factId: string }; event: { eventId: string } };
/** The new list, read without widening today's type so the red typechecks on main. */
const endedOf = (ledger: Ledger): Array<[string, string]> => {
  const value = (ledger as unknown as { ended?: Ending[] }).ended;
  expect(value, 'the ledger lists its ended facts').toBeDefined();
  return (value ?? []).map((e) => [e.fact.factId, e.event.eventId]);
};
const liveOf = (ledger: Ledger) => ledger.live.map((f) => f.factId);

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const fact = (id: string, text: string, runId = 'history-run', date = '2026-10-05') => ({
  v: 1, kind: 'observation', eventId: `event-${id}`, factId: id, date, section: 'about-you', text, category: 'biography',
  source: { fileId: `words-${id}`, sha256: sha(`${text}\n`) },
  origin: { kind: 'words', runId, captureId: sha(runId), pileId: `pile-${id}` } });
const ended = (id: string, quote: string, runId = 'ending-run', eventId = `ended-${id}`) => ({
  v: 1, kind: 'ended', eventId, date: '2026-10-06', at: Date.UTC(2026, 9, 6, 9), factId: id, quote,
  source: { fileId: `words-end-${id}`, sha256: sha(`${quote}\n`) }, runId });
const tombstone = (id: string, reason: 'forget' | 'bin' = 'forget') => ({ v: 1, kind: 'tombstone', eventId: `${reason}-${id}`,
  date: '2026-10-07', factId: id, sourceId: `words-${id}`, reason, runId: 'forget-run' });
const read = (events: readonly unknown[], undone: string[] = []): Ledger =>
  parseObservations(new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n'), undone);

const POT = fact('pot', 'I have potatoes in the garden.');
const TOM = fact('tom', 'I have tomatoes in the garden.');
const QUOTE = 'I no longer have potatoes in the garden.';
const END = ended('pot', QUOTE);

describe('AC28 b4c-ended-grammar', () => {
  it('an ended event is part of the ledger, with its date, quote, source and run', () => {
    expect(read([POT, TOM, END]).events.at(-1)).toEqual(END);
    const { at: _at, ...plain } = END;
    expect(read([POT, TOM, plain]).events.at(-1), 'at is optional, as on the other events').toEqual(plain);
  });
  it.each<[string, Record<string, unknown>]>([
    ['an unknown key', { ...END, why: 'later fact' }],
    ['no quote', Object.fromEntries(Object.entries(END).filter(([key]) => key !== 'quote'))],
    ['an empty quote', { ...END, quote: ' ' }],
    ['a quote with a line break', { ...END, quote: 'I no longer have\npotatoes.' }],
    ['a quote over 200 characters', { ...END, quote: `I no longer ${'really '.repeat(30)}have potatoes.` }],
    ['a fact id that is not an id', { ...END, factId: 'pot/1' }],
    ['a source without its hash', { ...END, source: { fileId: 'words-end-pot' } }],
    ['no run', Object.fromEntries(Object.entries(END).filter(([key]) => key !== 'runId'))],
    ['an at on another day', { ...END, at: Date.UTC(2026, 9, 9, 9) }],
  ])('%s freezes the ledger', (_name, event) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => read([POT, TOM, event])).toThrow('Bower could not read its learned facts.');
    vi.restoreAllMocks();
  });
});

describe('AC29 b4c-ended-live', () => {
  it('an ended fact leaves the live facts and is listed with its ending', () => {
    const ledger = read([POT, TOM, END]);
    expect(liveOf(ledger)).toEqual(['tom']);
    expect(endedOf(ledger)).toEqual([['pot', 'ended-pot']]);
    expect(ledger.tombstones, 'ended is not Forget').toEqual([]);
  });
  it('an Undo of the ending run makes the fact live again', () => {
    const ledger = read([POT, TOM, END], ['ending-run']);
    expect(liveOf(ledger)).toEqual(['pot', 'tom']);
    expect(endedOf(ledger)).toEqual([]);
  });
  it('a later ending of the same fact counts only while the first is undone', () => {
    const again = ended('pot', QUOTE, 'second-ending-run', 'ended-pot-again');
    expect(endedOf(read([POT, TOM, END, again]))).toEqual([['pot', 'ended-pot']]);
    expect(endedOf(read([POT, TOM, END, again], ['ending-run']))).toEqual([['pot', 'ended-pot-again']]);
  });
  it('a forgotten or binned fact is neither live nor ended', () => {
    for (const reason of ['forget', 'bin'] as const) {
      const ledger = read([POT, TOM, END, tombstone('pot', reason)]);
      expect(liveOf(ledger)).toEqual(['tom']);
      expect(endedOf(ledger), `${reason} wins over ended`).toEqual([]);
    }
  });
  it('an ending of an unknown or forgotten fact changes nothing', () => {
    expect(endedOf(read([POT, TOM, ended('nope', QUOTE)]))).toEqual([]);
    expect(liveOf(read([POT, TOM, ended('nope', QUOTE)]))).toEqual(['pot', 'tom']);
    expect(endedOf(read([POT, tombstone('pot'), TOM, END]))).toEqual([]);
  });
  it('the same words said again later are a new live fact; the ended one stays ended', () => {
    const later = fact('pot-2', POT.text, 'later-run', '2026-10-08');
    const ledger = read([POT, TOM, END, later]);
    expect(liveOf(ledger)).toEqual(['tom', 'pot-2']);
    expect(endedOf(ledger)).toEqual([['pot', 'ended-pot']]);
  });
  // A replay is the same evidence (source, hash and words) observed again (b4a-r4 1): it is never a fact of its own.
  const replay = { ...POT, eventId: 'event-pot-replay', factId: 'pot-replay', origin: { ...POT.origin, runId: 'replay-run' } };
  it('an ending of a replayed copy changes nothing; the first observation stays live', () => {
    const ledger = read([POT, replay, TOM, ended('pot-replay', QUOTE)]);
    expect(liveOf(ledger)).toEqual(['pot', 'tom']);
    expect(endedOf(ledger)).toEqual([]);
  });
  it('a copy replayed after the ending stays inert: the fact stays ended', () => {
    const ledger = read([POT, TOM, END, replay]);
    expect(liveOf(ledger)).toEqual(['tom']);
    expect(endedOf(ledger)).toEqual([['pot', 'ended-pot']]);
    expect(endedOf(read([POT, TOM, END, replay], ['replay-run'])), 'an Undo of the replay changes nothing').toEqual([['pot', 'ended-pot']]);
  });
  it('an Undo of the origin run removes the fact, ended or not; an ending of an undone fact changes nothing', () => {
    const BEES = fact('bees', 'I keep bees by the shed.', 'bees-run');
    const ledger = read([POT, TOM, BEES, ended('bees', 'I no longer keep bees by the shed.')], ['bees-run']);
    expect(liveOf(ledger)).toEqual(['pot', 'tom']);
    expect(endedOf(ledger)).toEqual([]);
    const both = read([POT, TOM, END], ['history-run', 'ending-run']);
    expect([liveOf(both), endedOf(both)], 'origin and ending both undone').toEqual([[], []]);
  });
});
