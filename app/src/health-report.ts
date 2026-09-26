/**
 * The weekly health check's report: `Lint Report.md` at the top of the
 * Bower folder, written by the scheduled lint run (`agent/prompts/lint.md`).
 * Pure helpers only; the screen is `routes/health.tsx`.
 */

import type { DriveFile } from './drive.js';
import type { VaultIndex } from './vault-index.js';

/** Where `agent/prompts/lint.md` writes the report, relative to the folder. */
export const REPORT_PATH = 'Lint Report.md';

/** The report's file in `index`, or `undefined` before the first check. */
export function findReport(index: VaultIndex): DriveFile | undefined {
  return index.byPath.get(REPORT_PATH);
}

/**
 * Whether the report changed after the health screen was last opened.
 * `modifiedTime` is the report's Drive timestamp (absent: no report, never
 * new); `lastSeen` is the ISO time stored when the screen was last opened
 * (empty or unreadable: never opened, so any report is new).
 */
export function isReportNew(
  modifiedTime: string | undefined,
  lastSeen: string,
): boolean {
  if (modifiedTime === undefined) return false;
  const modified = Date.parse(modifiedTime);
  if (Number.isNaN(modified)) return false;
  const seen = Date.parse(lastSeen);
  if (Number.isNaN(seen)) return true;
  return modified > seen;
}
