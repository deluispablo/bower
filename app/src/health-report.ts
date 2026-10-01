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

/** A `**bold**` run (no nested `**`), for `splitFinding` to skip its colons. */
const STRONG_RUN = /\*\*(?:[^*]|\*(?!\*))+\*\*/g;

/**
 * Whether the colon at `item[i]` sits inside a `**bold**` run — punctuation
 * that belongs to the finding's own markdown, never a title/detail
 * separator (issue #492: `**Orphan file: <path>.**` used to lose its
 * closing `**` to a split mid-span).
 */
function colonInsideStrongRun(item: string, i: number): boolean {
  for (const match of item.matchAll(STRONG_RUN)) {
    if (match.index === undefined) continue;
    if (i > match.index && i < match.index + match[0].length) return true;
  }
  return false;
}

/** Whether the colon at `item[i]` sits between two digits, an "hh:mm" time (#492: "14:44" used to split into "…14" / "44…"). */
function colonInsideTime(item: string, i: number): boolean {
  return /\d/.test(item[i - 1] ?? '') && /\d/.test(item[i + 1] ?? '');
}

/**
 * One checklist item's title and detail: the text up to the first colon
 * that is real title/detail punctuation — not one inside a `**bold**` run
 * and not one inside an "hh:mm" time — becomes the title, the rest the
 * detail. An item with no such colon keeps its whole text as the title.
 * Markdown (`**bold**`, backticks, wikilinks) is left untouched either
 * way; `routes/health.tsx` renders both fields through the note renderer.
 */
function splitFinding(item: string): HealthFinding {
  for (let i = 0; i < item.length; i++) {
    if (item[i] !== ':') continue;
    if (i === 0 || i === item.length - 1) continue;
    if (colonInsideStrongRun(item, i) || colonInsideTime(item, i)) continue;
    return {
      text: item.slice(0, i).trim(),
      detail: item.slice(i + 1).trim(),
    };
  }
  return { text: item };
}

/**
 * Whether any finding is one of the memory-hygiene flags the lint prompt's
 * step 4 raises for `Rules.md` (a credential-shaped line, a personal
 * identifier, a health or financial detail): the runner titles these
 * "Urgent: …". The Health bubble (`routes/health.tsx`) drops its "good
 * shape" claim when one is present (#496), whatever the findings count.
 */
export function hasUrgentFinding(findings: HealthFinding[]): boolean {
  return findings.some((finding) => /^urgent\b/i.test(finding.text.trim()));
}

/**
 * The report body's `- [ ]` checklist (`agent/prompts/lint.md` step 4) as
 * the findings list `routes/health.tsx` shows, each parsed as Markdown with
 * `splitFinding` above.
 */
export function findingsIn(body: string): HealthFinding[] {
  const findings: HealthFinding[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^-\s*\[[ xX]\]\s*(.+)$/.exec(line.trim());
    if (match === null) continue;
    findings.push(splitFinding((match[1] ?? '').trim()));
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
 * `modifiedTime` rounded down to local midnight, as an ISO string
 * `navigation.ts`'s `relativeTime` can diff: Home's Health card (#447)
 * needs "Checked today/yesterday" to agree with this file's own
 * calendar-day dates (`reportDateLabel`, `bubbleText`) instead of counting
 * a rolling 24 hours back from the moment the card renders, which still
 * called Sunday night's report "today" on Monday morning. `''` for an
 * unreadable date.
 */
export function reportDayStart(modifiedTime: string): string {
  const date = new Date(modifiedTime);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).toISOString();
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

const DAY_MS = 24 * 60 * 60 * 1000;

// Same reasoning as `ENGLISH_MONTHS` above: no `toLocaleDateString`, ever.
const ENGLISH_WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const; // prettier-ignore

/**
 * "Today" / "Yesterday" / "Last Wednesday" / "Sep 20": one relative label
 * for the report's calendar day (`reportDayStart`, #447), the single
 * source for "when" the Notes tab row (`healthRowSubtitle`), the Home
 * card and the Health screen's own bubble all read from, so the three
 * never again disagree (#496: "Sunday · not checked yet" next to
 * "Checked yesterday" next to the Sep 27 report). `now`: `Date.now()` in
 * the app, injected here for tests. An unreadable `modifiedTime` falls
 * back to `'Sunday'`, the day the check runs, same as no report at all.
 */
export function checkWhen(modifiedTime: string, now: number): string {
  const dayStart = reportDayStart(modifiedTime);
  if (dayStart === '') return 'Sunday';
  const days = Math.floor(Math.max(0, now - Date.parse(dayStart)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `Last ${ENGLISH_WEEKDAYS[new Date(dayStart).getDay()]}`;
  return reportDateLabel(modifiedTime);
}

/**
 * The Notes tab's compact Health row subtitle (#353, C.5): "Last Sunday ·
 * 2 small things to fix". `when` is `checkWhen`'s output (or the literal
 * `'Sunday'` default, before any report has ever loaded); `undefined`
 * findings: no report parsed yet (loading, offline, or none written), so
 * the row names the day without a claim about its contents.
 */
export function healthRowSubtitle(
  findings: number | undefined,
  when = 'Sunday',
): string {
  // #584: never a day next to "not checked yet".
  if (findings === undefined) return 'Not checked yet';
  const checked = `Checked ${lowerRelative(when)}`;
  if (findings === 0) return `${checked} · your notes are in good shape`;
  const count = findings === 1 ? 'one small thing' : `${findings} small things`;
  return `${checked} · ${count} to fix`;
}

/** "Yesterday" reads "yesterday" after "Checked"; a weekday or a date
 * keeps its capital. */
function lowerRelative(when: string): string {
  return /^(Today|Yesterday|Last )/.test(when)
    ? `${when.charAt(0).toLowerCase()}${when.slice(1)}`
    : when;
}
