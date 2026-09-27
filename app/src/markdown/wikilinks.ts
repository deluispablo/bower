/**
 * Obsidian wikilinks: `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`,
 * `[[folder/Note]]`, `[[Note.md]]`, resolved against the vault index.
 * Links to notes open in the app; links to any other file open it in Drive.
 * Embeds (`![[...]]`) become image or transclusion placeholders when the
 * caller asks for them (`EmbedOptions`), plain links otherwise.
 */

import type { DriveFile } from '../drive.js';
import { basenameKey } from '../vault-index.js';
import type { VaultIndex } from '../vault-index.js';
import {
  embedKind,
  fileLinkHtml,
  imagePlaceholder,
  parseLinkTarget,
  resolveRelativePath,
  transclusionPlaceholder,
} from './embeds.js';
import { escapeHtml, headingAnchor } from './html.js';

export interface Wikilink {
  /** Note name or path as written, without `#heading` or `|alias`. */
  target: string;
  heading?: string;
  alias?: string;
}

/** One wikilink or embed; group 1 is `!` for an embed, group 2 the inside. */
export const WIKILINK_PATTERN = /(!?)\[\[([^[\]\n]+?)\]\]/;

/** Parses `[[...]]`, `![[...]]` or just the inside of the brackets. */
export function parseWikilink(raw: string): Wikilink {
  let inner = raw.trim();
  if (inner.startsWith('!')) inner = inner.slice(1);
  if (inner.startsWith('[[') && inner.endsWith(']]')) {
    inner = inner.slice(2, -2);
  }
  // Inside a table the separator is written `\|`.
  inner = inner.replace(/\\\|/g, '|');

  const link: Wikilink = { target: '' };
  const pipe = inner.indexOf('|');
  if (pipe >= 0) {
    const alias = inner.slice(pipe + 1).trim();
    if (alias !== '') link.alias = alias;
    inner = inner.slice(0, pipe);
  }
  const hash = inner.indexOf('#');
  if (hash >= 0) {
    const heading = inner.slice(hash + 1).trim();
    if (heading !== '') link.heading = heading;
    inner = inner.slice(0, hash);
  }
  link.target = inner.trim();
  return link;
}

function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * Finds the file a wikilink points to: by exact path (with `.md` added when
 * missing), then by file name, case-insensitively. When several files share
 * the name, a note beats an attachment, then the shortest path wins.
 */
export function resolveWikilink(
  target: string,
  index: VaultIndex,
): DriveFile | undefined {
  const path = target.trim().replace(/^\/+/, '');
  if (path === '') return undefined;

  const exact = isMarkdownPath(path)
    ? index.byPath.get(path)
    : (index.byPath.get(`${path}.md`) ?? index.byPath.get(path));
  if (exact !== undefined) return exact;

  const name = path.split('/').pop() ?? path;
  const withoutMd = isMarkdownPath(name) ? name.slice(0, -3) : name;
  let candidates =
    index.byBasename.get(withoutMd.toLowerCase()) ??
    index.byBasename.get(basenameKey(name)) ??
    [];
  if (path.includes('/')) {
    const suffix = `/${path.toLowerCase()}`;
    const inFolder = candidates.filter((file) => {
      const lower = `/${file.path.toLowerCase()}`;
      return lower.endsWith(suffix) || lower.endsWith(`${suffix}.md`);
    });
    if (inFolder.length > 0) candidates = inFolder;
  }

  let best: DriveFile | undefined;
  for (const file of candidates) {
    if (best === undefined) {
      best = file;
      continue;
    }
    const fileMd = isMarkdownPath(file.path);
    const bestMd = isMarkdownPath(best.path);
    if (fileMd !== bestMd) {
      if (fileMd) best = file;
    } else if (file.path.length < best.path.length) {
      best = file;
    }
  }
  return best;
}

export interface ResolvedLink {
  file: DriveFile;
  /** Heading or other fragment after `#`, decoded. */
  fragment?: string;
}

/**
 * Finds the file a Markdown link destination (`[text](dest)`,
 * `![alt](dest)`) points to: relative to the folder of the note at
 * `notePath` first, as Obsidian writes them, then like a wikilink (path from
 * the top of the Bower folder, then file name). URLs and anchors resolve to
 * `undefined`.
 */
export function resolveMarkdownLink(
  href: string,
  notePath: string,
  index: VaultIndex,
): ResolvedLink | undefined {
  const target = parseLinkTarget(href);
  if (target === undefined) return undefined;
  const relative = resolveRelativePath(notePath, target.path);
  const file =
    (relative === undefined
      ? undefined
      : (index.byPath.get(relative) ?? index.byPath.get(`${relative}.md`))) ??
    resolveWikilink(target.path, index);
  if (file === undefined) return undefined;
  return target.fragment === undefined
    ? { file }
    : { file, fragment: target.fragment };
}

/** Text shown for a link: the alias, else `Note > Heading`, without `.md`. */
export function wikilinkText(link: Wikilink): string {
  if (link.alias !== undefined) return link.alias;
  const target = isMarkdownPath(link.target)
    ? link.target.slice(0, -3)
    : link.target;
  if (link.heading === undefined) return target;
  return target === '' ? link.heading : `${target} > ${link.heading}`;
}

/** How `renderWikilink` treats embeds (`![[...]]`). */
export interface EmbedOptions {
  /** Emit image and transclusion placeholders instead of plain links. */
  placeholders?: boolean;
  /**
   * Allow note transclusion; `false` inside a transcluded note at the depth
   * cap (`MAX_TRANSCLUSION_DEPTH` in `hydrate-embeds.ts`).
   */
  transclude?: boolean;
  /** Path of the note being rendered; it is never transcluded into itself. */
  notePath?: string;
}

/** `#fragment` that reaches a heading; `''` when there is none. */
export function headingFragment(heading: string | undefined): string {
  // `[[Note#A#B]]` points at the last heading, as in Obsidian.
  const last = heading?.split('#').pop()?.trim();
  return last === undefined || last === '' ? '' : `#${headingAnchor(last)}`;
}

/**
 * HTML for a link or embed to a file that resolved. Notes link into the
 * app (`/note/<id>`), other files open in Drive. With `placeholders`, an
 * embedded image becomes an `<img data-bower-file>` and an embedded note a
 * transclusion block. `textHtml` must already be escaped.
 */
export function renderFileLink(
  file: DriveFile,
  textHtml: string,
  embed: boolean,
  fragment: string,
  options: EmbedOptions = {},
): string {
  const kind = embedKind(file);
  const placeholders = embed && options.placeholders === true;
  if (kind === 'note') {
    if (
      placeholders &&
      options.transclude !== false &&
      file.path !== options.notePath
    ) {
      return transclusionPlaceholder(file, textHtml, fragment);
    }
    const extra = embed ? ' wikilink-embed' : '';
    const href = `/note/${encodeURIComponent(file.id)}${fragment}`;
    return `<a class="wikilink${extra}" href="${escapeHtml(href)}">${textHtml}</a>`;
  }
  if (kind === 'image' && placeholders) {
    return imagePlaceholder(file, file.name);
  }
  return fileLinkHtml(file, textHtml, embed);
}

/**
 * HTML for one wikilink: a link to the note (`/note/<id>`) or, for any
 * other file, to Drive (see `renderFileLink`); a heading of the same note
 * links to its anchor; otherwise `<span class="wikilink-missing">`. Embeds
 * get the extra class `wikilink-embed`, or become placeholders when
 * `options.placeholders` is set.
 */
export function renderWikilink(
  raw: string,
  index: VaultIndex,
  embed = false,
  options: EmbedOptions = {},
): string {
  const link = parseWikilink(raw);
  const text = escapeHtml(wikilinkText(link));
  const extra = embed ? ' wikilink-embed' : '';
  const fragment = headingFragment(link.heading);

  if (link.target === '' && fragment !== '') {
    return `<a class="wikilink${extra}" href="${escapeHtml(fragment)}">${text}</a>`;
  }
  const file = resolveWikilink(link.target, index);
  if (file === undefined) {
    return `<span class="wikilink-missing${extra}">${text}</span>`;
  }
  if (embed && options.placeholders === true && embedKind(file) === 'image') {
    // `![[photo.png|300]]` sets a width in Obsidian; only a real alias is alt text.
    const alt =
      link.alias !== undefined && !/^\d+(x\d+)?$/.test(link.alias)
        ? link.alias
        : file.name;
    return imagePlaceholder(file, alt);
  }
  return renderFileLink(file, text, embed, fragment, options);
}

/** Escapes a plain string, turning any wikilinks inside it into links. */
export function renderTextWithWikilinks(
  text: string,
  index: VaultIndex,
): string {
  const global = new RegExp(WIKILINK_PATTERN.source, 'g');
  let html = '';
  let last = 0;
  for (const match of text.matchAll(global)) {
    html += escapeHtml(text.slice(last, match.index));
    html += renderWikilink(match[0], index, match[1] === '!');
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}
