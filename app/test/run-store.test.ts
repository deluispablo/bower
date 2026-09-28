import { describe, expect, it } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  lastFinishedRun,
  nextPollDelay,
  pendingCount,
  POLL_TIMEOUT_MS,
  quotaMessage,
  readSeenRunKey,
  reduce,
  resultMessage,
  runKey,
  STARTING_MESSAGE,
  writeSeenRunKey,
} from '../src/run-store.js';
import type { RunSheetStorage, RunState } from '../src/run-store.js';
import type { Run } from '../src/api.js';

/** A plain in-memory stand-in for `sessionStorage` (`RunSheetStorage`). */
function fakeStorage(initial: Record<string, string> = {}): RunSheetStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

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

  it('never counts the "What is this?" context note (#446)', () => {
    expect(
      resultMessage({
        ...base,
        processed: ['a.md', '0-Inbox/Bower - 2026-09-27 0815 Context.md'],
      }),
    ).toBe('1 file processed');
    expect(
      resultMessage({
        ...base,
        processed: ['0-Inbox/Bower - 2026-09-27 0815 Context.md'],
      }),
    ).toBe('Nothing new to process');
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

describe('runKey', () => {
  it("uses the runner's id when there is one, else the request time", () => {
    expect(runKey({ state: 'queued', requestedAt: 'T1', runId: 'run-1' })).toBe(
      'run-1',
    );
    expect(runKey({ state: 'queued', requestedAt: 'T1' })).toBe('T1');
  });
});

describe('readSeenRunKey / writeSeenRunKey (#497)', () => {
  it('round-trips a key through the same storage', () => {
    const storage = fakeStorage();
    expect(readSeenRunKey(storage)).toBeNull();
    writeSeenRunKey(storage, 'run-1');
    expect(readSeenRunKey(storage)).toBe('run-1');
  });

  it('a null key clears whatever was stored', () => {
    const storage = fakeStorage({ 'bower-run-sheet-seen': 'run-1' });
    writeSeenRunKey(storage, null);
    expect(readSeenRunKey(storage)).toBeNull();
  });

  it('fails closed when storage throws (private mode, quota)', () => {
    const throwing: RunSheetStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeenRunKey(throwing)).toBeNull();
    expect(() => writeSeenRunKey(throwing, 'run-1')).not.toThrow();
  });
});

describe('reduce', () => {
  const closed = { sheetOpen: false, sheetRunId: null };
  const idle: RunState = { phase: 'idle', run: null, ...closed };
  const queuedRun: Run = {
    state: 'queued',
    requestedAt: '2026-01-01T00:00:00.000Z',
  };
  const runningRun: Run = { ...queuedRun, state: 'running' };
  const doneRun: Run = {
    ...queuedRun,
    state: 'done',
    processed: ['a.md', 'b.md'],
  };
  const openFor = { sheetOpen: true, sheetRunId: queuedRun.requestedAt };

  it('process-started moves to queued (or running) and opens the sheet', () => {
    expect(reduce(idle, { type: 'process-started', run: queuedRun })).toEqual({
      phase: 'queued',
      run: queuedRun,
      ...openFor,
    });
    expect(reduce(idle, { type: 'process-started', run: runningRun })).toEqual({
      phase: 'running',
      run: runningRun,
      ...openFor,
    });
  });

  it('process-started for the run already in flight keeps a closed sheet closed', () => {
    const state: RunState = {
      phase: 'running',
      run: runningRun,
      sheetOpen: false,
      sheetRunId: queuedRun.requestedAt,
    };
    expect(
      reduce(state, { type: 'process-started', run: runningRun }).sheetOpen,
    ).toBe(false);
  });

  it('process-quota sets the message and retryAfter, keeping the prior run', () => {
    const state: RunState = { phase: 'queued', run: queuedRun, ...openFor };
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
      ...openFor,
    });
  });

  it('process-failed sets a short message, keeping the prior run', () => {
    expect(
      reduce(idle, { type: 'process-failed', message: 'Could not start.' }),
    ).toEqual({
      phase: 'failed',
      run: null,
      message: 'Could not start.',
      ...closed,
    });
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
      ...closed,
    });
  });

  it('status with no run goes idle and closes the sheet', () => {
    expect(reduce(idle, { type: 'status', run: null, stale: false })).toEqual(
      idle,
    );
    const state: RunState = { phase: 'running', run: runningRun, ...openFor };
    expect(reduce(state, { type: 'status', run: null, stale: false })).toEqual({
      ...idle,
      sheetRunId: openFor.sheetRunId,
    });
  });

  it('status with a queued/running run opens the sheet the first time only', () => {
    const first = reduce(idle, {
      type: 'status',
      run: queuedRun,
      stale: false,
    });
    expect(first).toEqual({
      phase: 'queued',
      run: queuedRun,
      message: undefined,
      ...openFor,
    });

    const dismissed = reduce(first, { type: 'sheet-dismissed' });
    expect(dismissed.sheetOpen).toBe(false);
    const again = reduce(dismissed, {
      type: 'status',
      run: runningRun,
      stale: false,
    });
    expect(again.phase).toBe('running');
    expect(again.sheetOpen).toBe(false);
  });

  it('a run already seen (sheetRunId seeded, as after a reload, #497) never reopens', () => {
    // The provider seeds its initial `sheetRunId` from `sessionStorage`
    // (`readSeenRunKey`) rather than always starting at `IDLE_STATE`'s
    // `null` — this is that seeded state, dismissed or not, reached fresh
    // (as on a reload) with no `process-started` in this session's memory.
    const seeded: RunState = {
      phase: 'idle',
      run: null,
      sheetOpen: false,
      sheetRunId: runKey(queuedRun),
    };
    const state = reduce(seeded, {
      type: 'status',
      run: runningRun,
      stale: false,
    });
    expect(state.phase).toBe('running');
    expect(state.sheetOpen).toBe(false);
  });

  it('status with a new run opens the sheet again', () => {
    const state: RunState = {
      phase: 'idle',
      run: doneRun,
      sheetOpen: false,
      sheetRunId: queuedRun.requestedAt,
    };
    const next: Run = { ...queuedRun, requestedAt: '2026-01-02T00:00:00.000Z' };
    expect(reduce(state, { type: 'status', run: next, stale: false })).toEqual({
      phase: 'queued',
      run: next,
      message: undefined,
      sheetOpen: true,
      sheetRunId: next.requestedAt,
    });
  });

  it('status with a done run after running sets the processed-files message', () => {
    const state: RunState = { phase: 'running', run: runningRun, ...openFor };
    expect(
      reduce(state, { type: 'status', run: doneRun, stale: false }),
    ).toEqual({
      phase: 'done',
      run: doneRun,
      message: '2 files processed',
      ...openFor,
    });
  });

  it('status with a run already done when first heard of goes straight to idle', () => {
    expect(
      reduce(idle, { type: 'status', run: doneRun, stale: false }),
    ).toEqual({
      phase: 'idle',
      run: doneRun,
      message: '2 files processed',
      ...closed,
    });
  });

  it("status with a failed run says the reason's sentence, never run.error (#375)", () => {
    const withError: Run = {
      state: 'failed',
      requestedAt: '2026-01-01T00:00:00.000Z',
      error: 'sync up: copy failed',
      reason: 'drive_unavailable',
    };
    expect(
      reduce(idle, { type: 'status', run: withError, stale: false }),
    ).toEqual({
      phase: 'failed',
      run: withError,
      message:
        'Google Drive stopped answering half way through copying things back.',
      ...closed,
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
      message: 'Something went wrong before Bower could finish.',
      ...closed,
    });
  });

  it('poll-timeout moves to stale, keeping the prior run', () => {
    const state: RunState = { phase: 'running', run: queuedRun, ...openFor };
    expect(reduce(state, { type: 'poll-timeout' })).toEqual({
      phase: 'stale',
      run: queuedRun,
      message: 'Bower did not answer; try again',
      ...openFor,
    });
  });

  it('sheet-dismissed during done goes back to idle at once (#506: the only way out of done)', () => {
    const state: RunState = {
      phase: 'done',
      run: doneRun,
      message: '2 files processed',
      ...openFor,
    };
    expect(reduce(state, { type: 'sheet-dismissed' })).toEqual({
      phase: 'idle',
      run: doneRun,
      message: '2 files processed',
      sheetOpen: false,
      sheetRunId: openFor.sheetRunId,
    });
  });

  it('sheet-dismissed during a run only closes the sheet', () => {
    const state: RunState = { phase: 'running', run: runningRun, ...openFor };
    expect(reduce(state, { type: 'sheet-dismissed' })).toEqual({
      ...state,
      sheetOpen: false,
    });
  });

  it('sheet-opened opens the sheet without touching the run', () => {
    const state: RunState = {
      phase: 'running',
      run: runningRun,
      sheetOpen: false,
      sheetRunId: openFor.sheetRunId,
    };
    expect(reduce(state, { type: 'sheet-opened' })).toEqual({
      ...state,
      sheetOpen: true,
    });
  });

  it('starting (#505) opens the sheet and sets its own message at once, before any run exists', () => {
    expect(reduce(idle, { type: 'starting' })).toEqual({
      phase: 'starting',
      run: null,
      message: STARTING_MESSAGE,
      sheetOpen: true,
      sheetRunId: null,
    });
  });

  it('starting then process-started continues as an ordinary run (#505)', () => {
    const starting = reduce(idle, { type: 'starting' });
    expect(
      reduce(starting, { type: 'process-started', run: queuedRun }),
    ).toEqual({
      phase: 'queued',
      run: queuedRun,
      ...openFor,
    });
  });

  it('starting then a failure to start ends in failed, with its own sentence (#505)', () => {
    const starting = reduce(idle, { type: 'starting' });
    const state = reduce(starting, {
      type: 'process-failed',
      message: 'Could not start. Try again.',
    });
    expect(state.phase).toBe('failed');
    expect(state.message).toBe('Could not start. Try again.');
    expect(state.sheetOpen).toBe(true);
  });

  it('a whole run: the sheet opens once, stays done until dismissed (#506)', () => {
    let state = reduce(idle, { type: 'process-started', run: queuedRun });
    expect(state.sheetOpen).toBe(true);
    state = reduce(state, { type: 'sheet-dismissed' });
    for (const run of [queuedRun, runningRun, runningRun]) {
      state = reduce(state, { type: 'status', run, stale: false });
      expect(state.sheetOpen).toBe(false);
    }
    state = reduce(state, { type: 'status', run: doneRun, stale: false });
    expect(state.phase).toBe('done');
    expect(state.sheetOpen).toBe(false);
    // Nothing on a timer moves this on any more: it stays done until the
    // sheet itself is dismissed, however long that takes.
    state = reduce(state, { type: 'sheet-dismissed' });
    expect(state.phase).toBe('idle');
    expect(state.message).toBe('2 files processed');
  });

  it('reset always goes back to a clean idle state', () => {
    const state: RunState = {
      phase: 'quota',
      run: queuedRun,
      message: 'Daily limit reached.',
      retryAfter: 60,
      ...openFor,
    };
    expect(reduce(state, { type: 'reset' })).toEqual(idle);
  });
});

describe('lastFinishedRun (#321)', () => {
  const at = '2026-09-27T08:00:00Z';
  const done: Run = { state: 'done', requestedAt: at, processed: ['a'] };
  const failed: Run = { state: 'failed', requestedAt: at };
  const running: Run = { state: 'running', requestedAt: at };

  it('takes a run that ended, done or failed', () => {
    expect(lastFinishedRun(null, done)).toBe(done);
    expect(lastFinishedRun(done, failed)).toBe(failed);
  });

  it('keeps the one before while the next run goes, or none is known', () => {
    expect(lastFinishedRun(done, running)).toBe(done);
    expect(lastFinishedRun(done, null)).toBe(done);
    expect(lastFinishedRun(null, running)).toBeNull();
  });
});
