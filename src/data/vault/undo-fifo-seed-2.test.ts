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

test('AC1: the corrected model accepts an inverse retired during the same refused flush', async () => {
  let before: JournalRecord[] = [];
  let failed: Array<{ id: string }> = [];
  let after: JournalRecord[] = [];
  const waiting = (): JournalRecord[] =>
    (JSON.parse(localStorage.getItem(outboxKey('f1')) ?? '[]') as Array<{ line: JournalRecord }>).map(({ line }) => line);
  const flush = Journal.prototype.flush;
  vi.spyOn(Journal.prototype, 'flush').mockImplementation(async function (this: Journal) {
    const queued = waiting();
    const capturesRetirement = queued.some((line) => line.undoes && line.at < (queued.at(-1)?.at ?? -Infinity));
    if (capturesRetirement) before = queued;
    try { return await flush.call(this); }
    finally {
      if (capturesRetirement) {
        after = waiting();
        failed = (JSON.parse(localStorage.getItem(FAILED_KEY) ?? '{}') as Record<string, Array<{ id: string }>>).f1 ?? [];
      }
    }
  });
  await replay();
  const inverse = before.find((line) => line.undoes);
  const later = before.at(-1);
  expect(inverse).toBeDefined();
  expect(later?.at).toBeGreaterThan(inverse?.at ?? Infinity);
  const failedIds = failed.map(({ id }) => id);
  expect(failedIds).toEqual(expect.arrayContaining(before.filter((line) => !line.undoes).map((line) => line.id)));
  expect(failedIds).not.toContain(inverse?.id);
  expect(after).toEqual([]);
});

test('AC1: seed -252134783 path 22 recognises same-flush inverse retirement', async () => {
  await replay();
});
