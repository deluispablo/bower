/**
 * The demo's Drive client (#192): the `DriveClient` surface of `drive.ts`
 * over the in-memory folder (`vault.ts`). Same answers as Drive where the
 * app relies on them: paths relative to the listed folder, a fresh
 * `modifiedTime` on every write (so the edit and append conflict checks in
 * `drive.ts` run for real), `DriveError(404)` for an unknown id. Every call
 * first lets a run in flight catch up (`DemoServer.advance`), so a listing
 * taken mid-run shows the items filed so far.
 */

import { DriveError, FOLDER_MIME } from '../drive.js';
import type { DriveClient, DriveFile } from '../drive.js';
import { reply } from './api.js';
import type { DemoServer } from './server.js';
import { drivePreviewUrl } from './vault.js';
import type { Entry } from './vault.js';
import { demoSlowMs, takeDemoFail } from './load-switch.js';

/**
 * An e2e-only knob (#322): a Playwright test sets this on `window` before
 * the app loads (`page.addInitScript`) to hold `listVault`'s answer back a
 * few seconds, so it can watch Home's loading state. Unset everywhere else,
 * including every unit test (most run with no `window` at all).
 */
declare global {
  interface Window {
    __bowerDemoListDelayMs?: number;
  }
}

function listDelayMs(): number {
  return typeof window === 'undefined'
    ? 0
    : (window.__bowerDemoListDelayMs ?? 0);
}

/**
 * A demo read under the gate's switches (`load-switch.ts`): it waits while
 * slow is on, and fails once when fail is on.
 */
function underSwitches<T>(read: () => Promise<T>, extraMs = 0): Promise<T> {
  const ms = extraMs + demoSlowMs();
  const run = (): Promise<T> =>
    takeDemoFail()
      ? Promise.reject(
          new DriveError(503, 'Demo: this read failed on purpose.'),
        )
      : read();
  return ms <= 0
    ? run()
    : new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          run().then(resolve, reject);
        }, ms);
      });
}

function notFound(): DriveError {
  return new DriveError(404, 'File not found.');
}

/**
 * Drive's embeddable viewer for a file the fixture marks `preview` (Office
 * files and video), or `null` for any other. Not part of `DriveClient`: the
 * real app builds this address from the file id.
 */
export function previewUrlOf(server: DemoServer, id: string): string | null {
  return server.vault.get(id)?.preview === true ? drivePreviewUrl(id) : null;
}

export function createDemoDrive(server: DemoServer): DriveClient {
  const { vault } = server;

  const entry = (id: string): Entry => {
    server.advance();
    const found = vault.get(id);
    if (found === undefined) throw notFound();
    return found;
  };

  const file = (id: string): Entry => {
    const found = entry(id);
    if (found.mimeType === FOLDER_MIME) {
      throw new DriveError(400, 'That is a folder.');
    }
    return found;
  };

  const folder = (id: string): Entry => {
    const found = entry(id);
    if (found.mimeType !== FOLDER_MIME) throw notFound();
    return found;
  };

  const create = (
    parentId: string,
    name: string,
    mimeType: string,
    content: string | Blob,
  ): DriveFile => {
    folder(parentId);
    const created = vault.add({
      name,
      mimeType,
      parentId,
      modifiedTime: vault.stamp(),
      content,
    });
    return vault.toFile(created, name);
  };

  const blobOf = (found: Entry): Blob => {
    const content = found.content ?? '';
    return typeof content === 'string'
      ? new Blob([content], { type: found.mimeType })
      : content;
  };

  return {
    listVault: (folderId) => {
      const answer = (): Promise<DriveFile[]> =>
        reply(() => {
          folder(folderId);
          const files: DriveFile[] = [];
          const walk = (id: string, prefix: string): void => {
            for (const child of vault.children(id)) {
              const path =
                prefix === '' ? child.name : `${prefix}/${child.name}`;
              files.push(vault.toFile(child, path));
              if (child.mimeType === FOLDER_MIME) walk(child.id, path);
            }
          };
          walk(folderId, '');
          return files.sort((a, b) =>
            a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
          );
        });
      return underSwitches(answer, listDelayMs());
    },

    listFolder: (folderId) =>
      reply(() => {
        folder(folderId);
        return vault.children(folderId).map((c) => vault.toFile(c, c.name));
      }),

    searchFullText: async (query) => {
      server.advance();
      const needle = query.trim().toLowerCase();
      const hits: DriveFile[] = [];
      if (needle === '') return hits;
      for (const found of vault.all()) {
        if (found.mimeType === FOLDER_MIME) continue;
        const text = (await vault.text(found.id)) ?? '';
        if (`${found.name}\n${text}`.toLowerCase().includes(needle)) {
          hits.push(vault.toFile(found, found.name));
        }
      }
      return hits.slice(0, 50);
    },

    getText: (id) =>
      underSwitches(async () => (await vault.text(file(id).id)) ?? ''),

    getBlob: (id) => reply(() => blobOf(file(id))),

    upload: (parentId, upload, onProgress) =>
      reply(() => {
        const created = create(
          parentId,
          upload.name,
          upload.type || 'application/octet-stream',
          upload,
        );
        onProgress?.(upload.size, upload.size);
        return created;
      }),

    createTextFile: (parentId, name, content) =>
      reply(() => create(parentId, name, 'text/markdown', content)),

    createFolder: (parentId, name) =>
      reply(() => {
        folder(parentId);
        const created = vault.add({
          name,
          mimeType: FOLDER_MIME,
          parentId,
          modifiedTime: vault.stamp(),
        });
        return vault.toFile(created, name);
      }),

    copyIntoInbox: (id, name, inboxId) =>
      reply(() => {
        const original = file(id);
        return create(inboxId, name, original.mimeType, original.content ?? '');
      }),

    exportFile: (id) =>
      reply(() => {
        // The demo folder holds no Google Docs, Sheets or Slides to export.
        file(id);
        throw new DriveError(400, 'This file cannot be exported.');
      }),

    updateFileText: (id, text) =>
      reply(() => {
        const found = file(id);
        found.content = text;
        found.modifiedTime = vault.stamp();
        return vault.toFile(found, found.name);
      }),

    deleteFile: (id) =>
      reply(() => {
        entry(id);
        vault.remove(id);
      }),

    modifiedTimeOf: (id) => reply(() => entry(id).modifiedTime),

    // Only the files the fixture gives a picture to (photos, PDFs, Office
    // files) have a thumbnail; the rest answer "none", so the file screen
    // shows its one sentence instead (#350).
    thumbnailLinkOf: (id) => reply(() => file(id).thumbnailLink ?? null),
  } satisfies DriveClient;
}
