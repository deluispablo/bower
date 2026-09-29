/**
 * Fixture builders for a run's outcome (spec §7c item 5): the Worker's `Run`
 * (`GET /status`, `GET /runs`) and the runner's `.bower/last-run.json`, in
 * the five states the app tells apart: running, done, partial (failed after
 * writing notes, R-RUNNER-5), failed (nothing changed) and stale (the Worker
 * gave up; the file still says how the run ended).
 *
 * The Worker's twin is `api/test/fixtures/run-outcome-builders.ts`; keep the
 * two `buildRun`s in step. Every builder takes overrides, so a test states
 * only what it is about.
 */

import type { Run, RunItem, UpdatedItem } from '../../src/api.js';
import type { LastRunOutcome } from '../../src/last-run.js';

export type RunFixtureState = 'running' | 'done' | 'partial' | 'failed' | 'stale';

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
export function buildRun(state: RunFixtureState, overrides: Partial<Run> = {}): Run {
  const base: Run = {
    state: 'running',
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

/**
 * `.bower/last-run.json` as the runner writes it: `LastRunOutcome` plus the
 * R-RUNNER-2 arrays (`created`, `updated`, `left`), which the parser may not
 * read yet.
 */
export interface LastRunFile extends LastRunOutcome {
  created?: string[];
  updated?: UpdatedItem[];
  left?: string[];
}

/**
 * The runner's `last-run.json` for a run in `state`. The runner never writes
 * a running file, so `running` is not a state here; `stale` is the file of a
 * run that finished while the Worker had already marked it stale: done, with
 * everything it did (R-RUNNER-2).
 */
export function buildLastRun(
  state: Exclude<RunFixtureState, 'running'>,
  overrides: Partial<LastRunFile> = {},
): LastRunFile {
  const base = {
    kind: 'ingest',
    runId: FIXTURE_RUN_ID,
    finishedAt: '2026-09-29T10:06:00Z',
    quarantined: 0,
    refused: 0,
  };
  const done: LastRunFile = {
    ...base,
    state: 'done',
    sentence: 'Done: 2 filed, 1 new note, 1 updated',
    processed: FILED.length,
    items: FILED.map((item) => ({ ...item })),
    setAside: [],
    created: [...CREATED],
    updated: UPDATED.map((item) => ({ ...item })),
    left: [],
  };
  const files: Record<Exclude<RunFixtureState, 'running'>, LastRunFile> = {
    done,
    stale: { ...done },
    partial: {
      ...base,
      state: 'failed',
      reason: 'timeout',
      sentence: 'Partly done: 1 still in your inbox',
      processed: 1,
      items: [{ ...FILED[0] }],
      created: [...CREATED],
      updated: UPDATED.map((item) => ({ ...item })),
      left: [...LEFT],
    },
    failed: {
      ...base,
      state: 'failed',
      reason: 'drive_unavailable',
      sentence: 'Did not finish: nothing changed',
      processed: 0,
      created: [],
      updated: [],
      left: [...LEFT],
    },
  };
  return { ...files[state], ...overrides };
}

/** `buildLastRun`'s file as the text in Drive. */
export function lastRunJson(
  state: Exclude<RunFixtureState, 'running'>,
  overrides: Partial<LastRunFile> = {},
): string {
  return JSON.stringify(buildLastRun(state, overrides));
}
