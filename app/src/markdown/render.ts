/**
 * Renders a note like Obsidian's reading view: GitHub-flavoured Markdown
 * (tables, read-only task lists, code, blockquotes), wikilinks resolved
 * against the vault index, `==highlight==`, callouts and heading anchors.
 * Bower's note (`> [!bower]` callouts, or the older `## Bower's note`) and
 * `## What Bower used` render their own way (`bower-note.ts`).
 * Attachments: links to files other than notes open in Drive; embedded
 * images and notes become placeholders (`embeds.ts`) that the note view
 * fills in after rendering, so this stays synchronous and needs no network.
 * The output is sanitized with DOMPurify: nothing in a note can run script.
 */

import DOMPurify from 'dompurify';
import type { Config, DOMPurify as Purifier } from 'dompurify';
import { Marked } from 'marked';
import type { Tokens, TokenizerAndRendererExtension } from 'marked';

import type { VaultIndex } from '../vault-index.js';
import { bowerNoteExtensions, transformBowerSections } from './bower-note.js';
import { parseFrontmatter } from './frontmatter.js';
import { driveFileIdOf, embedKind, imagePlaceholder } from './embeds.js';
import { escapeHtml, slugify } from './html.js';
import { displayName } from '../navigation.js';
import {
  headingFragment,
  parseWikilink,
  renderFileLink,
  renderWikilink,
  resolveMarkdownLink,
  resolveWikilink,
  wikilinkText,
} from './wikilinks.js';
import type { EmbedOptions } from './wikilinks.js';

export interface RenderedNote {
  /** Sanitized HTML of the note body. */
  html: string;
  /** Parsed frontmatter; `tags`, when present, is a `string[]`. */
  frontmatter: Record<string, unknown>;
  /** Tags from the frontmatter, without `#`. */
  tags: string[];
}

export interface RenderOptions {
  /**
   * Path of the note relative to the Bower folder; relative Markdown links
   * resolve against its folder. Defaults to the top of the folder.
   */
  path?: string;
  /**
   * Whether `![[Other note]]` becomes a transclusion placeholder. `false`
   * when rendering a note transcluded at the depth cap, so nesting stops
   * there (`hydrate-embeds.ts`).
   */
  transclude?: boolean;
  /**
   * The note's own title, as its header already shows it (`routes/note.tsx`,
   * `noteTitle(file, text)` — #306: frontmatter `title`, else the first
   * `# ` heading, else `file.name` without `.md`). When the body's very
   * first block is a heading whose text equals it (case-insensitive,
   * ignoring emphasis markers), that heading is dropped so the title never
   * appears twice (issue #307). Left undefined, no heading is ever dropped.
   */
  title?: string;
}

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details',
  'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'input', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span',
  'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'u', 'ul',
]; // prettier-ignore

const ALLOWED_ATTR = [
  'align', 'alt', 'checked', 'class', 'data-bower-embed', 'data-bower-file',
  'disabled', 'href', 'id', 'open', 'rel', 'src', 'start', 'target',
  'title', 'type',
]; // prettier-ignore

/**
 * Links and images: web, mail, a note of this app (`/note/<id>`, optionally
 * `#heading`; nothing that could climb out with `..`), or a heading anchor.
 * DOMPurify separately lets `data:` through on `img`; the hook below keeps
 * only raster images of those.
 */
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto):|\/(?:note|file)\/[\w%-]+(?:#|$)|#)/i;

/**
 * `data:` URLs a note may use, and only as an `<img>` source: base64 raster
 * images, as pasted or clipped into Obsidian. Never SVG (a document that can
 * carry script if opened on its own) nor any other type.
 */
const RASTER_DATA_URI = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i;

/** External links: web pages, opened in a new tab. */
const EXTERNAL_HREF = /^https?:/i;

const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOWED_URI_REGEXP,
  // DOMPurify checks every other attribute value against the URI pattern.
  ADD_URI_SAFE_ATTR: [
    'align',
    'start',
    'type',
    'rel',
    'target',
    'data-bower-embed',
    'data-bower-file',
  ],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  // Belt and braces: none of these is in ALLOWED_TAGS either. No SVG or
  // MathML at all, so their namespaces cannot smuggle script or styles.
  FORBID_TAGS: ['script', 'iframe', 'style', 'svg', 'math'],
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
      if (EXTERNAL_HREF.test(href)) {
        // Every external link opens in a new tab that gets neither
        // `window.opener` nor the app's URL as referrer.
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      } else {
        // Links inside the app (`/note/`, `#heading`) and `mailto:` stay
        // plain, whatever the note asked for.
        node.removeAttribute('target');
        node.removeAttribute('rel');
      }
    }
    for (const name of ['href', 'src']) {
      const value = node.getAttribute(name);
      if (value === null || !/^data:/i.test(value.trim())) continue;
      const rasterImage =
        tag === 'img' && name === 'src' && RASTER_DATA_URI.test(value.trim());
      if (!rasterImage) node.removeAttribute(name);
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

function createMarked(index: VaultIndex, options: RenderOptions): Marked {
  const slugCounts = new Map<string, number>();
  const notePath = options.path ?? '';
  const embedOptions: EmbedOptions = {
    placeholders: true,
    transclude: options.transclude ?? true,
    notePath,
  };

  // `![[...]]` alone on a line is a block, so a transcluded note is not
  // wrapped in a paragraph.
  const embedBlock: TokenizerAndRendererExtension = {
    name: 'embedBlock',
    level: 'block',
    start: (src) => src.match(/^ {0,3}!\[\[[^[\]\n]+?\]\][ \t]*$/m)?.index,
    tokenizer(src) {
      const match = /^ {0,3}(!\[\[[^[\]\n]+?\]\])[ \t]*(?:\n+|$)/.exec(src);
      if (match === null) return undefined;
      return { type: 'embedBlock', raw: match[0], link: match[1] };
    },
    renderer(token) {
      const link = typeof token.link === 'string' ? token.link : '';
      return `${renderWikilink(link, index, true, embedOptions)}\n`;
    },
  };

  // In an answer, a paragraph that is only a link to a note ("More in
  // [[X]]." or just "[[X]]") is the board's checklist pill: "X · in
  // <top folder>" linking to the note (`Flow-07-Answer`, #708).
  const isAnswer = notePath.startsWith('Answers/');
  const notePill: TokenizerAndRendererExtension = {
    name: 'notePill',
    level: 'block',
    start: (src) => src.match(/^ {0,3}(?:More in[ \t]+)?\[\[/im)?.index,
    tokenizer(src) {
      if (!isAnswer) return undefined;
      const match =
        /^ {0,3}(?:More in[ \t]+)?(\[\[[^[\]\n]+?\]\])\.?[ \t]*(?:\n+|$)/i.exec(
          src,
        );
      if (match === null) return undefined;
      const link = parseWikilink(match[1] ?? '');
      const file = resolveWikilink(link.target, index);
      if (file === undefined || embedKind(file) !== 'note') return undefined;
      return { type: 'notePill', raw: match[0], link: match[1] };
    },
    renderer(token) {
      const raw = typeof token.link === 'string' ? token.link : '';
      const link = parseWikilink(raw);
      const file = resolveWikilink(link.target, index);
      if (file === undefined) return '';
      const top = file.path.includes('/') ? (file.path.split('/')[0] ?? '') : '';
      const where = top === '' ? '' : ` · in ${displayName(top)}`;
      const href = `/note/${encodeURIComponent(file.id)}${headingFragment(link.heading)}`;
      return (
        `<p class="wikilink-pill-row"><a class="wikilink-pill" ` +
        `href="${escapeHtml(href)}">` +
        `${escapeHtml(wikilinkText(link) + where)}</a></p>\n`
      );
    },
  };

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
      return renderWikilink(
        token.raw,
        index,
        token.embed === true,
        embedOptions,
      );
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
    extensions: [
      embedBlock,
      notePill,
      wikilink,
      highlight,
      callout,
      ...bowerNoteExtensions,
    ],
    hooks: {
      processAllTokens: (tokens) => transformBowerSections(tokens),
    },
    renderer: {
      // Links into the Bower folder: notes open in the app, other files in
      // Drive, `[](photo.png)` with no text shows the image. URLs and
      // anything unresolved fall back to marked's default (`false`).
      link({ href, tokens }: Tokens.Link): string | false {
        const target = resolveMarkdownLink(href, notePath, index);
        if (target === undefined) {
          // A Drive URL of a file that is in the Bower folder opens the
          // file in the app, not in Drive.
          const driveId = driveFileIdOf(href);
          const driveFile =
            driveId === undefined ? undefined : index.byId.get(driveId);
          if (driveFile === undefined) return false;
          const label = this.parser.parseInline(tokens);
          return renderFileLink(
            driveFile,
            label === '' ? escapeHtml(driveFile.name) : label,
            false,
            '',
          );
        }
        const { file } = target;
        const inner = this.parser.parseInline(tokens);
        if (inner === '' && embedKind(file) === 'image') {
          return imagePlaceholder(file, file.name);
        }
        const text = inner === '' ? escapeHtml(file.name) : inner;
        return renderFileLink(
          file,
          text,
          false,
          headingFragment(target.fragment),
        );
      },
      // `![alt](path)`: an image placeholder, a transcluded note, or a
      // Drive link for any other file.
      image({ href, text }: Tokens.Image): string | false {
        const target = resolveMarkdownLink(href, notePath, index);
        if (target === undefined) return false;
        const { file } = target;
        const label = text.trim() === '' ? file.name : text;
        if (embedKind(file) === 'image') return imagePlaceholder(file, label);
        return renderFileLink(
          file,
          escapeHtml(label),
          true,
          headingFragment(target.fragment),
          embedOptions,
        );
      },
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

/**
 * `body`, without its first heading when that heading's text equals `title`
 * (issue #307: the note header already shows the title once, so a
 * `# <title>` would otherwise repeat it as an H1 inside the body; #609: also
 * after a leading paragraph or Bower's note box). Only the first heading
 * counts — a later one, even one that happens to match, stays. `undefined` `title` never drops
 * anything.
 */
function dropLeadingTitleHeading(
  body: string,
  title: string | undefined,
): string {
  if (title === undefined) return body;
  const wanted = title.trim().toLowerCase();
  const lines = body.split('\n');
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fenceMark !== undefined) {
      if (fence === undefined) fence = fenceMark.charAt(0);
      else if (fenceMark.charAt(0) === fence) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const match = /^ {0,3}#{1,6}[ \t]+([^\n]*?)[ \t]*#*[ \t]*$/.exec(line);
    if (match === null) continue;
    // Only the note's first heading counts; a later match stays.
    const headingText = (match[1] ?? '').replace(/[*_`]+/g, '').trim();
    if (headingText.toLowerCase() !== wanted) return body;
    lines.splice(i, 1);
    return lines.join('\n');
  }
  return body;
}

const plainMarked = new Marked({ gfm: true, breaks: true });

/**
 * Renders plain Markdown to sanitized HTML: no wikilinks, no frontmatter,
 * no vault index — for static app copy such as `docs/privacy.md`, not a
 * note. Needs a DOM (`window`) for the sanitizer.
 */
export function renderPlainMarkdown(text: string): string {
  return sanitizeHtml(plainMarked.parse(text, { async: false }));
}

/**
 * Renders one line of Markdown inline — `**bold**`, backticks, wikilinks,
 * `==highlight==` — to sanitized HTML, with no block elements or embeds.
 * For short strings outside a note body: the health check's findings
 * (`routes/health.tsx`, issue #305), each checked against `index` so a
 * wikilink resolves to a link or shows the same missing-link style as
 * inside a note. Needs a DOM (`window`) for the sanitizer.
 */
export function renderInline(text: string, index: VaultIndex): string {
  return sanitizeHtml(
    createMarked(index, {}).parseInline(text, { async: false }),
  );
}

/**
 * Renders a note to sanitized HTML. Needs a DOM (`window`) for the sanitizer.
 */
export function renderNote(
  text: string,
  index: VaultIndex,
  options: RenderOptions = {},
): RenderedNote {
  const { data, body } = parseFrontmatter(text);
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const strippedBody = dropLeadingTitleHeading(body, options.title);
  const html = createMarked(index, options).parse(strippedBody, {
    async: false,
  });
  return {
    html: sanitizeHtml(html),
    frontmatter: data,
    tags,
  };
}
