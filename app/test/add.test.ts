// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Run, Vault } from '../src/api.js';
import {
  addHintLead,
  CONTEXT_PLACEHOLDER,
  contextNote,
  contextNoteName,
  linkDisplayTitle,
  linkNoteName,
  linkTitleFromFileName,
} from '../src/add.js';
import { setQueue } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';
import { HELP_ROWS } from '../src/help-rows.js';

describe('addHintLead', () => {
  it('counts the things waiting, singular for one', () => {
    expect(addHintLead(1)).toBe('1 thing waiting.');
    expect(addHintLead(3)).toBe('3 things waiting.');
  });
});

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

describe('CONTEXT_PLACEHOLDER (#508)', () => {
  it('gives one example, not two', () => {
    // The board's own copy named a second example ("from now on" becoming
    // a rule) that pushed the text to four lines in the three-line box at
    // 375 px; shortened to one, agreed with the lead in the PR.
    expect(CONTEXT_PLACEHOLDER.match(/"/g)).toHaveLength(2);
  });

  it('stays short enough to fit three lines at 375 px', () => {
    // A rough proxy for the real, visual check (`docs`/PR screenshot):
    // this box wraps at roughly 30 characters a line on the phone, so
    // three lines is around 90 characters including the quoted example.
    expect(CONTEXT_PLACEHOLDER.length).toBeLessThanOrEqual(90);
  });
});

// #208: Add only ever fills the inbox. Uploading resolves without starting
// a run — there is no `autoProcessOnAdd` left to call `process()` for. The
// only way to start one from Add is the Tidy up button in the hint (#320).
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
const listFolder = vi.fn<(folderId: string) => Promise<DriveFile[]>>(() =>
  Promise.resolve([]),
);
const upload = vi.fn<
  (
    parentId: string,
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));
const createTextFile = vi.fn<
  (
    parentId: string,
    name: string,
    content: string,
    options?: unknown,
  ) => Promise<DriveFile>
>(() => Promise.resolve(fakeFile));

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
vi.mock('../src/drive.js', () => ({
  FOLDER_MIME: 'application/vnd.google-apps.folder',
  INSTRUCTION_APP_PROPERTIES: { bower: 'instruction' },
  listFolder,
  upload,
  createTextFile,
}));
// #289 added a `useVault()` call to Add (the refresh after a batch's
// worth of uploads). Mocked the same way sibling suites do
// (`layout.test.ts`, `settings-demo.test.ts`): no real VaultProvider
// needed for a plain UI check.
// The last run this session saw finish (#493): `null` unless a test sets
// it, so `useRun().lastFinished` behaves like the real store's initial
// state.
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
// The raw file list the hint counts (#336): three things waiting in the
// inbox unless a test empties it before rendering.
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

const { Add } = await import('../src/routes/add.js');
const { resetContext } = await import('../src/add-context.js');

let root: HTMLElement;

function dropFiles(files: File[]): void {
  const zone = root.querySelector('.add-dropzone');
  if (zone === null) throw new Error('dropzone missing');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  void act(() => {
    zone.dispatchEvent(event);
  });
}

/** The one Tidy up button at the foot of the screen (R-ADD-5). */
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

describe('Add', () => {
  beforeEach(() => {
    // The queue lives in `add-queue-store.js`, module scope, on purpose
    // (#334: it survives navigating away and back) -- so each test starts
    // this suite's own instance of it empty rather than inheriting the
    // previous test's rows.
    setQueue([]);
    lastFinished = null;
    resetContext();
    root = document.createElement('div');
    document.body.append(root);
    void act(() => {
      render(h(Add, {}), root);
    });
  });

  afterEach(() => {
    void act(() => {
      render(null, root);
    });
    root.remove();
    vi.clearAllMocks();
  });

  it('never mentions the removed "Tidy up right after adding" switch', () => {
    expect(root.textContent).not.toContain('Tidy up right after adding');
  });

  // R-ADD-5: one button carrying the count, no separate hint.
  it('carries the inbox count in the one Tidy up button, with no hint', () => {
    expect(tidyButton().textContent).toBe('Tidy up 3 things');
    expect(root.querySelector('.add-hint')).toBeNull();
    expect(root.querySelectorAll('.process-button')).toHaveLength(1);
  });

  it('counts the files chosen but not yet uploaded, and says "thing" for one', () => {
    vaultFiles = [];
    try {
      void act(() => {
        render(null, root);
      });
      void act(() => {
        render(h(Add, {}), root);
      });
      dropFiles([new File(['a'], 'one.txt', { type: 'text/plain' })]);
      expect(tidyButton().textContent).toBe('Tidy up 1 thing');
    } finally {
      vaultFiles = THREE_WAITING;
    }
  });

  it('reads "Tidy up 5 things" with five items and opens the confirmation once they are in', async () => {
    vaultFiles = [];
    try {
      void act(() => {
        render(null, root);
      });
      void act(() => {
        render(h(Add, {}), root);
      });
      dropFiles(
        ['a', 'b', 'c', 'd', 'e'].map(
          (n) => new File([n], `${n}.txt`, { type: 'text/plain' }),
        ),
      );
      expect(tidyButton().textContent).toBe('Tidy up 5 things');
      void act(() => tidyButton().click());
      await waitFor(() => tidyUp.mock.calls.length === 1);
      expect(upload).toHaveBeenCalledTimes(5);
    } finally {
      vaultFiles = THREE_WAITING;
    }
  });

  // #333: the phone doors, the drop zone (both in the DOM; `add.css`'s
  // breakpoint picks which one shows), and the line about sharing in from
  // another app.
  it('lists the doors as one row: Files, then Drive when it shows (R-ADD-1)', () => {
    const doors = Array.from(
      root.querySelectorAll('.add-doors > button.add-door'),
    );
    expect(doors.map((d) => d.textContent)).toContain('Files');
    expect(root.querySelector('.add-doors')?.textContent).not.toContain(
      'voice memos',
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

  it('keeps the drop zone in the DOM, sized by its own content', () => {
    const dropzone = root.querySelector('.add-dropzone');
    expect(dropzone?.textContent).toContain('Drop files here');
    expect(dropzone?.textContent).toContain('Choose files');
  });

  it('moves the share line to the Add help sheet (R-ADD-1)', () => {
    expect(root.textContent).not.toContain('share to Bower from any app');
    const rows = HELP_ROWS.add.rows.map((r) => `${r.lead} ${r.text}`);
    expect(rows).toContain('Share from any app to Bower: it lands here too.');
  });

  it('has no Add to Bower button any more: the one Tidy up button does both', () => {
    dropFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]);
    expect(
      Array.from(root.querySelectorAll('button')).some((b) =>
        (b.textContent ?? '').includes('Add to Bower'),
      ),
    ).toBe(false);
  });

  it('uploads the waiting files, then opens the confirmation without starting a run', async () => {
    dropFiles([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['c'], 'c.txt', { type: 'text/plain' }),
    ]);
    await flush();
    expect(upload).not.toHaveBeenCalled();

    void act(() => tidyButton().click());
    await waitFor(() =>
      Array.from(root.querySelectorAll('.add-queue-status')).every(
        (el) => el.textContent === 'In your inbox',
      ),
    );
    await waitFor(() => tidyUp.mock.calls.length === 1);

    expect(upload).toHaveBeenCalledTimes(3);
    expect(startRun).not.toHaveBeenCalled();
  });

  it('with nothing waiting, the button goes straight to the confirmation', () => {
    void act(() => tidyButton().click());
    expect(upload).not.toHaveBeenCalled();
    expect(tidyUp).toHaveBeenCalledTimes(1);
  });

  it('hides the button when the inbox is empty and nothing is queued (#336)', () => {
    vaultFiles = [];
    try {
      void act(() => {
        render(null, root);
      });
      void act(() => {
        render(h(Add, {}), root);
      });
      expect(root.querySelector('.add-tidy')).toBeNull();
      expect(root.querySelector('.process-button')).toBeNull();
    } finally {
      vaultFiles = THREE_WAITING;
    }
  });

  // R-ADD-2 and R-ADD-4: every row has its badge; a kind Bower only keeps
  // shows its queue line.
  it('shows a badge on every row and the kept-not-read line on a video', () => {
    dropFiles([
      new File(['a'], 'Lease.pdf', { type: 'application/pdf' }),
      new File(['b'], 'IMG_1.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'Walk-through.mp4', { type: 'video/mp4' }),
    ]);
    const rows = Array.from(root.querySelectorAll('.add-queue-card'));
    expect(
      rows.map((r) => r.querySelector('.kind-badge')?.textContent),
    ).toEqual(['PDF', 'JPG', 'MP4']);
    expect(rows[0]?.querySelector('.add-queue-kept')).toBeNull();
    expect(rows[2]?.querySelector('.add-queue-kept')?.textContent).toBe(
      "Kept, not read: Bower can't watch videos",
    );
  });

  it('names the sources in the queue heading, for phone and desktop', () => {
    dropFiles([new File(['a'], 'a.pdf', { type: 'application/pdf' })]);
    const input = root.querySelector('#add-link') as HTMLInputElement;
    void act(() => {
      input.value = 'https://example.com/page';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    );
    void act(() => save?.click());
    expect(root.querySelector('.add-sources-phone')?.textContent).toBe(
      'Shared from Files, a link',
    );
    expect(root.querySelector('.add-sources-desktop')?.textContent).toBe(
      'From drop and a link',
    );
  });

  // #334 (issue 21.2): the queue's own heading, its type icon, and the
  // per-row state text.
  it('heads the queue "In your inbox · n" and shows the picked name', () => {
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    const head = root.querySelector('.add-queue-head');
    expect(head?.textContent).toBe('In your inbox · 1');
    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'receipt.txt',
    );
  });

  it('says "In your inbox" once a plain upload is done', async () => {
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    await flush();
    void act(() => tidyButton().click());
    await waitFor(
      () =>
        (root.querySelector('.add-queue-status')?.textContent ?? '') ===
        'In your inbox',
    );
  });

  it('survives leaving the screen and coming back (#334)', () => {
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'receipt.txt',
    );

    // Unmount, as `preact-iso` would on navigating away, then mount a
    // fresh `Add` the way it would coming back to the tab -- no `setQueue`
    // reset in between, unlike this suite's own `beforeEach`.
    void act(() => {
      render(null, root);
    });
    void act(() => {
      render(h(Add, {}), root);
    });

    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'receipt.txt',
    );
  });

  // #335: the "What is this?" box and the note it becomes.
  function typeContext(value: string): void {
    const box = root.querySelector<HTMLTextAreaElement>('#add-context');
    if (box === null) throw new Error('What is this? box missing');
    void act(() => {
      box.value = value;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  async function addOneFile(): Promise<void> {
    dropFiles([new File(['a'], 'Offer A.pdf', { type: 'application/pdf' })]);
    await flush();
    void act(() => tidyButton().click());
    await waitFor(
      () =>
        (root.querySelector('.add-queue-status')?.textContent ?? '') ===
        'In your inbox',
    );
  }

  function leaveAdd(): void {
    void act(() => {
      render(null, root);
    });
  }

  it('shows the optional What is this? box only under a queue (#335)', () => {
    expect(root.querySelector('#add-context')).toBeNull();
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    const box = root.querySelector<HTMLTextAreaElement>('#add-context');
    expect(box?.placeholder).toBe('Flats for November.');
    expect(root.querySelector('label[for="add-context"]')?.textContent).toBe(
      'What is this? optional',
    );
  });

  it('leaving Add with text and a batch writes one context note (#335)', async () => {
    await addOneFile();
    typeContext('Job offers: pull out salary and deadline.');
    createTextFile.mockClear();
    leaveAdd();
    await flush();

    expect(createTextFile).toHaveBeenCalledTimes(1);
    const [parent, name, content, options] = createTextFile.mock.calls[0] as [
      string,
      string,
      string,
      unknown,
    ];
    expect(parent).toBe('FOLDER_ID');
    expect(name).toMatch(/^Bower - \d{4}-\d{2}-\d{2} \d{4} Context\.md$/);
    expect(content).toContain('kind: context');
    expect(content).toContain('Job offers: pull out salary and deadline.');
    expect(content).toContain('- Offer A.pdf');
    expect(options).toEqual({ appProperties: { bower: 'instruction' } });

    // The box is cleared, and the same batch is never written twice.
    void act(() => {
      render(h(Add, {}), root);
    });
    expect(root.querySelector<HTMLTextAreaElement>('#add-context')?.value).toBe(
      '',
    );
    leaveAdd();
    await flush();
    expect(createTextFile).toHaveBeenCalledTimes(1);
  });

  it('leaving Add with an empty box writes nothing (#335)', async () => {
    await addOneFile();
    createTextFile.mockClear();
    leaveAdd();
    await flush();
    expect(createTextFile).not.toHaveBeenCalled();
  });

  it('clears the field and greys out Save again, so a second press cannot resave it (#493)', () => {
    const input = root.querySelector('#add-link') as HTMLInputElement;
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    );
    if (save === undefined) throw new Error('Save button missing');
    void act(() => {
      input.value = 'https://example.com/page';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(save.hasAttribute('disabled')).toBe(false);
    void act(() => save.click());
    expect(input.value).toBe('');
    expect(save.hasAttribute('disabled')).toBe(true);
  });

  it("a saved link's row shows the URL, not the note's file name (#508)", () => {
    const input = root.querySelector('#add-link') as HTMLInputElement;
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    );
    if (save === undefined) throw new Error('Save button missing');
    void act(() => {
      input.value = 'https://www.example.com/a/page';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    void act(() => save.click());
    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'example.com/a/page',
    );
  });

  // #421: Save used to navigate to Home once the link finished uploading,
  // and coming back to Add (the queue survives navigation, #334) then
  // showed a leftover "Add to Bower" button that did nothing but re-run
  // `finish()` and bounce back to Home again.
  it('saving a link stays on Add, with no upload left waiting', async () => {
    const input = root.querySelector('#add-link') as HTMLInputElement;
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    );
    if (save === undefined) throw new Error('Save button missing');
    void act(() => {
      input.value = 'https://example.com/page';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    void act(() => save.click());
    await waitFor(
      () =>
        root.querySelector('.add-queue-status')?.textContent ===
        'In your inbox',
    );

    expect(root.querySelector('.add-queue-head')?.textContent).toBe(
      'In your inbox · 1',
    );
    expect(root.querySelector('.add-queue-card-waiting')).toBeNull();
    expect(location.route).not.toHaveBeenCalled();
  });

  it('clears the filed rows and "Added to your inbox." once a tidy-up finishes (#493)', async () => {
    const input = root.querySelector('#add-link') as HTMLInputElement;
    const save = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    );
    if (save === undefined) throw new Error('Save button missing');
    void act(() => {
      input.value = 'https://example.com/page';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    void act(() => save.click());
    await waitFor(
      () =>
        root.querySelector('.add-queue-status')?.textContent ===
        'In your inbox',
    );
    expect(root.querySelector('.add-message')?.textContent).toBe(
      'Added to your inbox.',
    );

    // Home's Inbox card and the run store both say the run is over; the
    // effect only needs `lastFinished` to have moved to a new `done` run.
    lastFinished = { state: 'done', requestedAt: '2026-09-28T09:05:00.000Z' };
    void act(() => {
      render(h(Add, {}), root);
    });

    expect(root.querySelector('.add-queue-section')).toBeNull();
    expect(root.querySelector('.add-message')).toBeNull();
  });
});
