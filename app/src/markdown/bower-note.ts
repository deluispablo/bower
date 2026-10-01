/**
 * Bower's note in the reading view (spec §6.7 R-NOTE-1/2/3/6, §7 R-AG-3;
 * boards `Phone-Note-Bower`, `Phone-Note-Long`, `Flow-06-Dots`,
 * `Flow-07-Answer`).
 *
 * The agent writes its note as Obsidian callouts (D10):
 *
 * - `> [!bower] Bower's note`: the box at the top. One line per finding,
 *   each ending with its origin in brackets — `(from the file)`,
 *   `(from your notes: [[A]], [[B]])`, `(looked up)`,
 *   `(from what you told me)` — and, when the person must look, `— Check`.
 *   Each row gets its origin square (colour and icon), the box a legend
 *   naming the origins present, so colour is never the only signal.
 * - `> [!bower]- Bower on this section`: a smaller box at the start of a
 *   section, collapsible; `-` means folded by default, as in Obsidian.
 *
 * Notes written before v4 use `## Bower's note` with ✅ ⚠️ ❌ bullets; they
 * render in the same box (✅ no word, ⚠️ "Check", ❌ "Problem").
 * `## What Bower used` becomes one compact "Used:" line.
 *
 * The block extensions in `bowerNoteExtensions` turn both forms into
 * `bowerBox` tokens; `transformBowerSections` (the `processAllTokens` hook in
 * `render.ts`) names each section box after its heading, adds the contents
 * strip and the "Used:" line. Every piece of note text is either escaped
 * here or lexed as Markdown, and all of it goes through the sanitizer in
 * `render.ts`; wikilinks resolve through `wikilinks.ts`.
 */

import type { Token, Tokens, TokenizerAndRendererExtension } from 'marked';

import type { OriginKind } from '../components/folder-mark.js';
import { escapeHtml, headingAnchor } from './html.js';

/** What a conclusion's leading marker (v3) or `— Check` (v4) means. */
export type ConclusionTone = 'fine' | 'check' | 'problem';

/** The word shown with a tone; "Fine" is never shown (R-NOTE-2). */
export const TONE_WORDS: Readonly<Record<ConclusionTone, string>> = {
  fine: 'Fine',
  check: 'Check',
  problem: 'Problem',
};

/** ✅, ⚠️ (with or without the emoji variation selector) or ❌. */
const MARKER_PATTERN = /^\s*(✅|⚠|❌)️?[ \t]*/u;

const MARKER_TONES: Readonly<Record<string, ConclusionTone>> = {
  '✅': 'fine',
  '⚠': 'check',
  '❌': 'problem',
};

/**
 * The tone of a conclusion from its leading marker, and the text after it.
 * No marker (or any other emoji): no tone, the text unchanged.
 */
export function conclusionTone(text: string): {
  tone: ConclusionTone | undefined;
  rest: string;
} {
  const match = MARKER_PATTERN.exec(text);
  const marker = match?.[1];
  if (match === null || marker === undefined) {
    return { tone: undefined, rest: text };
  }
  return { tone: MARKER_TONES[marker], rest: text.slice(match[0].length) };
}

/** A trailing `(origin)` with no brackets inside it. */
const ORIGIN_PATTERN = /[ \t]*\(([^()\n]+)\)[ \t]*$/;

/**
 * Splits `Camden Town average rent (looked up on the web)` into the source
 * and its origin. No trailing brackets: no origin, the text unchanged.
 */
export function splitOrigin(text: string): {
  source: string;
  origin: string | undefined;
} {
  const match = ORIGIN_PATTERN.exec(text);
  const origin = match?.[1]?.trim();
  if (match === null || origin === undefined || origin === '') {
    return { source: text, origin: undefined };
  }
  return { source: text.slice(0, match.index), origin };
}

/**
 * Which of the four origins a bracket names: "from the file", "from your
 * notes: …", "looked up (on the web)", "from what you told me". Anything
 * else is not an origin.
 */
export function originKind(origin: string): OriginKind | undefined {
  const text = origin.toLowerCase();
  if (/\byour notes?\b/.test(text)) return 'notes';
  if (/\bfile\b/.test(text)) return 'file';
  if (/\blooked up\b|\bweb\b/.test(text)) return 'web';
  if (/\btold me\b|^you$/.test(text)) return 'you';
  return undefined;
}

/** The legend's words for each origin, in the legend's order. */
export const ORIGIN_WORDS: Readonly<Record<OriginKind, string>> = {
  file: 'the file',
  notes: 'your notes',
  web: 'looked up',
  you: 'you',
};

const ORIGIN_ORDER: readonly OriginKind[] = ['file', 'notes', 'web', 'you'];

/** A trailing `— Check` (em or en dash, or a spaced hyphen). */
const CHECK_PATTERN = /(?:[ \t]*[—–]|[ \t]+-{1,2})[ \t]*Check[ \t]*$/;

/** A list bullet at the start of a line. */
const BULLET_PATTERN = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/;

/** One line of Bower's note, taken apart. */
export interface BowerLine {
  tone: ConclusionTone | undefined;
  /** The line's text without marker, origin bracket or `— Check`. */
  text: string;
  origin: OriginKind | undefined;
  /** `[[…]]` links named in a "your notes" bracket, as written. */
  joined: string[];
}

function stripCheck(text: string): { text: string; check: boolean } {
  const match = CHECK_PATTERN.exec(text);
  if (match === null) return { text, check: false };
  return { text: text.slice(0, match.index), check: true };
}

/**
 * Takes one line of the note apart: `- ⚠️ text`, `text (from the file)`,
 * `text (from your notes: [[A]]) — Check`. A bracket that names no origin
 * stays part of the text.
 */
export function parseBowerLine(line: string): BowerLine {
  const { tone: marker, rest } = conclusionTone(
    line.replace(BULLET_PATTERN, ''),
  );
  let { text, check } = stripCheck(rest.trim());
  const { source, origin } = splitOrigin(text);
  const kind = origin === undefined ? undefined : originKind(origin);
  if (origin !== undefined && kind !== undefined) {
    const after = stripCheck(source.trim());
    text = after.text;
    check = check || after.check;
  }
  const joined =
    kind === 'notes' && origin !== undefined
      ? [...new Set(origin.match(/\[\[[^[\]\n]+?\]\]/g) ?? [])]
      : [];
  const tone = marker ?? (check ? 'check' : undefined);
  return { tone, text: text.trim(), origin: kind, joined };
}

/** Heading text without emphasis markers, curly apostrophes made straight. */
function headingKey(text: string): string {
  return text
    .replace(/[*_`]+/g, '')
    .replace(/’/g, "'")
    .trim()
    .toLowerCase();
}

/** Heading text as shown in a label: no emphasis, wikilinks by their text. */
function plainHeading(text: string): string {
  return text
    .replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/[*_`]+/g, '')
    .trim();
}

const NOTE_HEADING = "bower's note";
const SECTION_TITLE = 'Bower on this section';
const SOURCES_HEADING = 'what bower used';

/** One row of a box, its text lexed as inline Markdown. */
interface BoxRow {
  tone: ConclusionTone | undefined;
  origin: OriginKind | undefined;
  tokens: Token[];
}

type BoxVariant = 'top' | 'section';

interface LexerLike {
  inline(src: string, tokens?: Token[]): Token[];
}

/** A `bowerBox` token from the note's lines. */
function boxToken(
  lexer: LexerLike,
  raw: string,
  variant: BoxVariant,
  title: string,
  open: boolean,
  lines: readonly string[],
): Tokens.Generic {
  const parsed = lines.map(parseBowerLine).filter((line) => line.text !== '');
  const joined = [...new Set(parsed.flatMap((line) => line.joined))];
  return {
    type: 'bowerBox',
    raw,
    variant,
    title,
    open,
    rows: parsed.map((line): BoxRow => ({
      tone: line.tone,
      origin: line.origin,
      tokens: lexer.inline(line.text),
    })),
    joined: joined.map((link) => lexer.inline(link)),
  };
}

const BOWER_CALLOUT =
  /^ {0,3}>[ \t]?\[!bower\]([+-]?)[ \t]*([^\n]*)(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/i;

const V3_HEADING = /^ {0,3}#{1,6}[ \t]+([^\n]*?)[ \t]*#*[ \t]*(?:\n|$)/;

const NEXT_HEADING = /^ {0,3}#{1,6}[ \t]/m;

/** The body of a v3 `## Bower's note`: bullets, continuations joined. */
function v3Lines(body: string): string[] {
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    if (line.trim() === '') continue;
    const last = lines.length - 1;
    if (/^[ \t]+\S/.test(line) && !BULLET_PATTERN.test(line) && last >= 0) {
      lines[last] = `${lines[last] ?? ''} ${line.trim()}`;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** One "Used:" item: its inline tokens, the trailing origin dropped. */
function usedItem(item: Tokens.ListItem): Token[] {
  const first = item.tokens[0];
  const inline: unknown =
    first !== undefined && (first.type === 'text' || first.type === 'paragraph')
      ? first.tokens
      : undefined;
  if (!Array.isArray(inline)) return [];
  const tokens = inline as Token[];
  const tail = tokens[tokens.length - 1];
  if (tail?.type !== 'text' || typeof tail.text !== 'string') return tokens;
  const { source, origin } = splitOrigin(tail.text);
  if (origin === undefined) return tokens;
  const rest: Token[] =
    source.trim() === ''
      ? []
      : [{ ...tail, raw: source.trimEnd(), text: source.trimEnd() }];
  return [...tokens.slice(0, -1), ...rest];
}

function isHeading(token: Token): token is Tokens.Heading {
  return token.type === 'heading';
}

function isList(token: Token): token is Tokens.List {
  return token.type === 'list';
}

function isBox(token: Token, variant: BoxVariant): boolean {
  return token.type === 'bowerBox' && token.variant === variant;
}

/** One entry of the contents strip. */
interface ContentsEntry {
  text: string;
  anchor: string;
  noted: boolean;
}

/**
 * Rewrites the note's top-level tokens: each section box learns its
 * section's heading, `## What Bower used` and its list become one
 * `bowerUsed` line, and when the note has a top box and at least one
 * section box, a `bowerContents` strip follows the top box. Any other token
 * is returned as it was.
 */
export function transformBowerSections(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  const entries: ContentsEntry[] = [];
  let section: ContentsEntry | undefined;
  let heading: string | undefined;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    i += 1;
    if (token === undefined) continue;
    if (isBox(token, 'section')) {
      if (section !== undefined) section.noted = true;
      out.push({ ...token, section: heading });
      continue;
    }
    if (!isHeading(token)) {
      out.push(token);
      continue;
    }
    if (headingKey(token.text) === SOURCES_HEADING) {
      let j = i;
      while (tokens[j]?.type === 'space') j += 1;
      const list = tokens[j];
      if (list !== undefined && isList(list)) {
        out.push({
          type: 'bowerUsed',
          raw: token.raw + list.raw,
          items: list.items.map(usedItem).filter((item) => item.length > 0),
        });
        i = j + 1;
        continue;
      }
    }
    out.push(token);
    heading = plainHeading(token.text);
    section = undefined;
    if (token.depth === 2) {
      section = {
        text: heading,
        anchor: headingAnchor(token.text),
        noted: false,
      };
      entries.push(section);
    }
  }
  const top = out.findIndex((token) => isBox(token, 'top'));
  if (top >= 0 && entries.some((entry) => entry.noted)) {
    out.splice(top + 1, 0, {
      type: 'bowerContents',
      raw: '',
      entries,
    });
  }
  return out;
}

function arrayField<T>(token: Tokens.Generic, name: string): T[] {
  const value: unknown = token[name];
  return Array.isArray(value) ? (value as T[]) : [];
}

function stringField(token: Tokens.Generic, name: string): string {
  const value: unknown = token[name];
  return typeof value === 'string' ? value : '';
}

interface InlineParser {
  parseInline(tokens: Token[]): string;
}

function rowHtml(parser: InlineParser, row: BoxRow): string {
  const tone = row.tone === undefined ? '' : ` bower-note-${row.tone}`;
  const square =
    row.origin === undefined
      ? ''
      : `<span class="bower-origin bower-origin-${row.origin}" title="${escapeHtml(capitalized(ORIGIN_WORDS[row.origin]))}"></span>`;
  const word =
    row.tone === 'check' || row.tone === 'problem'
      ? `<span class="bower-note-word">${TONE_WORDS[row.tone]}</span>`
      : '';
  return (
    `<li class="bower-note-row${tone}">${square}` +
    `<div class="bower-note-text">${parser.parseInline(row.tokens)}</div>` +
    `${word}</li>\n`
  );
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "· from the file, your notes": only the origins present, in order. */
function legendHtml(rows: readonly BoxRow[]): string {
  const present = ORIGIN_ORDER.filter((kind) =>
    rows.some((row) => row.origin === kind),
  );
  if (present.length === 0) return '';
  const words = present
    .map(
      (kind) => `<b class="bower-legend-${kind}">${ORIGIN_WORDS[kind]}</b>`,
    )
    .join(', ');
  return `<div class="bower-note-legend">· from ${words}</div>`;
}

function joinedHtml(parser: InlineParser, links: Token[][]): string {
  if (links.length === 0) return '';
  const chips = links
    .map(
      (link) =>
        `<span class="bower-joined-chip">${parser.parseInline(link)}</span>`,
    )
    .join('');
  return (
    '<div class="bower-joined">' +
    `<span class="bower-joined-label">Joined from:</span> ${chips}</div>\n`
  );
}

/**
 * The block tokenizers for both forms of the note and the renderers for
 * the tokens they and `transformBowerSections` create. The class names are
 * styled in `styles/markdown.css`; the sanitizer keeps `class`.
 */
export const bowerNoteExtensions: TokenizerAndRendererExtension[] = [
  {
    // v3: `## Bower's note` and everything up to the next heading.
    name: 'bowerV3Note',
    level: 'block',
    start: (src) =>
      src.match(/^ {0,3}#{1,6}[ \t]+[*_]*Bower['’]s note/im)?.index,
    tokenizer(src) {
      const match = V3_HEADING.exec(src);
      if (match === null || headingKey(match[1] ?? '') !== NOTE_HEADING) {
        return undefined;
      }
      const rest = src.slice(match[0].length);
      const next = NEXT_HEADING.exec(rest);
      const body = next === null ? rest : rest.slice(0, next.index);
      return boxToken(
        this.lexer,
        match[0] + body,
        'top',
        "Bower's note",
        true,
        v3Lines(body),
      );
    },
  },
  {
    // v4: `> [!bower] Bower's note` and `> [!bower]- Bower on this section`.
    name: 'bowerCallout',
    level: 'block',
    start: (src) => src.match(/^ {0,3}>[ \t]?\[!bower\]/im)?.index,
    tokenizer(src) {
      const match = BOWER_CALLOUT.exec(src);
      if (match === null) return undefined;
      const fold = match[1] ?? '';
      const title = (match[2] ?? '').trim();
      const section =
        fold !== '' || headingKey(title) === SECTION_TITLE.toLowerCase();
      const lines = (match[3] ?? '')
        .split('\n')
        .map((line) => line.replace(/^ {0,3}>[ \t]?/, ''))
        .filter((line) => line.trim() !== '');
      return boxToken(
        this.lexer,
        match[0],
        section ? 'section' : 'top',
        title !== '' ? title : section ? SECTION_TITLE : "Bower's note",
        fold !== '-',
        lines,
      );
    },
  },
  {
    name: 'bowerBox',
    renderer(token) {
      const rows = arrayField<BoxRow>(token, 'rows');
      const list =
        rows.length === 0
          ? ''
          : `<ul class="bower-note-rows">\n${rows
              .map((row) => rowHtml(this.parser, row))
              .join('')}</ul>\n`;
      const joined = joinedHtml(this.parser, arrayField(token, 'joined'));
      const title = escapeHtml(stringField(token, 'title'));
      if (token.variant !== 'section') {
        return (
          '<div class="bower-note"><div class="bower-note-head">' +
          `<div class="bower-note-title">${title}</div>` +
          `${legendHtml(rows)}</div>${list}</div>\n${joined}`
        );
      }
      const name = stringField(token, 'section');
      const count = `${rows.length} ${rows.length === 1 ? 'line' : 'lines'}`;
      const folded =
        name === ''
          ? `${SECTION_TITLE}: ${count}`
          : `Bower on “${name}”: ${count}`;
      const open = token.open === true ? ' open=""' : '';
      return (
        `<details class="bower-section"${open}>` +
        '<summary class="bower-section-head">' +
        `<span class="bower-section-title">${title}</span>` +
        `<span class="bower-section-folded">${escapeHtml(folded)}</span>` +
        `</summary>${list}</details>\n${joined}`
      );
    },
  },
  {
    name: 'bowerContents',
    renderer(token) {
      const links = arrayField<ContentsEntry>(token, 'entries')
        .map(
          ({ text, anchor, noted }) =>
            `<a class="bower-contents-link${noted ? ' bower-contents-noted' : ''}"` +
            ` href="#${escapeHtml(anchor)}">` +
            (noted
              ? '<span class="bower-contents-mark" title="Bower on this section"></span>'
              : '<span class="bower-contents-mark"></span>') +
            `${escapeHtml(text)}</a>`,
        )
        .join('');
      return `<div class="bower-contents">${links}</div>\n`;
    },
  },
  {
    name: 'bowerUsed',
    renderer(token) {
      const items = arrayField<Token[]>(token, 'items');
      const last = items[items.length - 1];
      const lastRaw = last?.map((part) => part.raw).join('') ?? '';
      const stop = /[.!?]\s*$/.test(lastRaw) ? '' : '.';
      const list = items
        .map((item) => this.parser.parseInline(item))
        .join(', ');
      return `<p class="bower-used">Used: ${list}${stop}</p>\n`;
    },
  },
];
