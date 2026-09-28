/**
 * A file's own screen (issue #350, the Phone-File board): what it previews
 * and the lines above the preview. Pure: no Drive calls, unit-tested in
 * `file-preview.test.ts`; `routes/file.tsx` does the fetching.
 *
 * - An image a browser can show (`embedKind`): its bytes, inline.
 * - A Google Doc: its text, exported by Drive as plain text.
 * - Anything else (a PDF, a Sheet, a video, a HEIC photo): Drive's
 *   thumbnail link, which for a PDF is its first page. No link, or one
 *   outside Google's image host (the only one the CSP admits, see
 *   `scripts/generate-headers.mjs`), means one sentence instead.
 */

import type { DriveFile } from './drive.js';
import { ORIGIN_FALLBACK, ORIGIN_LABELS } from './file-origin.js';
import type { Origin } from './file-origin.js';
import { embedKind } from './markdown/embeds.js';
import { relativeTime } from './navigation.js';
import { FILE_KIND_LABELS, fileKind } from './vault-index.js';

export type PreviewKind = 'image' | 'text' | 'thumbnail';

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

/** How `file` is previewed on its screen. */
export function previewKind(
  file: Pick<DriveFile, 'name' | 'mimeType'>,
): PreviewKind {
  if (file.mimeType === GOOGLE_DOC_MIME) return 'text';
  if (embedKind(file) === 'image') return 'image';
  return 'thumbnail';
}

/** The MIME type a Google Doc is exported as for its preview. */
export const DOC_PREVIEW_MIME = 'text/plain';

/** The width, in pixels, the thumbnail is asked for: sharp on a phone. */
export const THUMBNAIL_SIZE = 1000;

/** The host suffix of Drive's thumbnails, the one the CSP admits. */
const THUMBNAIL_HOST_SUFFIX = '.googleusercontent.com';

/**
 * Drive's `thumbnailLink` asked at `size` pixels instead of its default 220
 * (the trailing `=s220`), or `null` when there is no link or it is not an
 * `https` link on Google's image host (the CSP would block it anyway).
 */
export function thumbnailUrl(
  link: string | null,
  size: number = THUMBNAIL_SIZE,
): string | null {
  if (link === null) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname.endsWith(THUMBNAIL_HOST_SUFFIX)) return null;
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=s${size}`) : link;
}

/** A size in words: "820 bytes", "14 KB", "1.2 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  const mb = bytes / 1_000_000;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** The type line: "PDF · 1.2 MB", or just "Google Doc" (no size in Drive). */
export function typeLine(
  file: Pick<DriveFile, 'name' | 'mimeType' | 'size'>,
): string {
  const kind = FILE_KIND_LABELS[fileKind(file)];
  return file.size === undefined ? kind : `${kind} · ${formatSize(file.size)}`;
}

/**
 * When and by whom: "Filed by Bower · today", "In this folder · 3 days ago".
 * No `modifiedTime`: the origin alone.
 */
export function whenLine(
  origin: Origin | null,
  modifiedTime: string | undefined,
  now: number,
): string {
  const who = origin === null ? ORIGIN_FALLBACK : ORIGIN_LABELS[origin];
  const said = who.charAt(0).toUpperCase() + who.slice(1);
  return modifiedTime === undefined
    ? said
    : `${said} · ${relativeTime(modifiedTime, now)}`;
}
