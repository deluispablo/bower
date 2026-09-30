/** One title per file on every view, forgotten when a run completes (#905,
 * R-API-7). */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { FOLDER_MIME } from '../src/drive.js';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  entries: vi.fn(() => Promise.resolve([])),
  clear: vi.fn(() => Promise.resolve()),
  createStore: vi.fn(() => ({})),
}));

const { invalidateOnRunComplete } = await import('../src/cache.js');
const {
  forgetTitles,
  hasSharedTitle,
  onTitlesForgotten,
  rememberTitles,
  resolveNoteTitles,
  titleFor,
} = await import('../src/note-titles.js');

const note: DriveFile = {
  id: 'note-1',
  name: 'moonee-ponds-10-43.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '1-Projects/Moonee Ponds/moonee-ponds-10-43.md',
  modifiedTime: '2026-09-30T06:54:00Z',
};

beforeEach(() => {
  forgetTitles();
});

describe('shared titles', () => {
  it('gives list, grid, tree and search the same resolved title', async () => {
    const resolved = await resolveNoteTitles([note], () =>
      Promise.resolve({
        text: '---\ntitle: 10-43 Buckley St, Moonee Ponds\n---\n',
        modifiedTime: '2026-09-30T06:54:00Z',
      }),
    );
    rememberTitles(resolved);
    const views = ['list', 'grid', 'tree', 'search'].map(() => titleFor(note));
    expect(new Set(views)).toEqual(new Set(['10-43 Buckley St, Moonee Ponds']));
    expect(hasSharedTitle(note)).toBe(true);
  });

  it('names folders and files without prefix or extension', () => {
    const folder = { ...note, id: 'f', name: '2-Areas', mimeType: FOLDER_MIME };
    const pdf = {
      ...note,
      id: 'p',
      name: 'Passport copy.pdf',
      mimeType: 'application/pdf',
    };
    expect(titleFor(folder)).toBe('Areas');
    expect(titleFor(pdf)).toBe('Passport copy');
  });

  it('forgets every title when a run completes, and says so', async () => {
    rememberTitles(
      new Map([[`${note.id}:${note.modifiedTime ?? ''}`, 'Old title']]),
    );
    const listener = vi.fn();
    const stop = onTitlesForgotten(listener);
    await invalidateOnRunComplete();
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasSharedTitle(note)).toBe(false);
    expect(titleFor(note)).not.toBe('Old title');
  });
});
