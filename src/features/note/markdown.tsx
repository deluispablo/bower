import type { Note } from '@/data/types';
import { LIST_MARK, TASK_BOX } from '@/data/tasks';
import type { ReactNode } from 'react';
import { Checkbox } from '@/ui/Field';

/**
 * A small Markdown reader for Bower's notes: headings, paragraphs, lists,
 * tables, bold, italics, code and [[wikilinks]]. It builds React elements, so
 * nothing in a note can run as HTML. Phase 2 may swap it for a full parser.
 */
export type LinkFn = (target: string, label: string, key: string) => ReactNode;

function inline(text: string, link: LinkFn, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[1]) out.push(link(m[1], m[2] ?? m[1], key));
    else if (m[3]) out.push(<strong key={key}>{m[3]}</strong>);
    else if (m[4]) out.push(<em key={key}>{m[4]}</em>);
    else if (m[5]) out.push(<code key={key}>{m[5]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One line of text with wikilinks, bold and code (for Current state, Timeline, Bower's note). */
export function Inline({ text, link }: { text: string; link: LinkFn }) {
  return <>{inline(text, link, 'i')}</>;
}

interface MarkdownProps {
  text: string;
  link: LinkFn;
  taskRegions?: Note['taskRegions'];
  /** Makes task boxes tickable; gets the task's position among the note's tasks. */
  onToggle?: (index: number) => void;
}

export function Markdown({ text, link, taskRegions, onToggle }: MarkdownProps) {
  const lines = text.split('\n');
  let task = -1;
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const key = `b${b++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(4, (h[1]?.length ?? 2) + 0);
      const content = inline(h[2] ?? '', link, key);
      const id = headingId(h[2] ?? '');
      blocks.push(level <= 2 ? <h2 key={key} id={id}>{content}</h2> : <h3 key={key} id={id}>{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i] ?? '')) {
        const t = (lines[i] ?? '').replace(LIST_MARK, '');
        const box = TASK_BOX.exec(t);
        if (box) task++;
        const n = task;
        const personalTask = box && taskRegions?.[n] !== 'bower';
        items.push(
          <li key={`${key}-${items.length}`} className={personalTask ? 'md-task' : box?.[1] === 'x' ? 'md-done' : undefined}>
            {personalTask ? (
              <label className={box[1] === 'x' ? 'md-done' : undefined}>
                <Checkbox checked={box[1] === 'x'} readOnly={!onToggle} disabled={!onToggle} onChange={() => onToggle?.(n)} />
                <span>{inline(t.slice(box[0].length), link, `${key}-${items.length}`)}</span>
              </label>
            ) : box ? (
              <span>{inline(t.slice(box[0].length), link, `${key}-${items.length}`)}</span>
            ) : (
              inline(t, link, `${key}-${items.length}`)
            )}
          </li>,
        );
        i++;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        const cells = (lines[i] ?? '').trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="md-table">
          <table>
            {head && (
              <thead>
                <tr>{head.map((c, j) => <th key={j}>{inline(c, link, `${key}-h${j}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, link, `${key}-${ri}-${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) quote.push((lines[i++] ?? '').slice(2));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), link, key)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|\||> )/.test(lines[i] ?? '')) para.push(lines[i++] ?? '');
    blocks.push(<p key={key}>{inline(para.join(' '), link, key)}</p>);
  }
  return <>{blocks}</>;
}

/** A stable anchor for a heading, shared by the note and its outline. */
export function headingId(text: string): string {
  return `h-${text.replace(/\[\[|\]\]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/** The headings of a note, for the Outline panel. */
export function outlineOf(text: string): Array<{ level: number; text: string; id: string }> {
  return text
    .split('\n')
    .map((l) => /^(#{1,4})\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ level: m[1]?.length ?? 2, text: (m[2] ?? '').replace(/\[\[|\]\]/g, ''), id: headingId(m[2] ?? '') }));
}

/** The outline of a whole note page: Bower's sections where they sit, around the body's headings. */
export function noteOutline(n: Pick<Note, 'currentState' | 'body' | 'bowerNote' | 'timeline'>): Array<{ level: number; text: string; id: string }> {
  const out: Array<{ level: number; text: string; id: string }> = [];
  if (n.currentState.length) out.push({ level: 2, text: 'Current state', id: 'cs' });
  out.push(...outlineOf(n.body));
  if (n.bowerNote) out.push({ level: 2, text: "Bower's note", id: 'bn' });
  if (n.timeline.length) out.push({ level: 2, text: 'Timeline', id: 'tl' });
  return out;
}
