/**
 * In-memory index of the Bower folder built from a `listVault` result.
 * Pure: no Drive calls. Hides what the user should not browse: any dot-folder
 * at any depth (`.obsidian`, `.claude`, `.trash`, whatever another editor
 * adds — spec §14), processed originals (anything under a `Processed/`
 * folder, at any depth), folder notes named `_*.md`, and any dot-file
 * (`.hidden.md`-style). Opening the folder in Obsidian or another editor
 * never changes what the app shows.
 */

import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';

export interface VaultIndex {
  byId: Map<string, DriveFile>;
  /** Exact path relative to the Bower folder. The first file wins on duplicates. */
  byPath: Map<string, DriveFile>;
  /** Lower-cased file name without extension → every file with that name. */
  byBasename: Map<string, DriveFile[]>;
  folders: DriveFile[];
  /** Markdown files only. */
  notes: DriveFile[];
  /**
   * Every other visible file: PDFs, photos, Google Docs and the rest, each
   * with its Drive `mimeType` (its type, `fileKind`) and `modifiedTime`. A
   * folder screen lists them next to the notes (#349).
   */
  files: DriveFile[];
  /**
   * The top-level `.claude` folder, set aside so the explorer's "Bower's
   * files" group can list it as "Agent settings" when `showAppFiles` is on
   * (spec §14). Every other dot-folder stays hidden regardless of that
   * setting; this is the one exception, and it never appears in the tree,
   * Recent, search or the switcher.
   */
  agentSettingsFolder?: DriveFile;
  /**
   * Each folder's own note (`_<Folder>.md`, hidden from the tree by
   * `isHidden`), keyed by the folder's path. Pins (#215) reads and writes a
   * folder's `pinned` frontmatter here; a folder with none yet has no entry.
   */
  folderNotes: Map<string, DriveFile>;
  /** `pinned` timestamp by note id, for every note known to be pinned. Empty
   * until `vault-store` hydrates it (`withPinnedAt`): `buildVaultIndex` is
   * pure and does no frontmatter reads. */
  notePinnedAt: Map<string, string>;
  /** `pinned` timestamp by folder path, for every folder known to be pinned.
   * Same caveat as `notePinnedAt`. */
  folderPinnedAt: Map<string, string>;
  /**
   * The vault's `bower_rules_version`, from the frontmatter of its
   * `CLAUDE.md` (`rulesVersionOf`, #197), or `null` while unknown: not read
   * yet, no `CLAUDE.md`, or its text could not be fetched. Same caveat as
   * `notePinnedAt`: `vault-store` fills it in (`withRulesVersion`).
   */
  bowerRulesVersion: number | null;
}

const HIDDEN_FOLDERS = new Set(['Processed']);

function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME;
}

function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/** A folder's own note: `_<Folder>.md`, living inside the folder it describes. */
function isFolderNoteName(name: string): boolean {
  return name.startsWith('_') && isMarkdown(name);
}

export function isHidden(file: DriveFile): boolean {
  const segments = file.path.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return true;
  const folders = isFolder(file) ? segments : segments.slice(0, -1);
  if (folders.some((segment) => HIDDEN_FOLDERS.has(segment))) return true;
  return !isFolder(file) && isFolderNoteName(file.name);
}

/** `path`'s containing folder (everything before its last `/`), or `''` for
 * a top-level file. */
function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Lower-cased name without its extension (`My Note.md` → `my note`). */
export function basenameKey(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
}

/**
 * Bower's own files: kept in the index (so `/note/:id` still opens them) but
 * left out of the tree, Recent, search and the switcher unless the
 * `showAppFiles` preference is on (spec §5.3). Top-level only —
 * `CLAUDE.md`, `Rules.md`, `index.md`, `log.md`, `About-Me.md`, `README.md`,
 * `Lint Report.md` and any dated `Lint Report *.md` — except the agent's
 * instruction notes (`Bower - *.md`), which count at any depth. The name is
 * matched as written; only the `.md` extension is case-insensitive.
 */
const TOP_LEVEL_APP_BASENAMES = new Set([
  'CLAUDE',
  'Rules',
  'index',
  'log',
  'About-Me',
  'README',
  'Lint Report',
]);

export function isAppFile(path: string, name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  const base = name.slice(0, dot);
  if (name.slice(dot + 1).toLowerCase() !== 'md') return false;

  if (base.startsWith('Bower - ')) return true;
  if (path.includes('/')) return false;

  return TOP_LEVEL_APP_BASENAMES.has(base) || base.startsWith('Lint Report ');
}

/**
 * Friendly names for Bower's own top-level files, shown in the "Bower's
 * files" group instead of the raw file name. Instruction notes
 * (`Bower - *.md`) are not here: they are labelled by their own title.
 */
export const APP_FILE_LABELS: Record<string, string> = {
  'CLAUDE.md': 'Rulebook',
  'Rules.md': 'Your rules',
  'index.md': 'Catalogue',
  'log.md': 'Journal',
  'About-Me.md': 'About me',
  'README.md': 'Read me',
  'Lint Report.md': 'Health report',
};

/**
 * `APP_FILE_LABELS`, with a dated `Lint Report *.md` also mapped to
 * "Health report" and any other app file (an instruction note) falling back
 * to its own title (its file name, extension dropped).
 */
export function appFileLabel(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const known = APP_FILE_LABELS[`${base}.md`];
  if (known !== undefined) return known;
  if (base.startsWith('Lint Report ')) {
    return APP_FILE_LABELS['Lint Report.md'] ?? 'Health report';
  }
  return base;
}

/** What a file is, for its icon and its type word on a folder screen. */
export type FileKind =
  | 'note'
  | 'pdf'
  | 'photo'
  | 'image'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'audio'
  | 'video'
  | 'file';

const GOOGLE_KINDS: Readonly<Record<string, FileKind>> = {
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides',
};

/** Raster formats a phone or camera produces: labelled "Photo". Any other
 * image (a drawing, an icon) is just an "Image". */
const PHOTO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

/** `file`'s kind from its name (`.md` is a note) and its Drive `mimeType`. */
export function fileKind(file: Pick<DriveFile, 'name' | 'mimeType'>): FileKind {
  if (isMarkdown(file.name)) return 'note';
  const mime = file.mimeType.toLowerCase();
  const google = GOOGLE_KINDS[mime];
  if (google !== undefined) return google;
  if (mime === 'application/pdf') return 'pdf';
  if (PHOTO_MIMES.has(mime)) return 'photo';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/** The type word a folder row shows ("PDF · filed by Bower"). */
export const FILE_KIND_LABELS: Readonly<Record<FileKind, string>> = {
  note: 'Note',
  pdf: 'PDF',
  photo: 'Photo',
  image: 'Image',
  doc: 'Google Doc',
  sheet: 'Google Sheet',
  slides: 'Google Slides',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
};

/**
 * A file's title: its name without the extension (`Lease 2026.pdf` →
 * `Lease 2026`). Extensions never show outside the Add queue; a note's title
 * comes from `noteTitle` instead.
 */
export function fileTitle(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function buildVaultIndex(files: DriveFile[]): VaultIndex {
  const index: VaultIndex = {
    byId: new Map(),
    byPath: new Map(),
    byBasename: new Map(),
    folders: [],
    notes: [],
    files: [],
    folderNotes: new Map(),
    notePinnedAt: new Map(),
    folderPinnedAt: new Map(),
    bowerRulesVersion: null,
  };

  for (const file of files) {
    if (isHidden(file)) {
      if (file.path === '.claude' && isFolder(file)) {
        index.agentSettingsFolder = file;
      } else if (!isFolder(file) && isFolderNoteName(file.name)) {
        index.folderNotes.set(dirname(file.path), file);
      }
      continue;
    }
    index.byId.set(file.id, file);
    if (!index.byPath.has(file.path)) index.byPath.set(file.path, file);
    if (isFolder(file)) {
      index.folders.push(file);
      continue;
    }
    const key = basenameKey(file.name);
    const same = index.byBasename.get(key);
    if (same === undefined) index.byBasename.set(key, [file]);
    else same.push(file);
    if (isMarkdown(file.name)) index.notes.push(file);
    else index.files.push(file);
  }

  return index;
}

/**
 * `index` with `notePinnedAt`/`folderPinnedAt` replaced by the given maps.
 * `buildVaultIndex` does no I/O, so it always starts these empty;
 * `vault-store` calls this once it has read (or lazily fetched) the
 * `pinned` frontmatter of the notes and folder notes that need it. Pure:
 * everything else on `index` is kept as is.
 */
export function withPinnedAt(
  index: VaultIndex,
  notePinnedAt: Map<string, string>,
  folderPinnedAt: Map<string, string>,
): VaultIndex {
  return { ...index, notePinnedAt, folderPinnedAt };
}

/** `index` with `bowerRulesVersion` set; everything else kept as is. Pure. */
export function withRulesVersion(
  index: VaultIndex,
  bowerRulesVersion: number | null,
): VaultIndex {
  return { ...index, bowerRulesVersion };
}
