import fc from 'fast-check';
import { beforeAll, expect, test, vi } from 'vitest';
import { FAILED_KEY, Journal, outboxKey, type JournalRecord } from './journal';

let replay: () => Promise<void>;

beforeAll(async () => {
  let collected: (() => Promise<void>) | undefined;
  // Collect the existing replay callback without registering the rest of the suite.
  vi.doMock('vitest', async (importOriginal) => ({
    ...await importOriginal<typeof import('vitest')>(),
    it: Object.assign((name: string, run: () => Promise<void>) => {
      if (name === 'replays undo-compensate-counterexample') collected = run;
    }, { each: () => () => undefined }),
    describe: () => undefined,
  }));
  vi.doMock('fast-check', () => ({ default: {
    ...fc,
    assert: (property: fc.IAsyncProperty<unknown>) => fc.assert(property, {
      seed: -252134783, path: '22', numRuns: 1, endOnFailure: true,
    }),
  } }));
  try {
    await import('./undo-compensate.property.test');
    if (!collected) throw new Error('Missing TL-P4-28(2) replay callback');
    const run = collected;
    replay = () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      return run();
    };
  } finally {
    vi.doUnmock('vitest');
    vi.doUnmock('fast-check');
  }
});

test('AC1: the FIFO report names an inverse retired during the same refused flush', async () => {
  let before: JournalRecord[] = [];
  let failed: Array<{ id: string }> = [];
  let after: JournalRecord[] = [];
  const waiting = (): JournalRecord[] =>
    (JSON.parse(localStorage.getItem(outboxKey('f1')) ?? '[]') as Array<{ line: JournalRecord }>).map(({ line }) => line);
  const flush = Journal.prototype.flush;
  vi.spyOn(Journal.prototype, 'flush').mockImplementation(async function (this: Journal) {
    before = waiting();
    try { return await flush.call(this); }
    finally {
      after = waiting();
      failed = (JSON.parse(localStorage.getItem(FAILED_KEY) ?? '{}') as Record<string, Array<{ id: string }>>).f1 ?? [];
    }
  });
  let failure: unknown;
  try { await replay(); }
  catch (error) { failure = error; }
  const inverse = before.find((line) => line.undoes);
  const later = before.at(-1);
  expect(inverse).toBeDefined();
  expect(later?.at).toBeGreaterThan(inverse?.at ?? Infinity);
  const failedIds = failed.map(({ id }) => id);
  expect(failedIds).toEqual(expect.arrayContaining(before.filter((line) => !line.undoes).map((line) => line.id)));
  expect(failedIds).not.toContain(inverse?.id);
  expect(after).toEqual([]);
  expect(failure).toMatchObject({
    message: expect.stringContaining('seed: -252134783, path: "22"'),
    cause: { actual: [`${later?.id} passed ${inverse?.id}`], expected: [],
      stack: expect.stringContaining('invariants') },
  });
});

// Test-model defect: sendWaiting retires an inverse of a refused original before the next send,
// but observeSettledInverses requires its outbox entry to disappear (only at the batch's end).
// Fix scope: the property's transport observer must recognize retirement within a flush,
// without treating a pending inverse as delivered or relaxing genuinely unresolved-head checks.
test.fails('AC1: seed -252134783 path 22 reproduces the FIFO break in TL-P4-28(2)', async () => {
  await replay();
});
