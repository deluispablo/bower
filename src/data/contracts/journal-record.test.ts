/**
 * c4-undo-compensate (TL-P4-27 addendum 3): an inverse line carries an optional `undoes`. Lines stored before it (the P2
 * fixtures) still read; a line with it reads, as an old reader that checks only the keys it lists reads it too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isJournalRecord } from './journal-record';

const fixture = (name: string): unknown => {
  const doc = JSON.parse(readFileSync(join(__dirname, 'fixtures/p2', `${name}.json`), 'utf8')) as { files: Array<{ content: unknown }> };
  return doc.files[0]?.content;
};

describe('a journal line and its undoes', () => {
  it('a stored move line without undoes still reads (old-reader fixture)', () => {
    expect(isJournalRecord(fixture('journal-move'))).toBe(true);
    expect(isJournalRecord(fixture('journal-trash'))).toBe(true);
    expect(isJournalRecord(fixture('journal-rule-removes'))).toBe(true);
  });

  it('an inverse line reads with its undoes, and one whose undoes is not a record id does not', () => {
    const move = fixture('journal-move') as Record<string, unknown>;
    expect(isJournalRecord({ ...move, id: 'INVERSE_ID', undoes: move.id })).toBe(true);
    expect(isJournalRecord({ ...move, id: 'INVERSE_ID', undoes: 7 })).toBe(false);
  });
});
