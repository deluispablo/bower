/**
 * Renders a note like Obsidian's reading view: GitHub-flavoured Markdown
 * (tables, read-only task lists, code, blockquotes), wikilinks resolved
 * against the vault index, `==highlight==`, callouts and heading anchors.
 * The output is sanitized with DOMPurify: nothing in a note can run script.
 */

import DOMPurify from 'dompurify';
import type { Config, DOMPurify as Purifier } from 'dompurify';
import { Marked } from 'marked';
import type { Tokens, TokenizerAndRendererExtension } from 'marked';

import type { VaultIndex } from '../vault-index.js';
import { parseFrontmatter } from './frontmatter.js';
import { escapeHtml, slugify } from './html.js';
import { renderTextWithWikilinks, renderWikilink } from './wikilinks.js';

export interface RenderedNote {
  /** Sanitized HTML of the note body. */
  html: string;
  /** Parsed frontmatter; `tags`, when present, is a `string[]`. */
  frontmatter: Record<string, unknown>;
  /**
   * Sanitized, collapsible `<details class="frontmatter">` block with the
   * properties and the tags as chips; empty when the note has none.
   */
  frontmatterHtml: string;
  /** Tags from the frontmatter, without `#`. */
  tags: string[];
}

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'input', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span',
  'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
]; // prettier-ignore

const ALLOWED_ATTR = [
  'align', 'alt', 'checked', 'class', 'disabled', 'href', 'id', 'open', 'rel',
  'src', 'start', 'target', 'title', 'type',
]; // prettier-ignore

/** Links and images: web, mail, a note of this app, or a heading anchor. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|\/note\/|#)/i;

const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOWED_URI_REGEXP,
  // DOMPurify checks every other attribute value against the URI pattern.
  ADD_URI_SAFE_ATTR: ['align', 'start', 'type', 'rel', 'target'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'style'],
  FORBID_ATTR: ['style'],
  // Prefix ids with `user-content-` (see HEADING_ID_PREFIX).
  SANITIZE_NAMED_PROPS: true,
};

let purifier: Purifier | undefined;

function getPurifier(): Purifier {
  if (purifier !== undefined) return purifier;
  const instance = DOMPurify(window);
  instance.addHook('afterSanitizeAttributes', (node) => {
    const tag = node.tagName.toLowerCase();
    if (tag === 'input') {
      // Only read-only checkboxes survive, whatever the note asked for.
      node.setAttribute('type', 'checkbox');
      node.setAttribute('disabled', '');
    } else if (tag === 'a') {
      const href = node.getAttribute('href') ?? '';
      if (/^https?:/i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener');
      } else {
        node.removeAttribute('target');
        node.removeAttribute('rel');
      }
    }
  });
  purifier = instance;
  return instance;
}

/** Sanitizes HTML with the note allowlist. Needs a DOM (`window`). */
export function sanitizeHtml(html: string): string {
  return getPurifier().sanitize(html, PURIFY_CONFIG);
}

const CALLOUT_PATTERN =
  /^ {0,3}>[ \t]?\[!([\w-]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function createMarked(index: VaultIndex): Marked {
  const slugCounts = new Map<string, number>();

  const wikilink: TokenizerAndRendererExtension = {
    name: 'wikilink',
    level: 'inline',
    start: (src) => src.match(/!?\[\[/)?.index,
    tokenizer(src) {
      const match = /^(!?)\[\[([^[\]\n]+?)\]\]/.exec(src);
      if (match === null) return undefined;
      return { type: 'wikilink', raw: match[0], embed: match[1] === '!' };
    },
    renderer(token) {
      return renderWikilink(token.raw, index, token.embed === true);
    },
  };

  const highlight: TokenizerAndRendererExtension = {
    name: 'highlight',
    level: 'inline',
    start: (src) => src.match(/==/)?.index,
    tokenizer(src) {
      const match = /^==(?=[^\s=])([^\n]*?[^\s=])==/.exec(src);
      if (match === null) return undefined;
      return {
        type: 'highlight',
        raw: match[0],
        tokens: this.lexer.inlineTokens(match[1] ?? ''),
      };
    },
    renderer(token) {
      return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
    },
  };

  const callout: TokenizerAndRendererExtension = {
    name: 'callout',
    level: 'block',
    start: (src) => src.match(/^ {0,3}>[ \t]?\[!/m)?.index,
    tokenizer(src) {
      const match = CALLOUT_PATTERN.exec(src);
      if (match === null) return undefined;
      const kind = (match[1] ?? 'note').toLowerCase();
      const title = (match[2] ?? '').trim();
      const body = (match[3] ?? '')
        .split('\n')
        .map((line) => line.replace(/^ {0,3}>[ \t]?/, ''))
        .join('\n');
      return {
        type: 'callout',
        raw: match[0],
        kind,
        titleTokens: this.lexer.inline(title === '' ? capitalize(kind) : title),
        tokens: this.lexer.blockTokens(body, []),
      };
    },
    childTokens: ['titleTokens', 'tokens'],
    renderer(token) {
      const kind = typeof token.kind === 'string' ? token.kind : 'note';
      const titleTokens = Array.isArray(token.titleTokens)
        ? (token.titleTokens as Tokens.Generic[])
        : [];
      const title = this.parser.parseInline(titleTokens);
      const content = this.parser.parse(token.tokens ?? []);
      return (
        `<div class="callout callout-${escapeHtml(kind)}">` +
        `<div class="callout-title">${title}</div>` +
        `<div class="callout-content">${content}</div></div>\n`
      );
    },
  };

  const marked = new Marked({ gfm: true, breaks: true });
  marked.use({
    extensions: [wikilink, highlight, callout],
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading): string {
        const base = slugify(text) || 'section';
        const seen = slugCounts.get(base) ?? 0;
        slugCounts.set(base, seen + 1);
        const id = seen === 0 ? base : `${base}-${seen}`;
        const inner = this.parser.parseInline(tokens);
        return `<h${depth} id="${escapeHtml(id)}">${inner}</h${depth}>\n`;
      },
    },
  });
  return marked;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${formatValue(item)}`)
      .join('; ');
  }
  return '';
}

function renderFrontmatter(
  data: Record<string, unknown>,
  tags: string[],
  index: VaultIndex,
): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return '';
  const rows = keys.map((key) => {
    const value =
      key === 'tags'
        ? `<ul class="tags">${tags
            .map((tag) => `<li class="tag">#${escapeHtml(tag)}</li>`)
            .join('')}</ul>`
        : renderTextWithWikilinks(formatValue(data[key]), index);
    return `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`;
  });
  return (
    '<details class="frontmatter"><summary>Properties</summary>' +
    `<dl>${rows.join('')}</dl></details>`
  );
}

/**
 * Renders a note to sanitized HTML. Needs a DOM (`window`) for the sanitizer.
 */
export function renderNote(text: string, index: VaultIndex): RenderedNote {
  const { data, body } = parseFrontmatter(text);
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const html = createMarked(index).parse(body, { async: false });
  return {
    html: sanitizeHtml(html),
    frontmatter: data,
    frontmatterHtml: sanitizeHtml(renderFrontmatter(data, tags, index)),
    tags,
  };
}
