/**
 * Fixture builders for a Worker `Run` (spec §7c item 5) in the five states
 * the app tells apart: running, done, partial (failed after writing notes,
 * R-RUNNER-5; the Worker keeps `state: failed`), failed (nothing changed)
 * and stale (marked failed by `markStale`).
 *
 * The app's twin is `app/test/fixtures/run-outcome-builders.ts`, which also
 * builds `.bower/last-run.json`; keep the two `buildRun`s in step. Every
 * builder takes overrides, so a test states only what it is about.
 */

import type { Run, RunItem, UpdatedItem } from '../../src/types.js';

export type RunFixtureState =
  'running' | 'done' | 'partial' | 'failed' | 'stale';

export const FIXTURE_RUN_ID = 'run-1';
export const FIXTURE_REQUESTED_AT = '2026-09-29T10:00:00.000Z';
export const FIXTURE_STARTED_AT = '2026-09-29T10:00:30.000Z';
export const FIXTURE_FINISHED_AT = '2026-09-29T10:06:00.000Z';

const FILED: [RunItem, RunItem] = [
  {
    path: '0-Inbox/Boiler receipt.pdf',
    kind: 'file',
    to: '2-Areas/Home/Boiler receipt.pdf',
  },
  {
    path: '0-Inbox/Flat notes.md',
    kind: 'file',
    to: '1-Projects/Flat/Flat notes.md',
  },
];
const CREATED: string[] = ['3-Resources/Boiler receipt summary.md'];
const UPDATED: UpdatedItem[] = [
  { path: '2-Areas/Home/Boiler.md', what: 'Added the next service date' },
];
const LEFT: string[] = ['0-Inbox/Lease.pdf'];

/** A Worker `Run` in `state`, with `overrides` on top. */
export function buildRun(
  state: RunFixtureState,
  overrides: Partial<Run> = {},
): Run {
  const base: Run = {
    state: 'running',
    kind: 'ingest',
    requestedAt: FIXTURE_REQUESTED_AT,
    startedAt: FIXTURE_STARTED_AT,
    runId: FIXTURE_RUN_ID,
  };
  const finished = { ...base, finishedAt: FIXTURE_FINISHED_AT };
  const runs: Record<RunFixtureState, Run> = {
    running: {
      ...base,
      phase: 'writing',
      total: 2,
      done: 1,
      phaseAt: '2026-09-29T10:02:00.000Z',
    },
    done: {
      ...finished,
      state: 'done',
      summary: 'Filed two things.',
      processed: FILED.map((item) => item.path),
      items: FILED.map((item) => ({ ...item })),
      created: [...CREATED],
      updated: UPDATED.map((item) => ({ ...item })),
      left: [],
    },
    partial: {
      ...finished,
      state: 'failed',
      reason: 'timeout',
      error: 'agent: out of turns',
      processed: [FILED[0].path],
      items: [{ ...FILED[0] }],
      created: [...CREATED],
      updated: UPDATED.map((item) => ({ ...item })),
      left: [...LEFT],
    },
    failed: {
      ...finished,
      state: 'failed',
      reason: 'drive_unavailable',
      error: 'sync down: drive',
      created: [],
      updated: [],
      left: [...LEFT],
    },
    stale: { ...finished, state: 'failed', error: 'stale' },
  };
  return { ...runs[state], ...overrides };
}
