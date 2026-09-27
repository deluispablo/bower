/**
 * The weekly health check's report: `Lint Report.md` at the top of the
 * Bower folder, written by the scheduled lint run (`agent/prompts/lint.md`).
 * Pure helpers only; the screen is `routes/health.tsx`.
 *
 * The report is a note like any other: YAML frontmatter (`notes`,
 * `findings`, `brokenLinks`, the three headline figures) followed by a
 * short body with a `- [ ]` checklist of proposals the owner can tick
 * (`agent/prompts/lint.md` step 4). `summarise` and `findingsIn` read the
 * two halves `markdown/frontmatter.ts#parseFrontmatter` already splits the
 * note into.
 */

import type { DriveFile } from './drive.js';
import type { Frontmatter } from './markdown/frontmatter.js';
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

export interface HealthCounts {
  notes: number;
  findings: number;
  brokenLinks: number;
}

/** A whole, non-negative count, or `0` for a present-but-invalid value (missing, text, negative). */
function toCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

const COUNT_KEYS = ['notes', 'findings', 'brokenLinks'] as const;

/**
 * The three headline figures (spec §6, Health check row) from a parsed
 * report: `notes`, `findings` and `brokenLinks`, read from its frontmatter.
 * `undefined` when none of the three keys is present at all — a report from
 * before the runner started writing them (#295) — so the screen hides the
 * figures instead of showing zeros as fact (issue #305). A key that is
 * present but not a valid count (text, negative) still reads as zero.
 */
export function summarise(report: Frontmatter): HealthCounts | undefined {
  const written = COUNT_KEYS.some((key) => report.data[key] !== undefined);
  if (!written) return undefined;
  return {
    notes: toCount(report.data.notes),
    findings: toCount(report.data.findings),
    brokenLinks: toCount(report.data.brokenLinks),
  };
}

export interface HealthFinding {
  /** The checklist item's own line: what to fix. */
  text: string;
  /** Detail after a colon, when the runner added one (names, a reason). */
  detail?: string;
}

/**
 * The report body's `- [ ]` checklist (`agent/prompts/lint.md` step 4) as
 * the findings list `routes/health.tsx` shows. A line with a colon splits
 * into a short title and its detail, same as the design's findings rows;
 * one without a colon keeps its whole text.
 */
export function findingsIn(body: string): HealthFinding[] {
  const findings: HealthFinding[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^-\s*\[[ xX]\]\s*(.+)$/.exec(line.trim());
    if (match === null) continue;
    const item = (match[1] ?? '').trim();
    const colon = item.indexOf(':');
    if (colon > 0 && colon < item.length - 1) {
      findings.push({
        text: item.slice(0, colon).trim(),
        detail: item.slice(colon + 1).trim(),
      });
    } else {
      findings.push({ text: item });
    }
  }
  return findings;
}

// The app's copy is English-only (`CLAUDE.md`); `toLocaleDateString` would
// follow the device's language instead, so this is the one formatter dates
// go through (issue #305).
const ENGLISH_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const; // prettier-ignore

/** "Jun 7": the report's Drive-modified date, for the bubble and `fixMessage`. `''` for an unreadable date. */
export function reportDateLabel(modifiedTime: string): string {
  const date = new Date(modifiedTime);
  if (Number.isNaN(date.getTime())) return '';
  return `${ENGLISH_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * The message "Ask Bower to fix these" (`routes/health.tsx`) prefills into
 * Tell Bower, through its `?text=` query parameter. `dateLabel` is
 * `reportDateLabel`'s output; no personal data, only the report's date.
 */
export function fixMessage(dateLabel: string): string {
  return dateLabel === ''
    ? 'Fix what the health check found'
    : `Fix what the health check from ${dateLabel} found`;
}
