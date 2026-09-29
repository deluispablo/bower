/**
 * `.bower/last-run.json`: the run's own record of how it ended, written
 * straight into the vault by the runner (`write_outcome`, `agent/run.sh`)
 * so the app can still show what happened when the Worker never heard the
 * final report (#315, #564). The counts, and since report v2 (#660) the
 * paths of what was filed (`items`), set aside (`setAside`) and added. Only
 * the file stays in the person's own Drive; the runner's log still carries
 * counts only, never a path or a file name.
 * Pure: no Drive, no cache; `vault-store.tsx` does the read.
 */

import type { RunItem, SetAsideItem } from './api.js';
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
  /** Report v2 (#583, R-RUN-4): each processed item with where it went
   * (`to`) and its old name (`renamedFrom`). Absent from an older runner. */
  items?: RunItem[];
  /** Report v2: what the run set aside and why. Absent from an older runner. */
  setAside?: SetAsideItem[];
  /** Report v2: one short clause about what Bower added. */
  added?: string;
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

const REASONS: readonly string[] = [
  'kept-not-read',
  'too-large',
  'unconvertible',
  'quarantined',
];
const ITEM_KINDS: readonly string[] = [
  'file',
  'question',
  'request',
  'context',
  'rule',
];

/** The report v2 items, dropping any entry that is not the expected shape. */
function parseItems(value: unknown): RunItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: RunItem[] = [];
  for (const raw of value as unknown[]) {
    if (!isRecord(raw)) continue;
    const { path, kind, to, renamedFrom } = raw;
    if (!isNonEmptyString(path)) continue;
    if (typeof kind !== 'string' || !ITEM_KINDS.includes(kind)) continue;
    const item = { path, kind } as RunItem;
    if (isNonEmptyString(to)) item.to = to;
    if (isNonEmptyString(renamedFrom)) item.renamedFrom = renamedFrom;
    items.push(item);
  }
  return items;
}

function parseSetAside(value: unknown): SetAsideItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: SetAsideItem[] = [];
  for (const raw of value as unknown[]) {
    if (!isRecord(raw)) continue;
    const { path, reason } = raw;
    if (!isNonEmptyString(path)) continue;
    if (typeof reason !== 'string' || !REASONS.includes(reason)) continue;
    items.push({ path, reason } as SetAsideItem);
  }
  return items;
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
  const {
    state,
    kind,
    runId,
    finishedAt,
    sentence,
    processed,
    quarantined,
    refused,
    reason,
    items,
    setAside,
    added,
  } = data;
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
  const parsedItems = parseItems(items);
  if (parsedItems !== undefined) outcome.items = parsedItems;
  const parsedSetAside = parseSetAside(setAside);
  if (parsedSetAside !== undefined) outcome.setAside = parsedSetAside;
  if (isNonEmptyString(added)) outcome.added = added;
  if (state === 'failed') outcome.reason = failureReason(reason);
  return outcome;
}
