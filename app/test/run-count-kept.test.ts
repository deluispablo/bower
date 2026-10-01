import { describe, expect, it } from 'vitest';

import type { Run } from '../src/api.js';
import { chipModel } from '../src/components/run-chip.js';
import { runningTotal, sheetTitle } from '../src/components/working-sheet.js';
import { bubbleFor } from '../src/home.js';
import {
  keepRunCount,
  keptCountFor,
  readKeptCount,
  runningCount,
} from '../src/run-store.js';

/**
 * R-AD-8 (#914, #936 gate): the run store keeps the confirmed count when a
 * tidy-up starts, and the chip, the working sheet title and Home's running
 * bubble all read that one number, never the run's own total.
 */
function memoryStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

const AT = Date.parse('2026-09-30T11:57:00.000Z');

function runAsked(iso: string, total = 6): Run {
  const run: Run = { state: 'running', requestedAt: iso, total };
  return run;
}

describe('the kept, confirmed count of a tidy-up', () => {
  it('belongs to the run this browser started, not to one started elsewhere', () => {
    const storage = memoryStorage();
    keepRunCount(storage, 4, AT);
    const kept = readKeptCount(storage);
    expect(kept).toEqual({ count: 4, at: AT });
    expect(keptCountFor(runAsked('2026-09-30T11:57:02.000Z'), kept)).toBe(4);
    expect(keptCountFor(runAsked('2026-09-30T14:00:00.000Z'), kept)).toBeNull();
    expect(keptCountFor(null, kept)).toBeNull();
    expect(runningCount(null, 6)).toBe(6);
  });

  it('is the number the chip, the sheet title and the bubble all show', () => {
    const run = runAsked('2026-09-30T11:57:02.000Z', 6);
    const kept = keptCountFor(run, { count: 4, at: AT });
    const count = runningCount(kept, run.total);
    expect(count).toBe(4);

    const chip = chipModel({
      phase: 'running',
      run,
      lastFinished: null,
      resultSeen: false,
      now: AT + 60_000,
      desktop: false,
      count: kept,
    });
    expect(chip?.title).toBe('Tidying up 4 things');

    expect(sheetTitle('running', runningTotal(kept ?? 0, run.total))).toBe(
      'Tidying up 4 things',
    );

    const bubble = JSON.stringify(
      bubbleFor({
        state: 'running',
        pending: count ?? 0,
        offline: false,
        error: false,
        editingPins: false,
        lastFinished: null,
        now: AT + 60_000,
      }),
    );
    expect(bubble).toContain('4 things');
    expect(bubble).not.toContain('6 things');
  });
});
