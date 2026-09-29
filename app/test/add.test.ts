// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Run, Vault } from '../src/api.js';
import {
  contextNote,
  contextNoteName,
  linkDisplayTitle,
  linkNoteName,
  linkTitleFromFileName,
} from '../src/add.js';
import { getQueue, setQueue } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';
import { HELP_ROWS } from '../src/help-rows.js';

describe('contextNote (#335)', () => {
  const now = new Date(Date.UTC(2026, 8, 28, 9, 5));

  it('names the note Bower - <date> <time> Context.md', () => {
    const local = new Date(2026, 8, 28, 9, 5);
    expect(contextNoteName(local)).toBe('Bower - 2026-09-28 0905 Context.md');
  });

  it('writes the instruction frontmatter, the text and the files', () => {
    expect(
      contextNote(
        '  Job offers: pull out salary and deadline.  ',
        ['Offer A.pdf', 'Offer B.pdf'],
        now,
      ),
    ).toBe(
      [
        '---',
        'tags: [instruction]',
        'date: 2026-09-28T09:05:00.000Z',
        'via: app',
        'kind: context',
        '---',
        '',
        'Job offers: pull out salary and deadline.',
        '',
        '## Applies to',
        '',
        '- Offer A.pdf',
        '- Offer B.pdf',
        '',
      ].join('\n'),
    );
  });

  it('keeps one bullet per file even with a line break in a name', () => {
    expect(contextNote('File these.', ['a\nb.pdf'], now)).toContain(
      '\n- a b.pdf\n',
    );
  });
});

describe('linkNoteName', () => {
  it('names the note after the host and the given date and time', () => {
    const now = new Date(2026, 8, 27, 9, 5); // 2026-09-27 09:05 local
    expect(linkNoteName('https://example.com/page', now)).toBe(
      'Link - example.com 2026-09-27 0905.md',
    );
  });

  it('drops a leading www. from the host', () => {
    const now = new Date(2026, 0, 1, 0, 0);
    expect(linkNoteName('https://www.example.com', now)).toBe(
      'Link - example.com 2026-01-01 0000.md',
    );
  });

  it('pads the month, day, hour and minute', () => {
    const now = new Date(2026, 0, 5, 3, 7);
    expect(linkNoteName('http://example.com', now)).toBe(
      'Link - example.com 2026-01-05 0307.md',
    );
  });

  it('accepts http as well as https', () => {
    const now = new Date(2026, 8, 27, 12, 0);
    expect(linkNoteName('http://example.com', now)).toBe(
      'Link - example.com 2026-09-27 1200.md',
    );
  });

  it('keeps a subdomain that is not www', () => {
    const now = new Date(2026, 8, 27, 12, 0);
    expect(linkNoteName('https://news.example.com/x', now)).toBe(
      'Link - news.example.com 2026-09-27 1200.md',
    );
  });

  it('rejects an empty string', () => {
    expect(linkNoteName('', new Date())).toBeNull();
  });

  it('rejects a string that is not a URL at all', () => {
    expect(linkNoteName('not a link', new Date())).toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(linkNoteName('mailto:you@example.com', new Date())).toBeNull();
    expect(linkNoteName('javascript:alert(1)', new Date())).toBeNull();
    expect(linkNoteName('ftp://example.com/file', new Date())).toBeNull();
  });
});

describe('linkDisplayTitle (#508)', () => {
  it('reads the host and path, not the saved file name', () => {
    expect(linkDisplayTitle('https://example.com/page')).toBe(
      'example.com/page',
    );
  });

  it('drops a leading www. from the host', () => {
    expect(linkDisplayTitle('https://www.example.com/x')).toBe('example.com/x');
  });

  it('leaves off a bare "/" path', () => {
    expect(linkDisplayTitle('https://example.com')).toBe('example.com');
    expect(linkDisplayTitle('https://example.com/')).toBe('example.com');
  });

  it('keeps a deeper path and a subdomain', () => {
    expect(linkDisplayTitle('https://news.example.com/x/y')).toBe(
      'news.example.com/x/y',
    );
  });

  it('falls back to the raw string for anything it cannot parse', () => {
    expect(linkDisplayTitle('not a link')).toBe('not a link');
  });
});

describe('linkTitleFromFileName (#557)', () => {
  it("reads the host back out of linkNoteName's own generated name", () => {
    expect(linkTitleFromFileName('Link - example.org 2026-09-28 1414.md')).toBe(
      'example.org',
    );
  });

  it('is null for any other file name', () => {
    expect(linkTitleFromFileName('Lease agreement 2026.pdf')).toBeNull();
    expect(linkTitleFromFileName('Link - not quite right.md')).toBeNull();
  });
});

// #208: Add only ever fills the inbox. Uploading resolves without starting
// a run: the only way to start one from Add is the Tidy up button.
const tidyUp = vi.fn();
const startRun = vi.fn(() => Promise.resolve());
const fakeFile: DriveFile = {
  id: 'FILE_ID',
  name: 'a.txt',
  mimeType: 'text/plain',
  parents: ['FOLDER_ID'],
  path: 'a.txt',
};

const location = { path: '/add', route: vi.fn() };

// The inbox folder as Drive holds it: the pile notes the app wrote, and the
// text of notes an earlier visit left (read back by `getText`).
let notes: DriveFile[] = [];
const noteTexts = new Map<string, string>();
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve(notes),
);
const upload = vi.fn<
  (
    parentId: string,
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));
let noteCount = 0;
const createTextFile = vi.fn<
  (
    parentId: string,
    name: string,
    content: string,
    options?: unknown,
  ) => Promise<DriveFile>
>((parentId, name, content) => {
  noteCount += 1;
  const note: DriveFile = {
    id: `NOTE_${noteCount}`,
    name,
    mimeType: 'text/markdown',
    parents: [parentId],
    modifiedTime: `2026-09-30T10:00:0${noteCount}.000Z`,
    path: `0-Inbox/${name}`,
  };
  notes = [...notes, note];
  noteTexts.set(note.id, content);
  return Promise.resolve(note);
});
const updateFileText = vi.fn<(id: string, text: string) => Promise<DriveFile>>(
  (id, text) => {
    noteTexts.set(id, text);
    const note = notes.find((n) => n.id === id);
    if (note === undefined) return Promise.reject(new Error('not found'));
    return Promise.resolve(note);
  },
);
const deleteFile = vi.fn<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const getText = vi.fn<(id: string) => Promise<string>>((id) =>
  Promise.resolve(noteTexts.get(id) ?? ''),
);

const vault: Vault = {
  folderId: 'FOLDER_ID',
  inboxFolderId: 'FOLDER_ID',
  name: 'Bower',
};
const me: Me = {
  email: 'you@example.com',
  vault,
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

vi.mock('preact-iso', () => ({ useLocation: () => location }));
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));
vi.mock('../src/online.js', () => ({
  useOnline: () => true,
  offlineReason: () => '',
}));
vi.mock('../src/components/upload-chip.js', () => ({
  UploadNotes: () => null,
  useUploadItems: () => [],
}));
// Add sends files through the durable queue (#768); these tests are about
// Add, so the queue hands each file straight to the `upload` mock.
vi.mock('../src/upload-queue.js', () => ({
  startUploads: () => Promise.resolve('owner'),
  activeItems: () => [],
  uploadQueue: () => ({
    items: () => [],
    subscribe: () => () => undefined,
    retry: () => undefined,
  }),
  uploadThroughQueue: (
    _queue: unknown,
    input: { blob: Blob; name: string; parentId: string },
    onProgress?: (sent: number, total: number) => void,
  ) => upload(input.parentId, new File([input.blob], input.name), onProgress),
}));
vi.mock('../src/drive.js', () => ({
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  INSTRUCTION_APP_PROPERTIES: { bower: 'instruction' },
  listFolder,
  upload,
  createTextFile,
  updateFileText,
  deleteFile,
  getText,
}));
// The last run this session saw finish (#493): `null` unless a test sets it.
let lastFinished: Run | null = null;
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({
    phase: 'idle',
    tidyUp,
    process: startRun,
    openSheet: vi.fn(),
    lastFinished,
  }),
}));
// The raw file list the count reads: three things waiting in the inbox
// unless a test changes it before rendering.
function inboxFile(name: string): DriveFile {
  return {
    id: `ID_${name}`,
    name,
    mimeType: 'application/pdf',
    parents: ['FOLDER_ID'],
    path: `0-Inbox/${name}`,
  };
}
const THREE_WAITING = [
  inboxFile('a.pdf'),
  inboxFile('b.pdf'),
  inboxFile('c.pdf'),
];
let vaultFiles: DriveFile[] = THREE_WAITING;
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: vaultFiles, refresh: vi.fn() }),
}));

const { Add, resetAddDraft } = await import('../src/routes/add.js');
const { getPiles, resetPiles } = await import('../src/pile-store.js');

let root: HTMLElement;

function dropFiles(files: File[]): void {
  const zone = root.querySelector('.add-screen');
  if (zone === null) throw new Error('Add screen missing');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  void act(() => {
    zone.dispatchEvent(event);
  });
}

/** The one Tidy up button at the foot of the screen (R-ADD-0). */
function tidyButton(): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>('.add-tidy-button');
  if (button === null) throw new Error('Tidy up button missing');
  return button;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Flushes until `predicate` is true, or fails after `tries` rounds. */
async function waitFor(predicate: () => boolean, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    if (predicate()) return;
    await flush();
  }
  if (!predicate()) throw new Error('waitFor: condition never became true');
}

function mount(): void {
  void act(() => {
    render(h(Add, {}), root);
  });
}

function unmount(): void {
  void act(() => {
    render(null, root);
  });
}

function buttonNamed(text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  if (button === undefined) throw new Error(`Button "${text}" missing`);
  return button;
}

function typeNote(value: string): HTMLTextAreaElement {
  const box = root.querySelector<HTMLTextAreaElement>('#add-context');
  if (box === null) throw new Error('note box missing');
  void act(() => {
    box.value = value;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return box;
}

function rowNames(): string[] {
  return Array.from(root.querySelectorAll('.pile-row-name')).map(
    (el) => el.textContent ?? '',
  );
}

function pileNoteFor(name: string): DriveFile {
  return {
    id: 'OLD_NOTE',
    name,
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    modifiedTime: '2026-09-29T09:00:00.000Z',
    path: `0-Inbox/${name}`,
  };
}

const OLD_PILE_NOTE = [
  '---',
  'tags: [instruction]',
  'date: 2026-09-29T09:00:00.000Z',
  'via: app',
  'kind: context',
  'pile: PILE_1',
  '---',
  '',
  'Five job offers. Score each against my CV.',
  '',
  '## Applies to',
  '',
  '- Offer A.pdf',
  '- Offer B.pdf',
  '',
].join('\n');

describe('Add', () => {
  beforeEach(() => {
    // The queue and the piles live in modules of their own, on purpose (they
    // survive navigating away and back): each test starts them empty.
    setQueue([]);
    resetPiles();
    resetAddDraft();
    lastFinished = null;
    vaultFiles = THREE_WAITING;
    notes = [];
    noteTexts.clear();
    noteCount = 0;
    root = document.createElement('div');
    document.body.append(root);
    mount();
  });

  afterEach(() => {
    unmount();
    root.remove();
    vi.clearAllMocks();
    upload.mockImplementation(() => Promise.resolve(fakeFile));
  });

  it('never mentions the removed "Tidy up right after adding" switch', () => {
    expect(root.textContent).not.toContain('Tidy up right after adding');
  });

  // R-ADD-0 (D33): the count in the one filled button; no hint, no other
  // filled button.
  it('carries the inbox count in the one Tidy up button, with no hint', () => {
    expect(tidyButton().textContent).toBe('Tidy up 3 things');
    expect(root.querySelector('.add-hint')).toBeNull();
    expect(root.querySelectorAll('.process-button')).toHaveLength(1);
    expect(root.textContent).not.toContain('Done with this pile');
  });

  it('counts what the inbox listing holds, the same number as Home (R-ADD-2)', () => {
    vaultFiles = [
      ...THREE_WAITING,
      inboxFile('Bower - 2026-09-30 1000-00 Context ab.md'),
    ];
    unmount();
    mount();
    expect(tidyButton().textContent).toBe('Tidy up 3 things');
  });

  it('says "thing" for one', () => {
    vaultFiles = [inboxFile('one.pdf')];
    unmount();
    mount();
    expect(tidyButton().textContent).toBe('Tidy up 1 thing');
  });

  it('hides the button when the inbox is empty (#336)', () => {
    vaultFiles = [];
    unmount();
    mount();
    expect(root.querySelector('.add-tidy')).toBeNull();
    expect(root.querySelector('.process-button')).toBeNull();
  });

  it('goes straight to the confirmation, uploading nothing', () => {
    void act(() => tidyButton().click());
    expect(upload).not.toHaveBeenCalled();
    expect(tidyUp).toHaveBeenCalledTimes(1);
    expect(startRun).not.toHaveBeenCalled();
  });

  it('says how many are still uploading under the button', async () => {
    upload.mockImplementation(() => new Promise<DriveFile>(() => undefined));
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await flush();
    expect(root.querySelector('.add-tidy-note')?.textContent).toBe(
      '1 still uploading will wait for the next tidy-up',
    );
    expect(root.textContent).toContain(
      '1 thing · 0 in your inbox, 1 uploading',
    );
  });

  // R-ADD-1: no "Waiting" state; every attached file starts uploading.
  it('starts uploading a dropped file at once, with no Waiting state', async () => {
    dropFiles([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);
    await waitFor(() => upload.mock.calls.length === 2);
    expect(rowNames()).toEqual(['a.txt', 'b.txt']);
    expect(root.querySelector('.add-queue-card-waiting')).toBeNull();
  });

  it('lists the doors as one row: Files, Drive when it shows, and Link', () => {
    const doors = Array.from(
      root.querySelectorAll('.add-doors > button.add-door'),
    );
    expect(doors.map((d) => d.textContent)).toEqual(
      expect.arrayContaining(['Files', 'Link']),
    );
  });

  it('opens the file input when the Choose files door is pressed', () => {
    const doors = root.querySelector('.add-doors');
    const door = Array.from(doors?.querySelectorAll('button') ?? []).find(
      (b) => b.getAttribute('aria-label') === 'Choose files',
    );
    if (door === undefined) throw new Error('Choose files door missing');
    const input = root.querySelector('input[type="file"]:not([capture])');
    const click = vi.spyOn(input as HTMLInputElement, 'click');
    door.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('says on the desktop that files dropped anywhere join the pile (PILE-14)', () => {
    expect(root.querySelector('.add-drop-line')?.textContent).toBe(
      'Drop files anywhere on this page: they join the pile you are making.',
    );
  });

  it('moves the share line to the Add help sheet (R-ADD-1)', () => {
    expect(root.textContent).not.toContain('share to Bower from any app');
    const rows = HELP_ROWS.add.rows.map((r) => `${r.lead} ${r.text}`);
    expect(rows).toContain('Share from any app to Bower: it lands here too.');
  });

  // R-ADD-4: every row has its badge; a kind Bower only keeps shows its line.
  it('shows a badge on every row and the kept-not-read line on a video', async () => {
    dropFiles([
      new File(['a'], 'Lease.pdf', { type: 'application/pdf' }),
      new File(['b'], 'IMG_1.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'Walk-through.mp4', { type: 'video/mp4' }),
    ]);
    await waitFor(() => upload.mock.calls.length === 3);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 3);
    const rows = Array.from(root.querySelectorAll('.pile-row'));
    expect(
      rows.map((r) => r.querySelector('.kind-badge')?.textContent),
    ).toEqual(['PDF', 'JPG', 'MP4']);
    expect(rows[0]?.querySelector('.pile-row-ok')?.textContent).not.toContain(
      'Kept, not read',
    );
    expect(rows[2]?.querySelector('.pile-row-ok')?.textContent).toContain(
      "Kept, not read: Bower can't watch videos",
    );
  });

  // R-PILE-1: the note is in the inbox from the first file.
  it('writes the pile note to the inbox with the first file, before anything is typed', async () => {
    dropFiles([new File(['a'], 'Offer A.pdf', { type: 'application/pdf' })]);
    await waitFor(() => createTextFile.mock.calls.length === 1);
    const [parent, name, content, options] = createTextFile.mock.calls[0] as [
      string,
      string,
      string,
      unknown,
    ];
    expect(parent).toBe('FOLDER_ID');
    expect(name).toMatch(
      /^Bower - \d{4}-\d{2}-\d{2} \d{4}-\d{2} Context [0-9a-f]{2}\.md$/,
    );
    expect(content).toContain('kind: context');
    expect(content).toMatch(/\npile: \S+\n/);
    expect(options).toEqual({ appProperties: { bower: 'instruction' } });
  });

  it('saves "What is this pile?" into the note as typed, and says so', async () => {
    dropFiles([new File(['a'], 'Offer A.pdf', { type: 'application/pdf' })]);
    await waitFor(() => createTextFile.mock.calls.length === 1);
    const box = typeNote('Job offers: pull out salary and deadline.');
    expect(root.textContent).toContain(
      'Saved in your inbox as you type. Bower reads it with these files only.',
    );
    void act(() => {
      box.focus();
      box.blur();
    });
    await waitFor(() =>
      updateFileText.mock.calls.some(([, text]) =>
        text.includes('Job offers: pull out salary and deadline.'),
      ),
    );
  });

  it('holds text typed before the first file and puts it in the note', async () => {
    typeNote('Flats for November.');
    dropFiles([new File(['a'], 'Flat.pdf', { type: 'application/pdf' })]);
    await waitFor(() => createTextFile.mock.calls.length === 1);
    expect(createTextFile.mock.calls[0]?.[2]).toContain('Flats for November.');
  });

  // R-ADD-0: "Start another pile" is a text button, not a filled one.
  it('"Start another pile" closes the pile and waits it under the tidy-up', async () => {
    vaultFiles = [...THREE_WAITING, inboxFile('one.txt')];
    unmount();
    mount();
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    typeNote('Receipts for the tax return.');

    const another = buttonNamed('Start another pile');
    expect(another.classList.contains('process-button')).toBe(false);
    expect(root.textContent).toContain('This pile is saved as you go.');
    void act(() => another.click());
    await waitFor(() => getPiles()[0]?.closed === true);

    expect(root.querySelector<HTMLTextAreaElement>('#add-context')?.value).toBe(
      '',
    );
    expect(root.textContent).toContain('Waiting for the tidy-up');
    const card = root.querySelector('.pile-card-waiting');
    expect(card?.textContent).toContain('Receipts for the tax return.');
    expect(card?.textContent).toContain('1 thing');
    expect(root.querySelectorAll('.process-button')).toHaveLength(1);
  });

  it('shows "No note" on a waiting pile with no words', async () => {
    vaultFiles = [...THREE_WAITING, inboxFile('one.txt')];
    unmount();
    mount();
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    void act(() => buttonNamed('Start another pile').click());
    await waitFor(() => root.querySelector('.pile-card-none') !== null);
    expect(root.querySelector('.pile-card-none')?.textContent).toBe('No note');
  });

  // R-PILE-2: leaving Add closes the open pile.
  it('leaving Add closes the open pile', async () => {
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    expect(getPiles()[0]?.closed).toBe(false);
    unmount();
    await waitFor(() => getPiles()[0]?.closed === true);
  });

  it('a second pile starts once the first is closed (several piles wait)', async () => {
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    void act(() => buttonNamed('Start another pile').click());
    await waitFor(() => getPiles()[0]?.closed === true);
    dropFiles([new File(['b'], 'two.txt', { type: 'text/plain' })]);
    await waitFor(() => getPiles().length === 2);
    expect(getPiles().map((pile) => pile.closed)).toEqual([true, false]);
  });

  // R-PILE-3: the waiting piles come from the inbox listing.
  it('lists the piles an earlier visit left, with their notes, from the inbox listing', async () => {
    const note = pileNoteFor('Bower - 2026-09-29 0900-00 Context ab.md');
    noteTexts.set(note.id, OLD_PILE_NOTE);
    notes = [note];
    vaultFiles = [inboxFile('Offer A.pdf'), inboxFile('Offer B.pdf'), note];
    unmount();
    mount();
    await waitFor(() => root.querySelector('.pile-card-waiting') !== null);
    const card = root.querySelector('.pile-card-waiting');
    expect(card?.textContent).toContain(
      'Five job offers. Score each against my CV.',
    );
    expect(card?.textContent).toContain('2 things');
    expect(root.textContent).not.toContain('Added from elsewhere');
    expect(tidyButton().textContent).toBe('Tidy up 2 things');
  });

  // R-PILE-4: files named in no pile.
  it('lists inbox files named in no pile, and "Say what they are" opens a pile with them', async () => {
    vaultFiles = [inboxFile('x.pdf'), inboxFile('y.pdf')];
    unmount();
    mount();
    await waitFor(() => root.querySelector('.pile-elsewhere') !== null);
    expect(root.querySelector('.pile-elsewhere')?.textContent).toContain(
      'Added from elsewhere',
    );
    expect(root.querySelector('.pile-elsewhere')?.textContent).toContain(
      '2 things',
    );

    void act(() => buttonNamed('Say what they are').click());
    await waitFor(() => getPiles().length === 1);
    await waitFor(() =>
      updateFileText.mock.calls.some(
        ([, text]) => text.includes('- x.pdf') && text.includes('- y.pdf'),
      ),
    );
    expect(rowNames()).toEqual(['x.pdf', 'y.pdf']);
    expect(root.querySelector('.pile-elsewhere')).toBeNull();
  });

  it('does not list a file a pile names as "from elsewhere"', async () => {
    const note = pileNoteFor('Bower - 2026-09-29 0900-00 Context ab.md');
    noteTexts.set(note.id, OLD_PILE_NOTE);
    notes = [note];
    vaultFiles = [
      inboxFile('Offer A.pdf'),
      inboxFile('Offer B.pdf'),
      inboxFile('Loose.pdf'),
      note,
    ];
    unmount();
    mount();
    await waitFor(() => root.querySelector('.pile-elsewhere') !== null);
    expect(root.querySelector('.pile-elsewhere')?.textContent).toContain(
      '1 thing',
    );
  });

  it('removes a file from the pile and sends it to the Bin in Drive', async () => {
    vaultFiles = [...THREE_WAITING, inboxFile('one.txt')];
    unmount();
    mount();
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    const remove = root.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove one.txt from this pile"]',
    );
    if (remove === null) throw new Error('remove button missing');
    void act(() => remove.click());
    await waitFor(() => deleteFile.mock.calls.length >= 1);
    expect(deleteFile).toHaveBeenCalledWith('ID_one.txt');
    await waitFor(() => rowNames().length === 0);
  });

  // Links.
  function saveLink(url: string): HTMLInputElement {
    const door = root.querySelector<HTMLButtonElement>(
      '.add-doors button[aria-label="Paste a link"]',
    );
    if (door === null) throw new Error('Link door missing');
    void act(() => door.click());
    const input = root.querySelector('#add-link') as HTMLInputElement;
    void act(() => {
      input.value = url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    void act(() => buttonNamed('Save').click());
    return input;
  }

  it('the Link door opens an inline field with Save', () => {
    expect(root.querySelector('#add-link')).toBeNull();
    const door = root.querySelector<HTMLButtonElement>(
      '.add-doors button[aria-label="Paste a link"]',
    );
    void act(() => door?.click());
    expect(root.querySelector('#add-link')).not.toBeNull();
  });

  it('clears the field and greys out Save again, so a second press cannot resave it (#493)', () => {
    const input = saveLink('https://example.com/page');
    expect(input.value).toBe('');
    expect(buttonNamed('Save').hasAttribute('disabled')).toBe(true);
  });

  it("a saved link's row shows the address, not the note's file name (#508)", async () => {
    saveLink('https://www.example.com/a/page');
    await flush();
    expect(rowNames()).toEqual(['example.com/a/page']);
  });

  it('saving a link stays on Add and joins the pile', async () => {
    saveLink('https://example.com/page');
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    expect(location.route).not.toHaveBeenCalled();
    expect(getPiles()).toHaveLength(1);
  });

  it('drops the filed rows once a tidy-up finishes (#493)', async () => {
    dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
    await waitFor(() => root.querySelectorAll('.pile-row-ok').length === 1);
    vaultFiles = [];
    lastFinished = { state: 'done', requestedAt: '2026-09-28T09:05:00.000Z' };
    mount();
    await flush();
    expect(getQueue()).toHaveLength(0);
    expect(root.querySelector('.add-tidy')).toBeNull();
  });
});
