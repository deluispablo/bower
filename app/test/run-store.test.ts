import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  nextPollDelay,
  pendingCount,
  POLL_TIMEOUT_MS,
  quotaMessage,
  reduce,
  resultMessage,
} from '../src/run-store.js';
import type { RunState } from '../src/run-store.js';
import type { Run } from '../src/api.js';

describe('quotaMessage', () => {
  it('renders hours and minutes past an hour', () => {
    expect(quotaMessage(12_000)).toBe(
      'Daily limit reached. Bower can run again in 3 h 20 min.',
    );
  });

  it('renders minutes only under an hour', () => {
    expect(quotaMessage(720)).toBe(
      'Daily limit reached. Bower can run again in 12 min.',
    );
  });

  it('rounds to the nearest minute', () => {
    expect(quotaMessage(90)).toBe(
      'Daily limit reached. Bower can run again in 2 min.',
    );
  });

  it('never says 0 min', () => {
    expect(quotaMessage(0)).toBe(
      'Daily limit reached. Bower can run again in 1 min.',
    );
    expect(quotaMessage(-5)).toBe(
      'Daily limit reached. Bower can run again in 1 min.',
    );
  });
});

describe('resultMessage', () => {
  const base: Run = { state: 'done', requestedAt: '2026-01-01T00:00:00.000Z' };

  it('says "Nothing new to process" for an empty or absent list', () => {
    expect(resultMessage(base)).toBe('Nothing new to process');
    expect(resultMessage({ ...base, processed: [] })).toBe(
      'Nothing new to process',
    );
  });

  it('uses the singular for one file', () => {
    expect(resultMessage({ ...base, processed: ['a.md'] })).toBe(
      '1 file processed',
    );
  });

  it('uses the plural for more than one', () => {
    expect(resultMessage({ ...base, processed: ['a.md', 'b.md'] })).toBe(
      '2 files processed',
    );
  });
});

describe('nextPollDelay', () => {
  it('polls every 5 s while queued and visible', () => {
    expect(nextPollDelay('queued', true, 0)).toBe(5_000);
  });

  it('polls every 5 s while running and visible', () => {
    expect(nextPollDelay('running', true, 60_000)).toBe(5_000);
  });

  it('stops for phases that are not active', () => {
    expect(nextPollDelay('idle', true, 0)).toBeNull();
    expect(nextPollDelay('done', true, 0)).toBeNull();
    expect(nextPollDelay('failed', true, 0)).toBeNull();
    expect(nextPollDelay('stale', true, 0)).toBeNull();
    expect(nextPollDelay('quota', true, 0)).toBeNull();
  });

  it('pauses while the tab is hidden', () => {
    expect(nextPollDelay('running', false, 0)).toBeNull();
  });

  it('stops at the 30-minute mark', () => {
    expect(nextPollDelay('running', true, POLL_TIMEOUT_MS - 1)).toBe(5_000);
    expect(nextPollDelay('running', true, POLL_TIMEOUT_MS)).toBeNull();
  });
});

describe('pendingCount', () => {
  function file(path: string, mimeType = 'text/markdown'): DriveFile {
    const name = path.split('/').at(-1) ?? path;
    return { id: path, name, mimeType, parents: [], path };
  }

  it('counts files directly under 0-Inbox and Clippings', () => {
    const files = [file('0-Inbox/receipt.pdf'), file('Clippings/article.md')];
    expect(pendingCount(files)).toBe(2);
  });

  it('counts files nested under a pending root', () => {
    expect(pendingCount([file('0-Inbox/Photos/img.jpg')])).toBe(1);
  });

  it('excludes files outside the pending roots', () => {
    expect(pendingCount([file('1-Projects/note.md')])).toBe(0);
  });

  it('excludes anything under Processed/', () => {
    expect(pendingCount([file('0-Inbox/Processed/receipt.pdf')])).toBe(0);
  });

  it('excludes folder notes (_*.md)', () => {
    expect(pendingCount([file('0-Inbox/_Notes.md')])).toBe(0);
  });

  it('excludes folders themselves', () => {
    expect(pendingCount([file('0-Inbox/Photos', FOLDER_MIME)])).toBe(0);
  });

  it('is 0 for an empty listing', () => {
    expect(pendingCount([])).toBe(0);
  });
});

describe('reduce', () => {
  const idle: RunState = { phase: 'idle', run: null };
  const queuedRun: Run = {
    state: 'queued',
    requestedAt: '2026-01-01T00:00:00.000Z',
  };

  it('process-started moves to queued (or running) with the new run', () => {
    expect(reduce(idle, { type: 'process-started', run: queuedRun })).toEqual({
      phase: 'queued',
      run: queuedRun,
    });
    const runningRun: Run = { ...queuedRun, state: 'running' };
    expect(reduce(idle, { type: 'process-started', run: runningRun })).toEqual({
      phase: 'running',
      run: runningRun,
    });
  });

  it('process-quota sets the message and retryAfter, keeping the prior run', () => {
    const state: RunState = { phase: 'queued', run: queuedRun };
    expect(
      reduce(state, {
        type: 'process-quota',
        retryAfter: 60,
        message: 'Daily limit reached. Bower can run again in 1 min.',
      }),
    ).toEqual({
      phase: 'quota',
      run: queuedRun,
      message: 'Daily limit reached. Bower can run again in 1 min.',
      retryAfter: 60,
    });
  });

  it('process-failed sets a short message, keeping the prior run', () => {
    expect(
      reduce(idle, { type: 'process-failed', message: 'Could not start.' }),
    ).toEqual({ phase: 'failed', run: null, message: 'Could not start.' });
  });

  it('status with stale:true moves to stale regardless of the run state', () => {
    const failedRun: Run = {
      state: 'failed',
      requestedAt: '2026-01-01T00:00:00.000Z',
      error: 'stale',
    };
    expect(
      reduce(idle, { type: 'status', run: failedRun, stale: true }),
    ).toEqual({
      phase: 'stale',
      run: failedRun,
      message: 'Bower did not answer; try again',
    });
  });

  it('status with no run goes idle', () => {
    expect(reduce(idle, { type: 'status', run: null, stale: false })).toEqual(
      idle,
    );
  });

  it('status with a done run sets the processed-files message', () => {
    const doneRun: Run = {
      state: 'done',
      requestedAt: '2026-01-01T00:00:00.000Z',
      processed: ['a.md', 'b.md'],
    };
    expect(
      reduce(idle, { type: 'status', run: doneRun, stale: false }),
    ).toEqual({ phase: 'done', run: doneRun, message: '2 files processed' });
  });

  it('status with a failed run uses run.error, falling back to a generic message', () => {
    const withError: Run = {
      state: 'failed',
      requestedAt: '2026-01-01T00:00:00.000Z',
      error: 'The runner could not reach Drive.',
    };
    expect(
      reduce(idle, { type: 'status', run: withError, stale: false }),
    ).toEqual({
      phase: 'failed',
      run: withError,
      message: 'The runner could not reach Drive.',
    });

    const withoutError: Run = {
      state: 'failed',
      requestedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(
      reduce(idle, { type: 'status', run: withoutError, stale: false }),
    ).toEqual({
      phase: 'failed',
      run: withoutError,
      message: 'Something went wrong',
    });
  });

  it('status with a queued/running run just tracks it, no message', () => {
    expect(
      reduce(idle, { type: 'status', run: queuedRun, stale: false }),
    ).toEqual({ phase: 'queued', run: queuedRun, message: undefined });
  });

  it('poll-timeout moves to stale, keeping the prior run', () => {
    const state: RunState = { phase: 'running', run: queuedRun };
    expect(reduce(state, { type: 'poll-timeout' })).toEqual({
      phase: 'stale',
      run: queuedRun,
      message: 'Bower did not answer; try again',
    });
  });

  it('done-timeout moves done to idle, keeping the message', () => {
    const state: RunState = {
      phase: 'done',
      run: queuedRun,
      message: '1 file processed',
    };
    expect(reduce(state, { type: 'done-timeout' })).toEqual({
      phase: 'idle',
      run: queuedRun,
      message: '1 file processed',
    });
  });

  it('done-timeout is a no-op outside the done phase', () => {
    const state: RunState = { phase: 'running', run: queuedRun };
    expect(reduce(state, { type: 'done-timeout' })).toBe(state);
  });

  it('reset always goes back to a clean idle state', () => {
    const state: RunState = {
      phase: 'quota',
      run: queuedRun,
      message: 'Daily limit reached.',
      retryAfter: 60,
    };
    expect(reduce(state, { type: 'reset' })).toEqual(idle);
  });
});
