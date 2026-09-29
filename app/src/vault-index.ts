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
  /** Pin timestamp by file id, for every file pinned through its folder's
   * note (`pinned_files`, #688). Same caveat as `notePinnedAt`. */
  filePinnedAt: Map<string, string>;
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

/**
 * Operating-system, sync and Office lock files nobody should ever see (spec
 * D18, R-SYS-4). Matched case-insensitively against every path segment, so a
 * hit at any depth hides the file. `*` matches any run of characters; an
 * entry ending in `/` names a folder and hides everything inside it.
 *
 * The runner's rclone filters (#581) mirror this list: keep the two in step.
 */
export const SYSTEM_FILE_PATTERNS: readonly string[] = [
  'desktop.ini',
  'Thumbs.db',
  'ehthumbs.db',
  '.DS_Store',
  'Icon\r',
  '~$*',
  '.~lock.*#',
  '.tmp.driveupload/',
];

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/\/$/, '')
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`, 'i');
}

const SYSTEM_FILE_MATCHERS: readonly RegExp[] =
  SYSTEM_FILE_PATTERNS.map(patternToRegExp);

/** Whether any segment of `path` is a system file or folder (`SYSTEM_FILE_PATTERNS`). */
function isSystemPath(path: string): boolean {
  return path
    .split('/')
    .some((segment) => SYSTEM_FILE_MATCHERS.some((re) => re.test(segment)));
}

export function isHidden(file: DriveFile): boolean {
  if (isSystemPath(file.path)) return true;
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
  | 'heic'
  | 'image'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'excel'
  | 'csv'
  | 'word'
  | 'powerpoint'
  | 'opendocument'
  | 'text'
  | 'markdown'
  | 'zip'
  | 'email'
  | 'web'
  | 'audio'
  | 'video'
  | 'file';

const GOOGLE_KINDS: Readonly<Record<string, FileKind>> = {
  'application/vnd.google-apps.document': 'doc',
  'application/vnd.google-apps.spreadsheet': 'sheet',
  'application/vnd.google-apps.presentation': 'slides',
};

/** Exact MIME types, checked before any extension. */
const MIME_KINDS: Readonly<Record<string, FileKind>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/webp': 'photo',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.ms-excel': 'excel',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'word',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'powerpoint',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.oasis.opendocument.text': 'opendocument',
  'application/vnd.oasis.opendocument.spreadsheet': 'opendocument',
  'text/plain': 'text',
  'text/markdown': 'markdown',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'message/rfc822': 'email',
  'text/html': 'web',
  'application/xhtml+xml': 'web',
};

/** Extensions, used when the MIME type does not say (or is generic). */
const EXTENSION_KINDS: Readonly<Record<string, FileKind>> = {
  pdf: 'pdf',
  jpg: 'photo',
  jpeg: 'photo',
  png: 'photo',
  webp: 'photo',
  heic: 'heic',
  heif: 'heic',
  gif: 'image',
  svg: 'image',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'csv',
  docx: 'word',
  doc: 'word',
  pptx: 'powerpoint',
  ppt: 'powerpoint',
  odt: 'opendocument',
  ods: 'opendocument',
  txt: 'text',
  markdown: 'markdown',
  zip: 'zip',
  eml: 'email',
  html: 'web',
  htm: 'web',
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  mp4: 'video',
  mov: 'video',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * `file`'s kind: a `.md` name is a note; then its Drive `mimeType`, then its
 * extension (spec R-SYS-5). Only a file neither says anything about is a
 * plain `file`.
 */
export function fileKind(file: Pick<DriveFile, 'name' | 'mimeType'>): FileKind {
  if (isMarkdown(file.name)) return 'note';
  const mime = file.mimeType.toLowerCase();
  const known = GOOGLE_KINDS[mime] ?? MIME_KINDS[mime];
  if (known !== undefined) return known;
  if (mime.startsWith('image/') && mime !== 'image/gif') return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return EXTENSION_KINDS[extensionOf(file.name)] ?? 'file';
}

/** The type word a folder row shows ("PDF · filed by Bower"). */
export const FILE_KIND_LABELS: Readonly<Record<FileKind, string>> = {
  note: 'Note',
  pdf: 'PDF',
  photo: 'Photo',
  heic: 'iPhone photo',
  image: 'Image',
  doc: 'Google Doc',
  sheet: 'Google Sheet',
  slides: 'Google Slides',
  excel: 'Excel spreadsheet',
  csv: 'Spreadsheet (CSV)',
  word: 'Word document',
  powerpoint: 'PowerPoint',
  opendocument: 'OpenDocument',
  text: 'Text',
  markdown: 'Markdown',
  zip: 'ZIP archive',
  email: 'Email',
  web: 'Web page',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
};

/** The badge each kind has when its file is not needed to tell (see `kindBadge`). */
const KIND_BADGES: Readonly<Record<FileKind, string>> = {
  note: 'MD',
  pdf: 'PDF',
  photo: 'JPG',
  heic: 'HEIC',
  image: 'PNG',
  doc: 'LINK',
  sheet: 'LINK',
  slides: 'LINK',
  excel: 'XLS',
  csv: 'CSV',
  word: 'DOC',
  powerpoint: 'PPT',
  opendocument: 'DOC',
  text: 'TXT',
  markdown: 'MD',
  zip: 'ZIP',
  email: 'EML',
  web: 'HTML',
  audio: 'MP3',
  video: 'MP4',
  file: 'FILE',
};

/**
 * The 3–4 letter badge for a kind. A photo is `JPG` unless `file` says it
 * is a PNG or WebP; a video is `MP4` unless `file` says QuickTime (`MOV`).
 * Google files are `LINK`: they open in Drive.
 */
export function kindBadge(
  kind: FileKind,
  file?: Pick<DriveFile, 'name' | 'mimeType'>,
): string {
  if (file !== undefined) {
    const mime = file.mimeType.toLowerCase();
    const ext = extensionOf(file.name);
    if (kind === 'photo' && (mime === 'image/png' || ext === 'png'))
      return 'PNG';
    if (kind === 'video' && (mime === 'video/quicktime' || ext === 'mov'))
      return 'MOV';
  }
  return KIND_BADGES[kind];
}

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
    filePinnedAt: new Map(),
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
  filePinnedAt: Map<string, string> = index.filePinnedAt,
): VaultIndex {
  return { ...index, notePinnedAt, folderPinnedAt, filePinnedAt };
}

/** `index` with `bowerRulesVersion` set; everything else kept as is. Pure. */
export function withRulesVersion(
  index: VaultIndex,
  bowerRulesVersion: number | null,
): VaultIndex {
  return { ...index, bowerRulesVersion };
}

/**
 * One file row of `index.md` (#369), the shape the agent writes when it
 * files an original: `- [[<path>]] · <type> · <origin>`, for example
 * `- [[1-Projects/Flat hunt/Lease agreement 2026.pdf]] · PDF · filed by Bower`.
 * Note rows (a link with no extension, or to a `.md`) are not file rows.
 * `file-origin.ts` reads the same rows for the origin alone.
 */
export interface CatalogueFile {
  /** The link target: the path from the top of the Bower folder, extension included. */
  path: string;
  /** The folder part of `path`, `''` for a file at the top. */
  folder: string;
  /** The type word as written (`PDF`), `''` when the row has none. */
  type: string;
  /** `type` as a `FileKind` when it is one of `FILE_KIND_LABELS` (any letter case), else `null`. */
  kind: FileKind | null;
  /** The last field as written (`filed by Bower`), `''` when the row has only a type. */
  origin: string;
}

/** A list item starting with a wikilink: `- [[target|alias]] rest`. */
const CATALOGUE_ROW = /^\s*[-*+]\s+\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\](.*)$/;

const KIND_BY_LABEL: ReadonlyMap<string, FileKind> = new Map([
  ...(Object.entries(FILE_KIND_LABELS) as [FileKind, string][]).map(
    ([kind, label]): [string, FileKind] => [label.toLowerCase(), kind],
  ),
  // What catalogues written before the label read "Spreadsheet (CSV)" say.
  ['spreadsheet', 'csv'] as [string, FileKind],
]);

/** Whether a link target names a file that is not a note: an extension other than `.md`. */
function isFileTarget(target: string): boolean {
  const name = target.slice(target.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 && !isMarkdown(name);
}

/**
 * Every file row in `index.md`'s text, in order; the first row for a path
 * wins. Pure: the caller reads `index.md` from Drive.
 */
export function parseCatalogueFiles(text: string): CatalogueFile[] {
  const rows: CatalogueFile[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = CATALOGUE_ROW.exec(line);
    const path = match?.[1]?.trim() ?? '';
    if (path === '' || !isFileTarget(path) || seen.has(path.toLowerCase()))
      continue;
    seen.add(path.toLowerCase());
    const fields = (match?.[2] ?? '')
      .split('·')
      .slice(1)
      .map((field) => field.trim());
    const type = fields[0] ?? '';
    rows.push({
      path,
      folder: dirname(path),
      type,
      kind: KIND_BY_LABEL.get(type.toLowerCase()) ?? null,
      origin: fields.length > 1 ? (fields[fields.length - 1] ?? '') : '',
    });
  }
  return rows;
}
