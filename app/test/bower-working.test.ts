import { describe, expect, it } from 'vitest';

import {
  workingBird,
  workingClasses,
  workingLabel,
} from '../src/components/bower-working.js';
import {
  SHEET_LINGER_MS,
  sheetVisible,
  startedAgo,
  workingStateFor,
} from '../src/components/working-sheet.js';

describe('workingBird', () => {
  it('tidies while queued or running, shows off when done, is confused when failed or over quota', () => {
    expect(workingBird('queued')).toBe('tidying');
    expect(workingBird('running')).toBe('tidying');
    expect(workingBird('done')).toBe('showoff');
    expect(workingBird('failed')).toBe('confused');
    expect(workingBird('quota')).toBe('confused');
  });
});

describe('workingLabel', () => {
  it('keeps the texts under the animation', () => {
    expect(workingLabel('queued')).toBe('Tidying up…');
    expect(workingLabel('running')).toBe('Tidying up…');
    expect(workingLabel('done')).toBe('Done');
    expect(workingLabel('failed')).toBe('Something went wrong');
    expect(workingLabel('quota')).toBe('Limit reached');
  });
});

describe('workingClasses', () => {
  it('names the state', () => {
    expect(workingClasses('running', false)).toBe('bw bw--running');
    expect(workingClasses('failed', false)).toBe('bw bw--failed');
  });

  it('reduced motion: the still class, which shows the pulsing dot', () => {
    expect(workingClasses('running', true)).toBe('bw bw--running bw--still');
    expect(workingClasses('queued', true)).toBe('bw bw--queued bw--still');
  });
});

describe('sheetVisible', () => {
  it('shows while queued or running, however long', () => {
    expect(sheetVisible('queued', 0, false)).toBe(true);
    expect(sheetVisible('running', 10 * 60_000, false)).toBe(true);
  });

  it('lingers 3 s after done, failed, stale or over quota', () => {
    for (const phase of ['done', 'failed', 'stale', 'quota'] as const) {
      expect(sheetVisible(phase, 0, false)).toBe(true);
      expect(sheetVisible(phase, SHEET_LINGER_MS - 1, false)).toBe(true);
      expect(sheetVisible(phase, SHEET_LINGER_MS, false)).toBe(false);
    }
  });

  it('never shows once dismissed', () => {
    expect(sheetVisible('running', 0, true)).toBe(false);
    expect(sheetVisible('done', 0, true)).toBe(false);
  });

  it('never shows for idle', () => {
    expect(sheetVisible('idle', 0, false)).toBe(false);
  });
});

describe('workingStateFor', () => {
  it('maps run phases to animation states', () => {
    expect(workingStateFor('queued')).toBe('queued');
    expect(workingStateFor('running')).toBe('running');
    expect(workingStateFor('done')).toBe('done');
    expect(workingStateFor('failed')).toBe('failed');
    expect(workingStateFor('stale')).toBe('failed');
    expect(workingStateFor('quota')).toBe('quota');
    expect(workingStateFor('idle')).toBeNull();
  });
});

describe('startedAgo', () => {
  const requestedAt = '2026-09-27T12:00:00.000Z';
  const nowMs = Date.parse(requestedAt);

  it('says "just now" under a minute', () => {
    expect(startedAgo(requestedAt, nowMs)).toBe('Started just now');
    expect(startedAgo(requestedAt, nowMs + 59_000)).toBe('Started just now');
  });

  it('counts whole minutes since', () => {
    expect(startedAgo(requestedAt, nowMs + 60_000)).toBe('Started 1 min ago');
    expect(startedAgo(requestedAt, nowMs + 5 * 60_000)).toBe(
      'Started 5 min ago',
    );
  });
});
