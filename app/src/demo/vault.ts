/**
 * The demo's Bower folder in memory: a flat map of files and folders keyed
 * by id, built from `fixture.ts`, with the few operations the demo Drive
 * client (`drive.ts`) and the scripted run (`run.ts`) need. Nothing is
 * persisted: a reload starts again from the fixture.
 */

import { FOLDER_MIME } from '../drive.js';
import type {
  DriveFile,
  ImageMediaMetadata,
  VideoMediaMetadata,
} from '../drive.js';
import type { FixtureFile } from './fixture.js';

export const ROOT_ID = 'demo-root';

export interface Entry {
  id: string;
  name: string;
  mimeType: string;
  /** `null` only for the root. */
  parentId: string | null;
  modifiedTime: string;
  /** `undefined` for a folder. */
  content?: string | Blob;
  /** Drive app properties, when the fixture gives any. */
  appProperties?: Readonly<Record<string, string>>;
  /** The size Drive reports, when it differs from the stub's bytes (a 2.4 MB
   * photo held as a few bytes). */
  size?: number;
  /** A small picture of the file, as Drive's `thumbnailLink`. */
  thumbnailLink?: string;
  imageMediaMetadata?: ImageMediaMetadata;
  videoMediaMetadata?: VideoMediaMetadata;
  /** Drive shows this file in its own viewer (Office files, video): the
   * client answers `previewUrlOf`. */
  preview?: boolean;
}

/** The address of Drive's embeddable viewer for a file. */
export function drivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}

export class DemoVault {
  private readonly entries = new Map<string, Entry>();
  private nextId = 1;
  private lastStamp = 0;

  constructor(
    files: readonly FixtureFile[],
    private readonly now: () => number,
    /** Folders that exist without a file in them (an empty folder). */
    folders: readonly string[] = [],
  ) {
    this.entries.set(ROOT_ID, {
      id: ROOT_ID,
      name: 'Bower',
      mimeType: FOLDER_MIME,
      parentId: null,
      modifiedTime: new Date(0).toISOString(),
    });
    for (const path of folders) this.ensureFolder(path);
    for (const file of files) {
      const slash = file.path.lastIndexOf('/');
      const parentId =
        slash === -1 ? ROOT_ID : this.ensureFolder(file.path.slice(0, slash));
      this.add({
        name: file.path.slice(slash + 1),
        mimeType: file.mimeType ?? 'text/markdown',
        parentId,
        modifiedTime: file.modifiedTime,
        content: file.content,
        ...(file.appProperties !== undefined && {
          appProperties: file.appProperties,
        }),
        ...(file.size !== undefined && { size: file.size }),
        ...(file.thumbnailLink !== undefined && {
          thumbnailLink: file.thumbnailLink,
        }),
        ...(file.imageMediaMetadata !== undefined && {
          imageMediaMetadata: file.imageMediaMetadata,
        }),
        ...(file.videoMediaMetadata !== undefined && {
          videoMediaMetadata: file.videoMediaMetadata,
        }),
        ...(file.preview === true && { preview: true }),
      });
    }
  }

  /**
   * A fresh `modifiedTime`, strictly later than the last one handed out, so
   * two writes in the same millisecond still look different to the
   * freshness checks in `drive.ts`.
   */
  stamp(): string {
    this.lastStamp = Math.max(this.now(), this.lastStamp + 1);
    return new Date(this.lastStamp).toISOString();
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  all(): Entry[] {
    return [...this.entries.values()];
  }

  children(folderId: string): Entry[] {
    return [...this.entries.values()].filter((e) => e.parentId === folderId);
  }

  /** `/`-joined path of `id` from the top of the folder (`''` for the root). */
  pathOf(id: string): string {
    const parts: string[] = [];
    for (
      let entry = this.entries.get(id);
      entry !== undefined && entry.parentId !== null;
      entry = this.entries.get(entry.parentId)
    ) {
      parts.unshift(entry.name);
    }
    return parts.join('/');
  }

  byPath(path: string): Entry | undefined {
    let current = this.entries.get(ROOT_ID);
    for (const name of path.split('/')) {
      if (current === undefined) return undefined;
      const parentId: string = current.id;
      current = this.children(parentId).find((e) => e.name === name);
    }
    return current;
  }

  /** The folder at `path`, created (with any missing parents) if absent. */
  ensureFolder(path: string): string {
    let parentId = ROOT_ID;
    for (const name of path.split('/')) {
      const existing = this.children(parentId).find(
        (e) => e.name === name && e.mimeType === FOLDER_MIME,
      );
      parentId =
        existing?.id ??
        this.add({
          name,
          mimeType: FOLDER_MIME,
          parentId,
          modifiedTime: this.stamp(),
        }).id;
    }
    return parentId;
  }

  add(fields: Omit<Entry, 'id'>): Entry {
    const entry: Entry = { id: `demo-${this.nextId++}`, ...fields };
    this.entries.set(entry.id, entry);
    return entry;
  }

  remove(id: string): void {
    for (const child of this.children(id)) this.remove(child.id);
    this.entries.delete(id);
  }

  /** Moves the file at `from` to `to` (its folder created if needed). */
  move(from: string, to: string): void {
    const entry = this.byPath(from);
    if (entry === undefined) return;
    const slash = to.lastIndexOf('/');
    entry.parentId =
      slash === -1 ? ROOT_ID : this.ensureFolder(to.slice(0, slash));
    entry.name = to.slice(slash + 1);
    entry.modifiedTime = this.stamp();
  }

  /** Writes `text` at `path`, creating the file (and its folders) if absent. */
  write(path: string, text: string): Entry {
    const existing = this.byPath(path);
    if (existing !== undefined) {
      existing.content = text;
      existing.modifiedTime = this.stamp();
      return existing;
    }
    const slash = path.lastIndexOf('/');
    return this.add({
      name: path.slice(slash + 1),
      mimeType: 'text/markdown',
      parentId:
        slash === -1 ? ROOT_ID : this.ensureFolder(path.slice(0, slash)),
      modifiedTime: this.stamp(),
      content: text,
    });
  }

  async text(id: string): Promise<string | undefined> {
    const content = this.entries.get(id)?.content;
    return typeof content === 'string' ? content : content?.text();
  }

  /** `entry` as the Drive client returns it, with `path` as given. */
  toFile(entry: Entry, path: string): DriveFile {
    const file: DriveFile = {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      parents: entry.parentId === null ? [] : [entry.parentId],
      modifiedTime: entry.modifiedTime,
      path,
    };
    if (entry.appProperties !== undefined) {
      file.appProperties = entry.appProperties;
    }
    if (entry.size !== undefined) {
      file.size = entry.size;
    } else if (entry.content !== undefined) {
      file.size =
        typeof entry.content === 'string'
          ? new Blob([entry.content]).size
          : entry.content.size;
    }
    if (entry.mimeType !== FOLDER_MIME) {
      file.webViewLink = `https://drive.google.com/file/d/${encodeURIComponent(entry.id)}/view`;
    }
    if (entry.thumbnailLink !== undefined) {
      file.thumbnailLink = entry.thumbnailLink;
    }
    if (entry.imageMediaMetadata !== undefined) {
      file.imageMediaMetadata = entry.imageMediaMetadata;
    }
    if (entry.videoMediaMetadata !== undefined) {
      file.videoMediaMetadata = entry.videoMediaMetadata;
    }
    return file;
  }
}
