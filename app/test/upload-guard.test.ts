import { describe, expect, it, vi } from 'vitest';

import {
  activeItems,
  guardUnload,
  uploadThroughQueue,
} from '../src/upload-queue.js';
import type {
  AddUpload,
  QueueItem,
  UnloadTarget,
  UploadQueue,
} from '../src/upload-queue.js';

vi.mock('../src/drive.js', () => ({
  DRIVE_BASE: 'https://drive.test',
  RESUMABLE_CHUNK_BYTES: 8 * 1024 * 1024,
  getToken: () => Promise.resolve({ accessToken: 'TOKEN' }),
  invalidateToken: () => undefined,
}));

function item(id: string, patch: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    pileId: 'PILE',
    parentId: 'FOLDER_ID',
    name: `${id}.pdf`,
    size: 100,
    sent: 0,
    durable: true,
    state: 'waiting',
    ...patch,
  };
}

/** A queue whose items a test edits by hand. */
function fakeQueue(initial: QueueItem[] = []): {
  queue: Pick<UploadQueue, 'items' | 'subscribe' | 'add'>;
  set: (items: QueueItem[]) => void;
} {
  let items = initial;
  const listeners = new Set<() => void>();
  return {
    queue: {
      items: () => items,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      add: (input: AddUpload) => {
        const created = item('NEW', {
          name: input.name,
          size: input.blob.size,
        });
        items = [...items, created];
        return Promise.resolve(created);
      },
    },
    set: (next) => {
      items = next;
      for (const l of listeners) l();
    },
  };
}

function fakeTarget(): UnloadTarget & { count: () => number } {
  const handlers = new Set<(e: Event) => void>();
  return {
    addEventListener: (_t, h) => handlers.add(h),
    removeEventListener: (_t, h) => handlers.delete(h),
    count: () => handlers.size,
  };
}

describe('activeItems', () => {
  it('leaves out done and refused files', () => {
    const list = [
      item('a'),
      item('b', { state: 'uploading' }),
      item('c', { state: 'done' }),
      item('d', { state: 'failed', error: 'failed' }),
    ];
    expect(activeItems(list).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('guardUnload (R-UPL-3)', () => {
  it('is set only while a file is unfinished', () => {
    const { queue, set } = fakeQueue();
    const target = fakeTarget();
    guardUnload(queue, target);
    expect(target.count()).toBe(0);

    set([item('a', { state: 'uploading' })]);
    expect(target.count()).toBe(1);

    // A second file does not add a second handler.
    set([item('a', { state: 'uploading' }), item('b')]);
    expect(target.count()).toBe(1);

    set([item('a', { state: 'done' }), item('b', { state: 'done' })]);
    expect(target.count()).toBe(0);
  });

  it('is set at once when files are already waiting, and stops cleanly', () => {
    const { queue } = fakeQueue([item('a')]);
    const target = fakeTarget();
    const stop = guardUnload(queue, target);
    expect(target.count()).toBe(1);
    stop();
    expect(target.count()).toBe(0);
  });

  it('asks the browser to confirm leaving', () => {
    const { queue } = fakeQueue([item('a')]);
    let handler: ((e: Event) => void) | undefined;
    guardUnload(queue, {
      addEventListener: (_t, h) => {
        handler = h;
      },
      removeEventListener: () => undefined,
    });
    const event = new Event('beforeunload', { cancelable: true });
    handler?.(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('uploadThroughQueue', () => {
  it('settles when the file is done and reports progress', async () => {
    const { queue, set } = fakeQueue();
    const seen: number[] = [];
    const promise = uploadThroughQueue(
      queue as UploadQueue,
      {
        blob: new Blob(['x']),
        name: 'a.pdf',
        pileId: 'PILE',
        parentId: 'FOLDER_ID',
      },
      (sent) => seen.push(sent),
    );
    await Promise.resolve();
    await Promise.resolve();
    set([item('NEW', { state: 'uploading', sent: 40 })]);
    set([item('NEW', { state: 'done', sent: 100, fileId: 'F1' })]);
    await expect(promise).resolves.toMatchObject({ fileId: 'F1' });
    expect(seen).toContain(40);
  });

  it('rejects when Drive refuses the file', async () => {
    const { queue, set } = fakeQueue();
    const promise = uploadThroughQueue(queue as UploadQueue, {
      blob: new Blob(['x']),
      name: 'a.pdf',
      pileId: 'PILE',
      parentId: 'FOLDER_ID',
    });
    await Promise.resolve();
    await Promise.resolve();
    set([item('NEW', { state: 'failed', error: 'failed' })]);
    await expect(promise).rejects.toThrow('Drive refused');
  });
});
