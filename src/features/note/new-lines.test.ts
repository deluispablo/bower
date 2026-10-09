import { describe, expect, it } from 'vitest';

type Marks = (timeline: readonly { text: string }[], rows: readonly string[]) => ReadonlySet<number>;

describe('the lines a tidy-up marks New', () => {
  // c3-planner-split part 2: each report row is one line its operation wrote, at the end of the Timeline, so a row
  // marks that one line; an earlier line with the same words is not the row's.
  it("the New mark follows the row's op, not its text", async () => {
    const at = './new-lines';
    const mod = (await import(/* @vite-ignore */ at).catch(() => ({}))) as { newLineIndexes?: Marks };
    expect(typeof mod.newLineIndexes).toBe('function');
    const marks = mod.newLineIndexes ?? ((): ReadonlySet<number> => new Set());
    const timeline = [{ text: 'Rent went up.' }, { text: 'Viewing booked.' }, { text: 'Rent went up.' }];
    // One row: the line its edit appended, the last with those words; the line from an earlier day is not marked.
    expect([...marks(timeline, ['Rent went up.'])]).toEqual([2]);
    // Two rows with the same words: two lines, from the end.
    expect([...marks(timeline, ['Rent went up.', 'Rent went up.'])].sort()).toEqual([0, 2]);
    // A row with no line of its own (a Current state brought up to date) marks none.
    expect([...marks(timeline, ['Current state brought up to date.'])]).toEqual([]);
  });
});
