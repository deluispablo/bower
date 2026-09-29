import { findKeyLine, splitFrontmatter } from './markdown/frontmatter.js';
import { setFrontmatterValue } from './compare.js';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const HISTORY_HEADING = /^##[ \t]+History[ \t]*$/;
const ANY_H2 = /^##[ \t]+\S/;

/** "29 Sep": the date of a History line. */
export function historyDate(now: Date): string {
  return `${now.getDate()} ${MONTHS[now.getMonth()] ?? ''}`;
}

/** The note's current `status:` value, or "" when it has none. */
export function readStatus(text: string): string {
  const { lines } = splitFrontmatter(text);
  if (lines === null) return '';
  const at = findKeyLine(lines, 'status');
  if (at === -1) return '';
  const line = lines[at] ?? '';
  const value = line.slice(line.indexOf(':') + 1).trim();
  return value.replace(/^(["'])(.*)\1$/, '$2');
}

/**
 * Appends one dated line to the `## History` section, creating the section
 * at the end of the note when it is missing. Never touches earlier lines.
 */
export function appendHistoryLine(text: string, line: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const rows = text.split(/\r?\n/);
  const start = rows.findIndex((row) => HISTORY_HEADING.test(row));
  if (start === -1) {
    const body = text.replace(/(\r?\n)+$/, '');
    return `${body}${eol}${eol}## History${eol}${eol}- ${line}${eol}`;
  }
  let end = rows.length;
  for (let i = start + 1; i < rows.length; i += 1) {
    if (ANY_H2.test(rows[i] ?? '')) {
      end = i;
      break;
    }
  }
  let last = end - 1;
  while (last > start && (rows[last] ?? '').trim() === '') last -= 1;
  const next = [...rows];
  if (last === start) next.splice(last + 1, 0, '', `- ${line}`);
  else next.splice(last + 1, 0, `- ${line}`);
  return next.join(eol);
}

/**
 * The note with its status set and a "{date} · Status {old} → {new}, by you"
 * line appended to `## History` (R-HIST-1). The text comes back unchanged
 * when the status is unchanged, so nothing is written.
 */
export function changeStatusWithHistory(
  text: string,
  status: string,
  now: Date,
): string {
  const before = readStatus(text);
  if (before === status) return text;
  const shown = (value: string): string => (value === '' ? 'none' : value);
  const line = `${historyDate(now)} · Status ${shown(before)} → ${shown(status)}, by you`;
  return appendHistoryLine(setFrontmatterValue(text, 'status', status), line);
}
