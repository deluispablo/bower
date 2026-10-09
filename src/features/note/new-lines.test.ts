import { describe, expect, it } from 'vitest';
import type { RunReport } from '../../data/types';
import { newLineIndexes } from './new-lines';

type Row = RunReport['updated'][number];

describe('the lines a tidy-up marks New', () => {
  // c3-planner-split part 3 (TL-P4-19 addendum 3): a report row names the operation that wrote it and its line, so
  // the New mark follows the row by id and place, never by its words.
  it("the New mark follows the row's op id", () => {
    const timeline = [{ text: 'Rent went up.' }, { text: 'Viewing booked.' }, { text: 'Rent went up.' }, { text: 'Carried over.' }];
    const row = (what: string, extra: Partial<Row>): Row => ({ path: 'Projects/Flat hunt/Flat hunt.md', what, ...extra });
    // A row marks the line its op wrote: here the one before the last (a line carried over without a row came after).
    expect([...newLineIndexes(timeline, [row('Rent went up.', { op: 'op-edit', line: 1 })])]).toEqual([2]);
    // Its words are never matched: a row whose words differ still marks its own line, and only it.
    expect([...newLineIndexes(timeline, [row('Something else.', { op: 'op-edit', line: 3 })])]).toEqual([0]);
    // Two rows of one op, two lines.
    expect([...newLineIndexes(timeline, [row('Rent went up.', { op: 'op-edit', line: 3 }), row('Rent went up.', { op: 'op-edit', line: 1 })])].sort()).toEqual([0, 2]);
    // A row with no line of its own (a Current state brought up to date) marks none; nor does an old row with no op.
    expect([...newLineIndexes(timeline, [row('Current state brought up to date.', { op: 'op-edit' })])]).toEqual([]);
    expect([...newLineIndexes(timeline, [row('Rent went up.', {})])]).toEqual([]);
    // A line past the Timeline (the note changed since) marks none.
    expect([...newLineIndexes(timeline, [row('Rent went up.', { op: 'op-edit', line: 9 })])]).toEqual([]);
  });
});
