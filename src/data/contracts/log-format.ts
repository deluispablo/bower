import { timelineDate } from './note-edit';
import { opKey } from './op-key';

export type LogEvent = { rootId: string; runId: string; operationId: string; requestedAt: number; action: string; note: string; detail: string };
export const isMonthlyLogPath = (path: string): boolean => /^\.bower\/log\/\d{4}-(0[1-9]|1[0-2])\.md$/.test(path);
const clean = (field: string): string => {
  let text = field.replace(/\r\n|[\r\n]/g, ' ');
  while (text.includes(' | ')) text = text.replaceAll(' | ', ' / ');
  return text;
};

export function formatLogEvent(event: LogEvent): { path: string; line: string } {
  const date = timelineDate(event.requestedAt);
  if (!date || !['create', 'update', 'fix', 'ingest', 'move', 'decision'].includes(event.action)) throw new Error('Invalid log event');
  const prefix = `${date} | ${event.action} | ${clean(event.note)} | `;
  const suffix = ` · op:${opKey(event.rootId, event.runId, event.operationId)}`;
  let detail = clean(event.detail);
  const bytes = (text: string): number => new TextEncoder().encode(text).length;
  if (bytes(prefix + detail + suffix + '\n') > 4096) {
    const budget = 4096 - bytes(prefix + '…' + suffix + '\n');
    let used = 0;
    let cut = '';
    for (const point of detail) {
      used += bytes(point);
      if (used > budget) break;
      cut += point;
    }
    // shortcut: an oversized date/action/note stays whole, revisit if normal paths exceed the line bound.
    detail = cut + '…';
  }
  return { path: `.bower/log/${date.slice(0, 7)}.md`, line: prefix + detail + suffix };
}

export function readLog(text: string): { text: string; keys: string[] } {
  return { text, keys: text.split(/\r?\n/).flatMap((line) => / · op:([a-f0-9]{12})$/.exec(line)?.[1] ?? []) };
}
