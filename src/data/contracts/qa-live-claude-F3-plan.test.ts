/** qa-live-claude F3 (plan side): `takenBack`, the ids of a request the person withdrew and of its withdrawal. Made-up lines only. */
import { describe, expect, it } from 'vitest';
import { pairsOf, takenBack, type JournalRecord } from './journal-record';

const line = (id: string, extra: Partial<JournalRecord> = {}): JournalRecord => ({ v: 1, device: 'device-1', id, at: 1, kind: 'request', what: `Asked Bower: "${id}"`, text: id, ...extra });
const withdrawal = (id: string, undoes: string, extra: Partial<JournalRecord> = {}): JournalRecord => {
  const { text: _, ...rest } = line(id, { undoes, what: 'Took back a request', ...extra });
  return rest;
};

describe('takenBack', () => {
  it('F3P-4 holds a withdrawal and the request it names', () => {
    expect([...takenBack([line('a'), line('b'), withdrawal('w', 'a')])].sort()).toEqual(['a', 'w']);
  });

  it('F3P-4 holds an unpaired withdrawal alone', () => {
    expect([...takenBack([line('b'), withdrawal('w', 'taken-by-an-earlier-run')])]).toEqual(['w']);
  });

  it('F3P-4 is empty with no withdrawal', () => {
    expect(takenBack([line('a'), line('b')]).size).toBe(0);
  });

  it('F3P-4 does not hold a request with undoes and text (a refused-words request)', () => {
    expect(takenBack([line('a'), line('r', { undoes: 'a' })]).size).toBe(0);
  });

  it('F3P-4 does not hold a withdrawal that a later present line undoes: the pair folds, the request stands', () => {
    const lines = [line('a'), withdrawal('w', 'a'), withdrawal('u', 'w')];
    expect(takenBack(lines).size).toBe(0);
    expect([...pairsOf(lines)].sort()).toEqual(['u', 'w']);
  });
});
