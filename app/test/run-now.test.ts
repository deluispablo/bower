import { describe, expect, it, vi } from 'vitest';

import {
  QUOTA_DAY_KEY,
  RUN_NOW_REASONS,
  dayKey,
  markQuotaReached,
  quotaReachedToday,
  runNow,
  runNowBlock,
} from '../src/run-now.js';
import type { DayStorage } from '../src/run-now.js';

function memory(): DayStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('runNow', () => {
  it('starts an instructions run only after the note write settles', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const write = new Promise<void>((resolve) => {
      release = () => {
        order.push('written');
        resolve();
      };
    });
    const startRun = vi.fn().mockImplementation(() => {
      order.push('run');
      return Promise.resolve(true);
    });
    const pending = runNow({ settle: () => write, startRun });
    await Promise.resolve();
    expect(startRun).not.toHaveBeenCalled();
    release();
    await expect(pending).resolves.toBe(true);
    expect(order).toEqual(['written', 'run']);
    expect(startRun).toHaveBeenCalledWith('instructions');
  });

  it('starts no run when the write fails', async () => {
    const startRun = vi.fn().mockResolvedValue(true);
    await expect(
      runNow({ settle: () => Promise.reject(new Error('offline')), startRun }),
    ).rejects.toThrow('offline');
    expect(startRun).not.toHaveBeenCalled();
  });

  it('says false when the run did not start', async () => {
    const startRun = vi.fn().mockResolvedValue(false);
    await expect(runNow({ startRun })).resolves.toBe(false);
  });
});

describe('runNowBlock', () => {
  const free = { runInFlight: false, online: true, quotaReached: false };

  it('is usable when nothing blocks it', () => {
    expect(runNowBlock(free)).toBeNull();
  });

  it('names a run in flight, no signal and no runs left', () => {
    expect(runNowBlock({ ...free, runInFlight: true })).toBe('running');
    expect(runNowBlock({ ...free, online: false })).toBe('offline');
    expect(runNowBlock({ ...free, quotaReached: true })).toBe('quota');
    expect(RUN_NOW_REASONS).toEqual({
      running: 'A tidy-up is running',
      offline: 'No signal',
      quota: 'No runs left today',
    });
  });
});

describe('quota latch', () => {
  it('holds for the rest of the day and lets go the next one', () => {
    const storage = memory();
    const morning = new Date(2026, 8, 29, 9, 0);
    expect(quotaReachedToday(storage, morning)).toBe(false);
    markQuotaReached(storage, morning);
    expect(storage.data.get(QUOTA_DAY_KEY)).toBe(dayKey(morning));
    expect(quotaReachedToday(storage, new Date(2026, 8, 29, 23, 59))).toBe(
      true,
    );
    expect(quotaReachedToday(storage, new Date(2026, 8, 30, 0, 1))).toBe(false);
  });

  it('survives storage that throws', () => {
    const broken: DayStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => markQuotaReached(broken, new Date())).not.toThrow();
    expect(quotaReachedToday(broken, new Date())).toBe(false);
  });
});
