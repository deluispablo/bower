/**
 * In-memory index of the Bower folder built from a `listVault` result.
 * Pure: no Drive calls. Hides what the user should not browse: Obsidian's
 * settings (`.obsidian/`), folder notes named `_*.md`, and processed
 * originals (anything under a `Processed/` folder, at any depth).
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
}

const HIDDEN_FOLDERS = new Set(['.obsidian', 'Processed']);

function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME;
}

function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

export function isHidden(file: DriveFile): boolean {
  const segments = file.path.split('/');
  const folders = isFolder(file) ? segments : segments.slice(0, -1);
  if (folders.some((segment) => HIDDEN_FOLDERS.has(segment))) return true;
  return !isFolder(file) && file.name.startsWith('_') && isMarkdown(file.name);
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
 * `CLAUDE.md`, `index.md`, `log.md`, `About-Me.md`, `README.md`,
 * `Lint Report.md` and any dated `Lint Report *.md` — except the agent's
 * instruction notes (`Bower - *.md`), which count at any depth. The name is
 * matched as written; only the `.md` extension is case-insensitive.
 */
const TOP_LEVEL_APP_BASENAMES = new Set([
  'CLAUDE',
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

export function buildVaultIndex(files: DriveFile[]): VaultIndex {
  const index: VaultIndex = {
    byId: new Map(),
    byPath: new Map(),
    byBasename: new Map(),
    folders: [],
    notes: [],
  };

  for (const file of files) {
    if (isHidden(file)) continue;
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
  }

  return index;
}
