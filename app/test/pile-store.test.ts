import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import type { QueueItem as Upload } from '../src/upload-queue.js';

// #769 (R-PILE-1, 7, 8, 9, 11): each pile is a context note in the inbox
// from its first file. Drive is an in-memory folder map; nothing leaves the
// process.
interface FakeFile {
  id: string;
  name: string;
  parent: string;
  text: string;
  modifiedTime: string;
  trashed: boolean;
  appProperties?: Readonly<Record<string, string>>;
}

const files = new Map<string, FakeFile>();
let clock = 0;
let nextId = 0;

function tick(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 8, 30, 10, 0, clock)).toISOString();
}

function asDrive(file: FakeFile): DriveFile {
  return {
    id: file.id,
    name: file.name,
    mimeType: 'text/markdown',
    parents: [file.parent],
    modifiedTime: file.modifiedTime,
    path: file.name,
  };
}

const createTextFile = vi.fn(
  (
    parentId: string,
    name: string,
    content: string,
    options?: { appProperties?: Readonly<Record<string, string>> },
  ): Promise<DriveFile> => {
    nextId += 1;
    const file: FakeFile = {
      id: `NOTE_${nextId}`,
      name,
      parent: parentId,
      text: content,
      modifiedTime: tick(),
      trashed: false,
      appProperties: options?.appProperties,
    };
    files.set(file.id, file);
    return Promise.resolve(asDrive(file));
  },
);
const updateFileText = vi.fn((id: string, text: string): Promise<DriveFile> => {
  const file = files.get(id);
  if (file === undefined) return Promise.reject(new Error('not found'));
  file.text = text;
  file.modifiedTime = tick();
  return Promise.resolve(asDrive(file));
});
const deleteFile = vi.fn((id: string): Promise<void> => {
  const file = files.get(id);
  if (file !== undefined) file.trashed = true;
  return Promise.resolve();
});
const listFolder = vi.fn(
  (folderId: string): Promise<DriveFile[]> =>
    Promise.resolve(
      [...files.values()]
        .filter((f) => f.parent === folderId && !f.trashed)
        .map(asDrive),
    ),
);
const getText = vi.fn((id: string): Promise<string> => {
  const file = files.get(id);
  return file === undefined
    ? Promise.reject(new Error('not found'))
    : Promise.resolve(file.text);
});
const showToast = vi.fn();

vi.mock('../src/drive.js', () => ({
  INSTRUCTION_APP_PROPERTIES: { bower: 'instruction' },
  createTextFile,
  updateFileText,
  deleteFile,
  listFolder,
  getText,
}));
vi.mock('../src/toast-store.js', () => ({ showToast }));

const store = await import('../src/pile-store.js');

const INBOX = 'FOLDER_ID';
const NOW = new Date(2026, 8, 30, 10, 42);

function notesIn(folder: string): FakeFile[] {
  return [...files.values()].filter(
    (f) => f.parent === folder && !f.trashed && f.name.endsWith('Context.md'),
  );
}

/** An uploaded file, as the queue leaves it in the inbox. */
function land(name: string): FakeFile {
  const file: FakeFile = {
    id: `FILE_${name}`,
    name,
    parent: INBOX,
    text: '',
    modifiedTime: tick(),
    trashed: false,
  };
  files.set(file.id, file);
  return file;
}

function onlyNote(): FakeFile {
  const notes = notesIn(INBOX);
  expect(notes).toHaveLength(1);
  return notes[0] as FakeFile;
}

beforeEach(() => {
  files.clear();
  clock = 0;
  nextId = 0;
});

afterEach(() => {
  store.resetPiles();
  vi.clearAllMocks();
});

describe('pileNote', () => {
  it('is a context note with the pile id, the text and its files', () => {
    const note = store.pileNote(
      {
        id: 'p1',
        noteFileId: null,
        createdAt: NOW.toISOString(),
        text: 'Five job offers.',
        items: [],
        closed: false,
      },
      ['a.pdf', 'b.pdf'],
    );
    expect(note).toMatch(
      /^---\ntags: \[instruction\]\ndate: .+\nvia: app\nkind: context\npile: p1\n---\n\nFive job offers.\n\n## Applies to\n\n- a\.pdf\n- b\.pdf\n$/,
    );
    expect(store.pileText(note)).toBe('Five job offers.');
  });
});

describe('R-PILE-1: the pile note', () => {
  it('is created in the inbox on the first attach, before any text', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    expect(createTextFile).not.toHaveBeenCalled();

    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'uploading' });

    const note = onlyNote();
    expect(note.name).toMatch(/^Bower - \d{4}-\d{2}-\d{2} \d{4} Context\.md$/);
    expect(note.text).toContain('kind: context\npile: p1\n');
    expect(note.text).toContain('## Applies to\n\n\n');
    expect(store.getPiles()[0]?.noteFileId).toBe(note.id);
  });

  it('R-PILE-11: is created with the app instruction properties', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'uploading' });
    expect(onlyNote().appProperties).toEqual({ bower: 'instruction' });
  });

  it('is rewritten as each file lands and as the text changes', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'uploading' });
    await store.attachToPile(pile.id, { name: 'b.pdf', state: 'uploading' });
    await store.attachToPile(pile.id, {
      name: 'a.pdf',
      state: 'done',
      fileId: 'FILE_A',
    });
    expect(onlyNote().text).toMatch(/## Applies to\n\n- a\.pdf\n$/);

    await store.setPileText(pile.id, 'Score them against my CV.');
    const note = onlyNote();
    expect(store.pileText(note.text)).toBe('Score them against my CV.');
    expect(note.text).not.toContain('b.pdf');
    expect(createTextFile).toHaveBeenCalledTimes(1);
  });

  it('coalesces changes made while a write is in flight', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    updateFileText.mockClear();
    const first = store.setPileText(pile.id, 'O');
    void store.setPileText(pile.id, 'Of');
    const last = store.setPileText(pile.id, 'Offers');
    await Promise.all([first, last]);
    expect(updateFileText).toHaveBeenCalledTimes(1);
    expect(store.pileText(onlyNote().text)).toBe('Offers');
  });

  it('keeps words written elsewhere unless typed here since (modifiedTime guard)', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    await store.setPileText(pile.id, 'Offers.');
    const note = onlyNote();
    note.text = note.text.replace('Offers.', 'Rental listings.');
    note.modifiedTime = tick();

    await store.attachToPile(pile.id, { name: 'b.pdf', state: 'done' });
    expect(store.pileText(onlyNote().text)).toBe('Rental listings.');
    expect(store.getPiles()[0]?.text).toBe('Rental listings.');
    expect(onlyNote().text).toContain('- a.pdf\n- b.pdf\n');
  });

  it('deletes the note when the pile is left with no items', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    const id = onlyNote().id;
    await store.removeFromPile(pile.id, 'a.pdf');
    expect(deleteFile).toHaveBeenCalledWith(id);
    expect(notesIn(INBOX)).toHaveLength(0);
    expect(store.getPiles()[0]?.noteFileId).toBeNull();
  });

  it('remembers a failed write and succeeds on the next', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    createTextFile.mockRejectedValueOnce(new Error('offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'uploading' });
    expect(store.pileWriteFailed(pile.id)).toBe(true);
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    expect(store.pileWriteFailed(pile.id)).toBe(false);
    expect(onlyNote().text).toContain('- a.pdf\n');
    error.mockRestore();
  });
});

describe('hand-off from the upload queue', () => {
  it('a pile file landing in the durable queue rewrites its note', async () => {
    const { followUploads, uploadPileId } = await import(
      '../src/add-queue-store.js'
    );
    const pile = store.startPile(INBOX, NOW, 'p1');
    expect(uploadPileId({ pileId: 'p1' })).toBe('p1');
    expect(uploadPileId({})).toBe('inbox');
    const base = {
      id: 'q1',
      parentId: INBOX,
      name: 'a.pdf',
      size: 10,
      sent: 0,
      durable: true,
    };
    let items: Upload[] = [
      { ...base, pileId: 'p1', state: 'uploading' as const },
      { ...base, id: 'q2', name: 'other.pdf', pileId: 'inbox', state: 'done' as const },
    ];
    const listeners = new Set<() => void>();
    const stop = followUploads({
      items: () => items,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    await store.pilesSettled();
    expect(onlyNote().text).toContain('pile: p1\n');

    land('a.pdf');
    items = [{ ...base, pileId: 'p1', state: 'done', fileId: 'FILE_a.pdf' }];
    for (const listener of listeners) listener();
    await store.pilesSettled();
    expect(onlyNote().text).toMatch(/## Applies to\n\n- a\.pdf\n$/);
    expect(store.getPiles()[0]?.items).toEqual([
      { name: 'a.pdf', state: 'done', fileId: 'FILE_a.pdf' },
    ]);
    stop();
    expect(store.getPiles()[0]?.id).toBe(pile.id);
  });
});

describe('R-PILE-9: rule sentences', () => {
  it('are kept once, when the pile closes, not on every save', async () => {
    const keepRule = vi.fn(() => Promise.resolve());
    const pile = store.startPile(INBOX, NOW, 'p1');
    land('a.pdf');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    await store.setPileText(pile.id, 'From now on file offers under Work.');
    await store.setPileText(pile.id, 'Offers. From now on file offers under Work.');
    expect(keepRule).not.toHaveBeenCalled();

    expect(await store.closePile(pile.id, keepRule)).toBe(true);
    expect(await store.closePile(pile.id, keepRule)).toBe(true);
    expect(keepRule).toHaveBeenCalledTimes(1);
    expect(keepRule).toHaveBeenCalledWith('From now on file offers under Work.');
    expect(store.openPile()).toBeUndefined();
  });
});

describe('R-PILE-7: flushPiles', () => {
  it('closes every open pile and writes each final Applies to, awaited', async () => {
    const first = store.startPile(INBOX, NOW, 'p1');
    land('a.pdf');
    await store.attachToPile(first.id, { name: 'a.pdf', state: 'done' });
    await store.closePile(first.id);
    const second = store.startPile(INBOX, NOW, 'p2');
    await store.attachToPile(second.id, { name: 'b.pdf', state: 'uploading' });
    land('b.pdf');
    void store.attachToPile(second.id, { name: 'b.pdf', state: 'done' });

    expect(await store.flushPiles()).toBe(true);
    const notes = notesIn(INBOX);
    expect(notes).toHaveLength(2);
    const byPile = (id: string): string =>
      notes.find((n) => n.text.includes(`pile: ${id}\n`))?.text ?? '';
    expect(byPile('p1')).toMatch(/## Applies to\n\n- a\.pdf\n$/);
    expect(byPile('p2')).toMatch(/## Applies to\n\n- b\.pdf\n$/);
    expect(store.getPiles().every((p) => p.closed)).toBe(true);
  });

  it('resolves false when a note cannot be written', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    land('a.pdf');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    updateFileText.mockRejectedValueOnce(new Error('offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await store.flushPiles()).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('R-PILE-8: a note moved out of the inbox', () => {
  it('starts a continuation note with the same pile id', async () => {
    const pile = store.startPile(INBOX, NOW, 'p1');
    const a = land('a.pdf');
    await store.attachToPile(pile.id, { name: 'a.pdf', state: 'done' });
    await store.setPileText(pile.id, 'Offers.');
    await store.attachToPile(pile.id, { name: 'b.pdf', state: 'uploading' });
    // A tidy-up files a.pdf and moves the note to Processed/, keeping its id.
    const moved = onlyNote();
    moved.parent = 'PROCESSED_ID';
    a.parent = 'RESOURCES_ID';
    updateFileText.mockClear();

    land('b.pdf');
    await store.attachToPile(pile.id, { name: 'b.pdf', state: 'done' });

    expect(updateFileText).not.toHaveBeenCalled();
    expect(moved.text).not.toContain('b.pdf');
    const next = onlyNote();
    expect(next.id).not.toBe(moved.id);
    expect(next.text).toContain('pile: p1\n');
    expect(next.text).toContain('Offers.');
    expect(next.text).toMatch(/## Applies to\n\n- b\.pdf\n$/);
    expect(next.appProperties).toEqual({ bower: 'instruction' });
    expect(store.getPiles()[0]?.noteFileId).toBe(next.id);
    expect(store.getPiles()[0]?.items.map((i) => i.name)).toEqual(['b.pdf']);
  });
});
