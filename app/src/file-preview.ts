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

/**
 * - `image`: the bytes, inline. `text`: a Google Doc exported as text.
 * - `plain`: a text or Markdown file, as it is. `table`: a CSV.
 * - `drive`: Drive's own preview frame (Office files and video).
 * - `none`: nothing to show (a ZIP, an unknown file). `thumbnail`: Drive's picture.
 */
export type PreviewKind =
  'image' | 'text' | 'plain' | 'table' | 'drive' | 'none' | 'thumbnail';

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

/** How `file` is previewed on its screen. */
export function previewKind(
  file: Pick<DriveFile, 'name' | 'mimeType'>,
): PreviewKind {
  if (file.mimeType === GOOGLE_DOC_MIME) return 'text';
  if (embedKind(file) === 'image') return 'image';
  switch (fileKind(file)) {
    case 'csv':
      return 'table';
    case 'text':
    case 'markdown':
      return 'plain';
    case 'excel':
    case 'powerpoint':
    case 'word':
    case 'opendocument':
    case 'video':
      return 'drive';
    case 'zip':
    case 'file':
      return 'none';
    default:
      return 'thumbnail';
  }
}

/** Drive's embeddable viewer for file `id` (the frame of `DrivePreview`). */
export function drivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
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

/** The kind word on a file's screen: "Spreadsheet (CSV)" for a CSV (board `Phone-File-Sheet`), else `FILE_KIND_LABELS`. */
export function kindWord(file: Pick<DriveFile, 'name' | 'mimeType'>): string {
  const kind = fileKind(file);
  return kind === 'csv' ? 'Spreadsheet (CSV)' : FILE_KIND_LABELS[kind];
}

/** "26 Sep": a day and a short month, from an ISO time or Drive's EXIF form (`2024:05:01 10:00:00`). */
export function shortDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const exif = /^(\d{4}):(\d{2}):(\d{2})[ T](.*)$/.exec(value);
  const date = new Date(
    exif === null ? value : `${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}`,
  );
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A length in words: "45 s", "2 min 14 s", "1 h 5 min". */
export function formatDuration(millis: number): string {
  const total = Math.max(0, Math.round(millis / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m === 0 ? `${h} h` : `${h} h ${m} min`;
  if (m > 0) return s === 0 ? `${m} min` : `${m} min ${s} s`;
  return `${s} s`;
}

export interface MetaExtras {
  /** A PDF's page count, from its companion note. */
  pages?: number;
  /** A CSV's data rows, once parsed. */
  rows?: number;
}

/**
 * The facts after the kind word on a file's screen (boards `Phone-File-*`):
 * "Taken 26 Sep · 2.4 MB" for a photo, "3 KB · 24 rows" for a CSV,
 * "2 min 14 s · 86 MB · 26 Sep" for a video, "42 pages · 1.1 MB" for a PDF.
 * Anything Drive or the note does not say is left out.
 */
export function metaFacts(
  file: Pick<
    DriveFile,
    | 'name'
    | 'mimeType'
    | 'size'
    | 'modifiedTime'
    | 'imageMediaMetadata'
    | 'videoMediaMetadata'
  >,
  extras: MetaExtras = {},
): string[] {
  const kind = fileKind(file);
  const size = file.size === undefined ? null : formatSize(file.size);
  const facts: (string | null)[] = [];
  if (kind === 'photo' || kind === 'heic' || kind === 'image') {
    const taken = shortDate(file.imageMediaMetadata?.time);
    facts.push(taken === null ? null : `Taken ${taken}`, size);
  } else if (kind === 'video') {
    const ms = file.videoMediaMetadata?.durationMillis;
    facts.push(
      ms === undefined ? null : formatDuration(ms),
      size,
      shortDate(file.modifiedTime),
    );
  } else if (kind === 'pdf') {
    const pages = extras.pages;
    facts.push(
      pages === undefined ? null : `${pages} ${pages === 1 ? 'page' : 'pages'}`,
      size,
    );
  } else if (kind === 'csv') {
    const rows = extras.rows;
    facts.push(
      size,
      rows === undefined ? null : `${rows} ${rows === 1 ? 'row' : 'rows'}`,
    );
  } else {
    facts.push(size);
  }
  return facts.filter((fact): fact is string => fact !== null);
}
