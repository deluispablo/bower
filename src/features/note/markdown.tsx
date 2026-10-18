import type { Note } from '@/data/types';
import { LIST_MARK, TASK_BOX } from '@/data/tasks';
import { tableCells } from '@/data/search-text';
import { scanLinks } from '@/data/contracts/links';
import type { ReactNode } from 'react';
import { Checkbox } from '@/ui/Field';

/**
 * A small Markdown reader for Bower's notes: headings, paragraphs, lists,
 * tables, bold, italics, code and [[wikilinks]]. It builds React elements, so
 * nothing in a note can run as HTML. Phase 2 may swap it for a full parser.
 */
export type LinkFn = (target: string, label: string, key: string) => ReactNode;

interface Token {
  kind: 'text' | 'link' | 'strong' | 'em' | 'code';
  text: string;
  target?: string;
}

/** The one matcher, in a single pass: what `inline` renders and `shown` reads cannot differ. */
function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  const links = scanLinks(text);
  let link = links.next().value;
  let format = re.exec(text);
  let last = 0;
  while (link || format) {
    if (link && (!format || link.index <= format.index)) {
      if (link.index > last) out.push({ kind: 'text', text: text.slice(last, link.index) });
      const [all, name, alias] = link;
      out.push(name ? { kind: 'link', text: alias?.trim() ? alias : name, target: name } : { kind: 'text', text: all });
      last = link.index + all.length;
      link = links.next().value;
    } else if (format) {
      if (format.index > last) out.push({ kind: 'text', text: text.slice(last, format.index) });
      if (format[1]) out.push({ kind: 'strong', text: format[1] });
      else if (format[2]) out.push({ kind: 'em', text: format[2] });
      else if (format[3]) out.push({ kind: 'code', text: format[3] });
      last = format.index + format[0].length;
    }
    if (link && link.index < last) link = links.next(last).value;
    if (format && format.index < last) {
      re.lastIndex = last;
      format = re.exec(text);
    }
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function inline(text: string, link: LinkFn, keyBase: string): ReactNode[] {
  return tokens(text).map((t, k) => {
    const key = `${keyBase}-${k}`;
    const text = t.text.replace(/\n/g, ' ');
    if (t.kind === 'link') return link(t.target ?? text, text, key);
    if (t.kind === 'strong') return <strong key={key}>{text}</strong>;
    if (t.kind === 'em') return <em key={key}>{text}</em>;
    if (t.kind === 'code') return <code key={key}>{text}</code>;
    return text;
  });
}

/** What a cell shows: wikilinks as their labels, bold, italics and code without their marks. */
const shown = (c: string): string => tokens(c).map((t) => t.text).join('');
/** A number, optionally signed, with a currency sign, separators, a percent sign or a short unit ("24 min"). */
const NUMBER = /^[-+]?[£$€]?\d[\d,.]*\s?(%|[A-Za-z]{1,4})?$/;

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
  /** The level (1-6) the note's shallowest heading takes, for a note shown under a heading of its own. */
  headingLevel?: number;
}

export function Markdown({ text, link, taskRegions, onToggle, headingLevel }: MarkdownProps) {
  // CommonMark leaves HTML comments out of a reader that renders no HTML. shortcut: single-line comments only (the
  // data layer counts task lines one by one), a comment over several lines stays as text.
  const lines = text.split('\n').map((l) => l.replace(/<!--.*?-->/g, ''));
  const top = Math.min(4, ...lines.map((l) => /^(#{1,4})\s/.exec(l)?.[1]?.length ?? 4));
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
      const depth = h[1]?.length ?? 2;
      const content = inline(h[2] ?? '', link, key);
      const id = headingId(h[2] ?? '');
      // With headingLevel the shallowest heading takes that level and the rest keep their gap, down to h6.
      const Tag = headingLevel ? (`h${Math.min(6, headingLevel + depth - top)}` as 'h4') : depth <= 2 ? 'h2' : 'h3';
      blocks.push(<Tag key={key} id={id}>{content}</Tag>);
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
        const cells = tableCells(lines[i] ?? '');
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="md-table" role="region" tabIndex={0} aria-label={`Table: ${(head ?? []).map(shown).join(', ')}`}>
          <table>
            {head && (
              <thead>
                <tr>{head.map((c, j) => <th key={j}>{inline(c, link, `${key}-h${j}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j} className={NUMBER.test(shown(c)) ? 'md-num' : undefined}>{inline(c, link, `${key}-${ri}-${j}`)}</td>)}</tr>
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
    blocks.push(<p key={key}>{inline(para.join('\n'), link, key)}</p>);
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
