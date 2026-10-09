import { describe, expect, it } from 'vitest';
import type { RunReport } from '../../data/types';
import { newLineIndexes } from './new-lines';

type Row = RunReport['updated'][number];

describe('the lines a tidy-up marks New', () => {
  // TL-P4-19 addenda 3 to 5: a report row names the operation that wrote it, its line's ordinal among that op's lines,
  // and the note as the op left it; the mark follows the row by id and ordinal, never by its words, and only while
  // the note is still as the op left it.
  it("the New mark follows the row's op id", () => {
    const S = 'a'.repeat(32);
    const M = 'b'.repeat(32);
    const timeline = [{ text: 'Rent went up.' }, { text: 'Viewing booked.' }, { text: 'Rent went up.' }, { text: 'Carried over.' }];
    const note = { timeline, file: { stamp: S, md5: M } };
    const row = (what: string, extra: Partial<Row>): Row => ({ path: 'Projects/Flat hunt/Flat hunt.md', what, op: 'op-edit', lines: 3, stamp: S, md5: M, ...extra });
    // The op wrote the last three lines; a row marks the one its ordinal names, its words never matched.
    expect([...newLineIndexes(note, [row('Rent went up.', { line: 1 })])]).toEqual([2]);
    expect([...newLineIndexes(note, [row('Something else.', { line: 0 })])]).toEqual([1]);
    expect([...newLineIndexes(note, [row('Rent went up.', { line: 0 }), row('Rent went up.', { line: 1 })])].sort()).toEqual([1, 2]);
    // The note changed since (another stamp, or other bytes), or was read with no file: the mark is dropped.
    expect([...newLineIndexes({ timeline, file: { stamp: 'c'.repeat(32), md5: M } }, [row('Rent went up.', { line: 1 })])]).toEqual([]);
    expect([...newLineIndexes({ timeline, file: { stamp: S, md5: 'c'.repeat(32) } }, [row('Rent went up.', { line: 1 })])]).toEqual([]);
    expect([...newLineIndexes({ timeline }, [row('Rent went up.', { line: 1 })])]).toEqual([]);
    // A row with no line of its own (a Current state brought up to date) marks none; nor does an old row.
    expect([...newLineIndexes(note, [row('Current state brought up to date.', {})])]).toEqual([]);
    expect([...newLineIndexes(note, [{ path: 'Projects/Flat hunt/Flat hunt.md', what: 'Rent went up.', op: 'op-edit', line: 0 }])]).toEqual([]);
    // An ordinal past the op's lines, or more lines than the Timeline holds, marks none.
    expect([...newLineIndexes(note, [row('Rent went up.', { line: 3 })])]).toEqual([]);
    expect([...newLineIndexes(note, [row('Rent went up.', { line: 0, lines: 9 })])]).toEqual([]);
  });
});
