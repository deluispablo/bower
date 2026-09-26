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
