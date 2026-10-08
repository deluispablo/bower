/** The timing line counts each checkpoint write once (P4-7 review), also when `putNew` falls back to `put`. */
import { describe, expect, it } from 'vitest';
import type { RunRecords } from '../../src/data/spine/records';
import { timeCheckpoints } from '../src/main';
import { RunTiming } from '../src/timing';

type Write = (...args: [unknown, unknown, string, string]) => Promise<void>;

describe('checkpoint timing', () => {
  it('a checkpoint written through the putNew fallback is counted once', async () => {
    for (const fallback of [false, true]) {
      const timing = new RunTiming();
      const records = {
        put: async (..._args: unknown[]): Promise<void> => {},
        putNew: async function (this: { put: Write }, ...args: [unknown, unknown, string, string]): Promise<void> {
          if (fallback) return this.put(...args);
        },
      };
      timeCheckpoints(records as unknown as RunRecords, timing);
      await records.putNew({} as never, {} as never, 'checkpoint-1-abc', 'a');
      await records.put({} as never, {} as never, 'checkpoint-2-def', 'b');
      await records.put({} as never, {} as never, 'manifest.json', 'c');
      expect(timing.line('done'), `fallback ${fallback}`).toMatch(/checkpoints=\d+\/2 /);
    }
  });
});
