/**
 * `.bower/last-run.json`: the run's own record of how it ended, written
 * straight into the vault by the runner (`write_outcome`, `agent/run.sh`)
 * so the app can still show what happened when the Worker never heard the
 * final report (#315, #564). Counts only, never a path or a file name —
 * the runner writes none in here, by design (same file, same comment).
 * Pure: no Drive, no cache; `vault-store.tsx` does the read.
 */

import { failureReason } from './run-failure.js';
import type { RunFailureReason } from './run-failure.js';

export type LastRunState = 'done' | 'failed';

export interface LastRunOutcome {
  state: LastRunState;
  /** The runner's mode, as written (`ingest` today; a lint run never
   * writes this file, so nothing else is expected, but the raw string is
   * kept rather than narrowed). */
  kind: string;
  runId: string;
  /** UTC, `date -u +%FT%TZ`. */
  finishedAt: string;
  /** The one sentence the working sheet and the Last tidy-up card show. */
  sentence: string;
  processed: number;
  quarantined: number;
  refused: number;
  /** Only on a failed run; unrecognised or missing reads as `unknown`
   * (`failureReason`, `run-failure.ts`), same as a Worker-reported run. */
  reason?: RunFailureReason;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/**
 * Parses `.bower/last-run.json`'s text. `null` on anything that is not the
 * shape `write_outcome` writes: malformed JSON, a missing or wrong-typed
 * field, or a `state` other than `done`/`failed` — the store then falls
 * back to its plain "did not answer" message, exactly as if the file were
 * not there. Never throws.
 */
export function parseLastRun(text: string): LastRunOutcome | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const { state, kind, runId, finishedAt, sentence, processed, quarantined, refused, reason } =
    data;
  if (state !== 'done' && state !== 'failed') return null;
  if (!isNonEmptyString(kind)) return null;
  if (!isNonEmptyString(runId)) return null;
  if (!isNonEmptyString(finishedAt)) return null;
  if (!isNonEmptyString(sentence)) return null;
  if (!isNonNegativeInt(processed)) return null;
  if (!isNonNegativeInt(quarantined)) return null;
  if (!isNonNegativeInt(refused)) return null;

  const outcome: LastRunOutcome = {
    state,
    kind,
    runId,
    finishedAt,
    sentence,
    processed,
    quarantined,
    refused,
  };
  if (state === 'failed') outcome.reason = failureReason(reason);
  return outcome;
}
