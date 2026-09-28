/**
 * The formats policy (spec R-SYS-10, board `System-Formats`): for each kind
 * of file, whether Bower reads it, how the app shows it, and what the person
 * is told about it. Pure data; the Add queue, the file screen and search read
 * it in later issues. The runner's rulebook states the same policy (#581).
 *
 * Kinds are the ones `vault-index.ts` tells apart (`fileKind`). System files
 * (`SYSTEM_FILE_PATTERNS`) are never listed, so they have no row.
 */

import type { FileKind } from './vault-index.js';

/** How the file screen shows a kind of file. */
export type AppShows =
  'text' | 'table' | 'page' | 'image' | 'drive-preview' | 'player' | 'none';

export interface FormatPolicy {
  /** Whether Bower can name, file, describe and pull details from it. */
  bowerReads: 'yes' | 'no';
  appShows: AppShows;
  /** What the person sees when they add it (the board's "At Add time"), or `null` for nothing. */
  addNotice: string | null;
  /** The short line on its Add queue row when it is only kept, or `null`. */
  queueLine: string | null;
  /** The sentence on its file screen, or `null` where the board has none. */
  fileNotice: string | null;
}

/** A file over this many bytes is filed by name, not read. */
export const MAX_READ_BYTES = 50 * 1024 * 1024;

/** A PDF over this many pages is filed by name, not read. */
export const MAX_READ_PAGES = 300;

/** The limits Bower states up front, as the board words them. */
export const READ_LIMITS_NOTICE =
  'a file over 50 MB or a PDF over 300 pages is filed by name, not read; the working sheet says which.';

/** What “Bower reads it” and “Kept” mean, as the board words them. */
export const FORMATS_EXPLANATION =
  '“Bower reads it” means it can name, file, describe and pull details from it. “Kept” means filed by its name and date, and Bower says so.';

const HEIC_NOTICE =
  "Bower keeps it by its date; it can't read this kind of photo yet.";
const OFFICE_NOTICE = 'Bower keeps it, not reads it. A Google Sheet works.';
const AUDIO_NOTICE = "Bower can't listen to audio. Say what it is.";
const VIDEO_NOTICE = "Bower can't watch videos. Say what it is.";
const ZIP_NOTICE = 'Add the files inside instead.';
const OTHER_NOTICE = 'Bower will keep it, not read it.';

const READ_AS_TEXT: FormatPolicy = {
  bowerReads: 'yes',
  appShows: 'text',
  addNotice: null,
  queueLine: null,
  fileNotice: null,
};

const READ_IN_DRIVE: FormatPolicy = {
  ...READ_AS_TEXT,
  appShows: 'drive-preview',
};

const KEPT_OFFICE: FormatPolicy = {
  bowerReads: 'no',
  appShows: 'drive-preview',
  addNotice: OFFICE_NOTICE,
  queueLine: 'Kept, not read: a Google Sheet works instead',
  fileNotice: OFFICE_NOTICE,
};

export const FORMAT_POLICIES: Readonly<Record<FileKind, FormatPolicy>> = {
  note: READ_AS_TEXT,
  markdown: READ_AS_TEXT,
  text: READ_AS_TEXT,
  email: READ_AS_TEXT,
  csv: { ...READ_AS_TEXT, appShows: 'table' },
  pdf: { ...READ_AS_TEXT, appShows: 'page' },
  photo: { ...READ_AS_TEXT, appShows: 'image' },
  image: { ...READ_AS_TEXT, appShows: 'image' },
  heic: {
    bowerReads: 'no',
    appShows: 'drive-preview',
    addNotice: HEIC_NOTICE,
    queueLine: "Kept, not read: Bower can't read this kind of photo yet",
    fileNotice: null,
  },
  word: READ_IN_DRIVE,
  opendocument: READ_IN_DRIVE,
  web: READ_IN_DRIVE,
  doc: { ...READ_AS_TEXT, addNotice: 'Saved as text' },
  sheet: {
    ...READ_AS_TEXT,
    appShows: 'table',
    addNotice: 'Saved as a table, first sheet only',
  },
  slides: { ...READ_AS_TEXT, appShows: 'page', addNotice: 'Saved as a PDF' },
  excel: KEPT_OFFICE,
  powerpoint: KEPT_OFFICE,
  audio: {
    bowerReads: 'no',
    appShows: 'player',
    addNotice: AUDIO_NOTICE,
    queueLine: "Kept, not read: Bower can't listen to audio",
    fileNotice: null,
  },
  video: {
    bowerReads: 'no',
    appShows: 'player',
    addNotice: VIDEO_NOTICE,
    queueLine: "Kept, not read: Bower can't watch videos",
    fileNotice: "Bower can't watch videos.",
  },
  zip: {
    bowerReads: 'no',
    appShows: 'none',
    addNotice: ZIP_NOTICE,
    queueLine: 'Kept, not read: add the files inside instead',
    fileNotice: null,
  },
  file: {
    bowerReads: 'no',
    appShows: 'none',
    addNotice: OTHER_NOTICE,
    queueLine: 'Kept, not read: Bower keeps it by its name',
    fileNotice: null,
  },
};

/** The policy for `kind`. */
export function formatPolicy(kind: FileKind): FormatPolicy {
  return FORMAT_POLICIES[kind];
}
