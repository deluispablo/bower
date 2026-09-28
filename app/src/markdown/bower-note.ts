/**
 * A note Bower wrote because it was asked (handover D.4, issue #351) opens
 * with two sections the reading view shows its own way:
 *
 * - `## Bower's note`: the conclusions box. Each bullet starts with ✅, ⚠️
 *   or ❌, shown as a coloured chip that always carries its word (Fine,
 *   Check, Problem), so colour is never the only signal.
 * - `## What Bower used`: the sources list, each item's trailing
 *   `(origin)` — "from the file", "looked up on the web" — set apart.
 *
 * `transformBowerSections` rewrites marked's token list (the
 * `processAllTokens` hook in `render.ts`); `bowerNoteExtensions` renders the
 * tokens it creates. Everything else in a note is left as it was.
 */

import type { Token, Tokens, TokenizerAndRendererExtension } from 'marked';

import { escapeHtml } from './html.js';

/** What a conclusion's leading marker means. */
export type ConclusionTone = 'fine' | 'check' | 'problem';

/** The word shown with each tone's colour. */
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

/** Heading text without emphasis markers, curly apostrophes made straight. */
function headingKey(text: string): string {
  return text
    .replace(/[*_`]+/g, '')
    .replace(/’/g, "'")
    .trim()
    .toLowerCase();
}

const NOTE_HEADING = "bower's note";
const SOURCES_HEADING = 'what bower used';

/** One row of the conclusions box. */
interface ConclusionRow {
  tone: ConclusionTone | undefined;
  tokens: Token[];
}

/** One item of the sources list. */
interface SourceItem {
  origin: string | undefined;
  tokens: Token[];
}

function isHeading(token: Token): token is Tokens.Heading {
  return token.type === 'heading';
}

function isList(token: Token): token is Tokens.List {
  return token.type === 'list';
}

/**
 * The item's first line of inline tokens (a tight item's `text` block or a
 * loose item's paragraph), where the marker and the origin live.
 */
function firstInlineTokens(item: Tokens.ListItem): Token[] | undefined {
  const first = item.tokens[0];
  if (first === undefined) return undefined;
  if (first.type !== 'text' && first.type !== 'paragraph') return undefined;
  const inline: unknown = first.tokens;
  return Array.isArray(inline) ? (inline as Token[]) : undefined;
}

/**
 * `item.tokens` with the first block's inline tokens replaced, copying only
 * what changes (the tokens came from this render's lexer, but the transform
 * stays pure for its tests).
 */
function withInline(item: Tokens.ListItem, inline: Token[]): Token[] {
  const [first, ...others] = item.tokens;
  if (first === undefined) return item.tokens;
  return [{ ...first, tokens: inline }, ...others];
}

/** A plain inline text token, whose `text` is a string. */
function textToken(token: Token | undefined): Tokens.Text | undefined {
  if (token?.type !== 'text') return undefined;
  const text: unknown = token.text;
  return typeof text === 'string' ? (token as Tokens.Text) : undefined;
}

function conclusionRow(item: Tokens.ListItem): ConclusionRow {
  const { tone } = conclusionTone(item.text);
  const inline = firstInlineTokens(item);
  const head = textToken(inline?.[0]);
  if (tone === undefined || inline === undefined || head === undefined) {
    return { tone, tokens: item.tokens };
  }
  const text = conclusionTone(head.text).rest;
  const raw = conclusionTone(head.raw).rest;
  const stripped: Token = { ...head, raw, text };
  return { tone, tokens: withInline(item, [stripped, ...inline.slice(1)]) };
}

function sourceItem(item: Tokens.ListItem): SourceItem {
  const inline = firstInlineTokens(item);
  const tail = textToken(inline?.[inline.length - 1]);
  if (inline === undefined || tail === undefined) {
    return { origin: undefined, tokens: item.tokens };
  }
  const { source, origin } = splitOrigin(tail.text);
  if (origin === undefined) return { origin, tokens: item.tokens };
  const rest: Token[] =
    source === ''
      ? []
      : [{ ...tail, raw: splitOrigin(tail.raw).source, text: source }];
  return {
    origin,
    tokens: withInline(item, [...inline.slice(0, -1), ...rest]),
  };
}

function rawOf(tokens: readonly Token[]): string {
  return tokens.map((token) => token.raw).join('');
}

/**
 * Rewrites the note's top-level tokens: `## Bower's note` and everything up
 * to the next heading becomes one `bowerNote` token (its lists become
 * `bowerConclusions`); the first list right after `## What Bower used`
 * becomes `bowerSources`, the heading itself staying a heading. Any other
 * token is returned as it was.
 */
export function transformBowerSections(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    i += 1;
    if (token === undefined) continue;
    if (!isHeading(token)) {
      out.push(token);
      continue;
    }
    const key = headingKey(token.text);
    if (key === NOTE_HEADING) {
      const children: Token[] = [];
      while (i < tokens.length) {
        const next = tokens[i];
        if (next === undefined || isHeading(next)) break;
        children.push(
          isList(next)
            ? {
                type: 'bowerConclusions',
                raw: next.raw,
                rows: next.items.map(conclusionRow),
              }
            : next,
        );
        i += 1;
      }
      out.push({
        type: 'bowerNote',
        raw: token.raw + rawOf(children),
        tokens: children,
      });
      continue;
    }
    out.push(token);
    if (key !== SOURCES_HEADING) continue;
    while (tokens[i]?.type === 'space') {
      const space = tokens[i];
      if (space !== undefined) out.push(space);
      i += 1;
    }
    const list = tokens[i];
    if (list !== undefined && isList(list)) {
      out.push({
        type: 'bowerSources',
        raw: list.raw,
        ordered: list.ordered,
        items: list.items.map(sourceItem),
      });
      i += 1;
    }
  }
  return out;
}

function rowsOf(token: Tokens.Generic): ConclusionRow[] {
  const rows: unknown = token.rows;
  return Array.isArray(rows) ? (rows as ConclusionRow[]) : [];
}

function itemsOf(token: Tokens.Generic): SourceItem[] {
  const items: unknown = token.items;
  return Array.isArray(items) ? (items as SourceItem[]) : [];
}

function childrenOf(token: Tokens.Generic): Token[] {
  const children: unknown = token.tokens;
  return Array.isArray(children) ? (children as Token[]) : [];
}

/**
 * Renderers for the tokens `transformBowerSections` creates. The class
 * names are styled in `styles/markdown.css`; the sanitizer keeps `class`.
 */
export const bowerNoteExtensions: TokenizerAndRendererExtension[] = [
  {
    name: 'bowerNote',
    renderer(token) {
      const body = this.parser.parse(childrenOf(token));
      return (
        '<div class="bower-note">' +
        `<div class="bower-note-title">Bower's note</div>` +
        `${body}</div>\n`
      );
    },
  },
  {
    name: 'bowerConclusions',
    renderer(token) {
      const rows = rowsOf(token)
        .map(({ tone, tokens }) => {
          const text = this.parser.parse(tokens);
          if (tone === undefined) {
            return `<li class="bower-note-row"><div class="bower-note-text">${text}</div></li>\n`;
          }
          return (
            `<li class="bower-note-row bower-note-${tone}">` +
            `<span class="bower-note-word">${TONE_WORDS[tone]}</span>` +
            `<div class="bower-note-text">${text}</div></li>\n`
          );
        })
        .join('');
      return `<ul class="bower-note-rows">\n${rows}</ul>\n`;
    },
  },
  {
    name: 'bowerSources',
    renderer(token) {
      const tag = token.ordered === true ? 'ol' : 'ul';
      const items = itemsOf(token)
        .map(({ origin, tokens }) => {
          const text = this.parser.parse(tokens);
          const tail =
            origin === undefined
              ? ''
              : ` <span class="bower-source-origin">(${escapeHtml(origin)})</span>`;
          return `<li>${text}${tail}</li>\n`;
        })
        .join('');
      return `<${tag} class="bower-sources">\n${items}</${tag}>\n`;
    },
  },
];
