/**
 * Attachments and embeds, pure part: which kind of file a link points at,
 * where a relative Markdown path lands in the Bower folder, and the HTML the
 * renderer emits. Images and transcluded notes need Drive data, so the
 * renderer only emits placeholders (`data-bower-file`, `data-bower-embed`);
 * `hydrate-embeds.ts` fills them in once the HTML is in the page.
 */

import type { DriveFile } from '../drive.js';
import { escapeHtml } from './html.js';

/** A note (shown in the app), an image (shown inline) or any other file. */
export type EmbedKind = 'note' | 'image' | 'file';

/** Image formats every current browser can show in an `<img>`. */
const IMAGE_EXTENSIONS = new Set([
  'apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp',
]); // prettier-ignore

const IMAGE_MIME_TYPES = new Set([
  'image/apng', 'image/avif', 'image/bmp', 'image/gif', 'image/jpeg',
  'image/png', 'image/svg+xml', 'image/webp', 'image/x-icon',
  'image/vnd.microsoft.icon',
]); // prettier-ignore

/** Lower-cased extension without the dot, or `''`. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Classifies a file by extension, then by MIME type. */
export function embedKind(file: DriveFile): EmbedKind {
  const extension = extensionOf(file.name);
  if (extension === 'md') return 'note';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (IMAGE_MIME_TYPES.has(file.mimeType.toLowerCase())) return 'image';
  return 'file';
}

/** Where a file opens in Google Drive: its `webViewLink`, else the viewer URL. */
export function driveViewUrl(file: DriveFile): string {
  const link = file.webViewLink;
  if (link !== undefined && link.startsWith('https://')) return link;
  return `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
}

/**
 * Cache key for a file's bytes: the id plus its `modifiedTime`, so an image
 * replaced in Drive is fetched again and the old copy ages out of the LRU.
 */
export function blobCacheKey(file: DriveFile): string {
  return file.modifiedTime === undefined
    ? file.id
    : `${file.id}@${file.modifiedTime}`;
}

export interface LinkTarget {
  /** Path as written, percent-decoded, without the `#fragment`. */
  path: string;
  /** Decoded text after `#`, if any. */
  fragment?: string;
}

/**
 * Splits a Markdown link destination into a path and a fragment. Returns
 * `undefined` for anything that is not a path inside the Bower folder: a
 * URL with a scheme, a protocol-relative URL, an app route or a bare
 * `#heading`.
 */
export function parseLinkTarget(href: string): LinkTarget | undefined {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return undefined;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return undefined;
  if (trimmed.startsWith('/note/')) return undefined;

  const hash = trimmed.indexOf('#');
  const rawPath = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
  const rawFragment = hash >= 0 ? trimmed.slice(hash + 1) : '';
  const path = safeDecode(rawPath.split('?')[0] ?? '');
  if (path === '') return undefined;
  const fragment = safeDecode(rawFragment).trim();
  return fragment === '' ? { path } : { path, fragment };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Resolves `target` against the folder of the note at `notePath`, both
 * relative to the Bower folder: `('Projects/Plan.md', '../img/a.png')` →
 * `img/a.png`. A leading `/` means the top of the Bower folder. Returns
 * `undefined` when the path climbs above it.
 */
export function resolveRelativePath(
  notePath: string,
  target: string,
): string | undefined {
  const segments = target.startsWith('/')
    ? []
    : notePath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? undefined : segments.join('/');
}

/** A link that opens a non-note file in Drive, in a new tab. */
export function fileLinkHtml(
  file: DriveFile,
  textHtml: string,
  embed = false,
): string {
  const extra = embed ? ' wikilink-embed' : '';
  return (
    `<a class="wikilink wikilink-file${extra}" ` +
    `href="${escapeHtml(driveViewUrl(file))}" target="_blank" rel="noopener">` +
    `${textHtml}</a>`
  );
}

/** An image with no `src` yet; `hydrateEmbeds` loads it from Drive. */
export function imagePlaceholder(file: DriveFile, alt: string): string {
  return (
    `<img class="embed-image" data-bower-file="${escapeHtml(file.id)}" ` +
    `alt="${escapeHtml(alt)}">`
  );
}

/**
 * A block that `hydrateEmbeds` replaces with the other note's body. Until
 * then (or if it cannot be loaded) it shows a plain link to the note.
 */
export function transclusionPlaceholder(
  file: DriveFile,
  textHtml: string,
  fragment = '',
): string {
  const href = `/note/${encodeURIComponent(file.id)}${fragment}`;
  return (
    `<div class="transclusion-pending" data-bower-embed="${escapeHtml(file.id)}">` +
    `<a class="wikilink wikilink-embed" href="${escapeHtml(href)}">${textHtml}</a>` +
    '</div>'
  );
}
