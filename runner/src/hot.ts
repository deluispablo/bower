import { BowerError } from '../../src/data/types';
import { timelineDate } from '../../src/data/contracts/note-edit';
import { opKey } from '../../src/data/contracts/op-key';

export interface HotInputs {
  today: string;
  previousHot?: string;
  rootId?: string;
  runId?: string;
  removedKeys?: readonly string[];
  openQuestions: readonly { id: string; text: string }[];
  hubs: readonly { path: string; lastSettledChange: string | null }[];
  changes: readonly { id: string; at: string; text: string }[];
}

export interface HotResult {
  text: string;
  provenance: { questionIds: string[]; hubPaths: string[]; changeIds: string[] };
}

interface Row {
  identity: string;
  text: string;
}

interface Section {
  heading: string;
  rows: Row[];
  total: number;
  thread: boolean;
}

// CommonMark §2.4: escape block markers only after whitespace has collapsed.
const oneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim()
  .replace(/^([<#>*+`~_-])/u, '\\$1')
  .replace(/^(\d{1,9})([.)])(?= |$)/u, '$1\\$2');
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

// First occurrence wins; question order is the caller's authoritative order.
function unique<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function section(heading: string, rows: Row[], cap: number, thread = false): Section {
  const capped = rows.slice(0, cap);
  return { heading, rows: capped, total: thread ? rows.length : capped.length, thread };
}

function renderSection(value: Section): string[] {
  const omitted = value.total - value.rows.length;
  return [
    `## ${value.heading}`,
    ...value.rows.map((row) => row.text),
    ...(omitted === 0 ? [] : [value.thread
      ? `- and ${omitted} more waiting on Home`
      : `- (${omitted} more)`]),
  ];
}

/** Reject normalized impossible days as well as malformed date/time spellings. */
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const day = value.slice(0, 10);
  return timelineDate(Date.parse(day)) === day && timelineDate(Date.parse(value)) !== null;
}

/** Project already-read primary evidence without I/O or a model. */
export function renderHot(inputs: HotInputs): HotResult {
  if (!validDate(inputs.today) || inputs.today.length !== 10) throw new BowerError('unknown', 'Bower could not date its notes.');
  const today = Date.parse(inputs.today);
  const questions = unique(inputs.openQuestions, (question) => question.id);
  const hubs = unique(inputs.hubs, (hub) => hub.path)
    .filter((hub) => {
      if (hub.lastSettledChange === null || !validDate(hub.lastSettledChange)) return false;
      const day = Date.parse(hub.lastSettledChange.slice(0, 10));
      return day <= today && day >= today - 30 * 86_400_000;
    })
    .sort((a, b) => Date.parse(b.lastSettledChange?.slice(0, 10) ?? '') - Date.parse(a.lastSettledChange?.slice(0, 10) ?? '')
      || compareText(a.path, b.path));
  const removed = new Set(inputs.removedKeys);
  const changes = unique(inputs.changes.filter((change) => validDate(change.at)).map((change) => ({
    ...change, key: opKey(inputs.rootId ?? '', inputs.runId ?? '', change.id),
  })).filter((change) => !removed.has(change.key)), (change) => change.key)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || compareText(a.id, b.id));

  const threads = section('Open threads', questions.map((question) => ({
    identity: question.id, text: `- ${oneLine(question.text)}`,
  })), 10, true);
  const focus = section('Current focus', hubs.map((hub) => ({
    identity: hub.path,
    text: `- ${oneLine(hub.path)} (${hub.lastSettledChange?.slice(0, 10)})`,
  })), 5);
  // Only dated rows from the generated section survive; other prior prose is never evidence.
  const previous = inputs.previousHot?.split(/^## Recent changes\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const priorRows = previous.split('\n').flatMap((text) => {
    const day = /^- (\d{4}-\d{2}-\d{2}) .+$/u.exec(text)?.[1];
    if (!day || !validDate(day) || Date.parse(day) > today) return [];
    const key = / · op:([a-f0-9]{12})$/u.exec(text)?.[1];
    // Historical dated rows remain readable; their exact bytes supply a stable migration identity.
    const identity = key ?? opKey(inputs.rootId ?? '', '', text);
    return removed.has(identity) ? [] : [{ identity, text: key ? text : `${text} · op:${identity}` }];
  });
  const recent = section('Recent changes', unique([...changes.map((change) => ({
    identity: change.key, text: `- ${change.at.slice(0, 10)} ${oneLine(change.text)} · op:${change.key}`,
  })), ...priorRows], (row) => row.identity), 10);
  const render = (): string => [
    '# Hot', `_Updated: ${inputs.today}_`,
    ...renderSection(threads), ...renderSection(focus), ...renderSection(recent),
  ].join('\n');

  let text = render();
  // Count thread cap marks and word-cut marks within the budget.
  for (const value of [recent, focus, threads]) {
    while (text.split(/\s+/u).length > 300 && value.rows.length > 0) {
      value.rows.pop();
      text = render();
    }
  }
  return {
    text,
    provenance: {
      questionIds: threads.rows.map((row) => row.identity),
      hubPaths: focus.rows.map((row) => row.identity),
      changeIds: changes.filter((change) => recent.rows.some((row) => row.identity === change.key)).map((change) => change.id),
    },
  };
}

/** Ignore only the generated date stamp, leaving list content intact. */
export function sameExceptDate(a: string, b: string): boolean {
  const stamp = /^_Updated: \d{4}-\d{2}-\d{2}_$/m;
  if (!stamp.test(a) || !stamp.test(b)) return a === b;
  return a.replace(stamp, '_Updated:_') === b.replace(stamp, '_Updated:_');
}

/** Reserve space for the explicit cut mark within the prompt's character cap. */
export function boundHot(text?: string | null): string {
  if (!text) return '';
  if (text.length <= 4_000) return text;
  const mark = '\n(hot cut at 4,000 characters)';
  let end = 4_000 - mark.length;
  const before = text.charCodeAt(end - 1);
  const after = text.charCodeAt(end);
  if (before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF) end -= 1;
  return text.slice(0, end) + mark;
}
