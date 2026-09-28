// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Vault } from '../src/api.js';
import {
  addHintLead,
  contextNote,
  contextNoteName,
  linkNoteName,
} from '../src/add.js';
import { setQueue } from '../src/add-queue-store.js';
import type { DriveFile } from '../src/drive.js';

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
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({
    phase: 'idle',
    tidyUp,
    process: startRun,
    openSheet: vi.fn(),
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

  // #336: the hint, copy word for word from the Phone-Add board.
  it('shows the hint with the inbox count and the board copy', () => {
    const hint = root.querySelector('.add-hint');
    expect(hint?.querySelector('b')?.textContent).toBe('3 things waiting.');
    expect(hint?.textContent).toContain(
      'Add the whole pile first: a tidy-up takes a few minutes and uses one run of your plan, so once is better than five times.',
    );
  });

  // #333: the phone doors, the drop zone (both in the DOM; `add.css`'s
  // breakpoint picks which one shows), and the line about sharing in from
  // another app.
  it('lists Choose files as a door, with its hint', () => {
    const doors = root.querySelector('.add-doors');
    expect(doors?.textContent).toContain('Choose files');
    expect(doors?.textContent).toContain(
      'Photos, PDFs, screenshots, voice memos',
    );
  });

  it('opens the file input when the Choose files door is pressed', () => {
    const doors = root.querySelector('.add-doors');
    const door = Array.from(doors?.querySelectorAll('button') ?? []).find((b) =>
      (b.textContent ?? '').startsWith('Choose files'),
    );
    if (door === undefined) throw new Error('Choose files door missing');
    const input = root.querySelector('input[type="file"]:not([capture])');
    const click = vi.spyOn(input as HTMLInputElement, 'click');
    door.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('keeps the drop zone in the DOM, sized by its own content', () => {
    const dropzone = root.querySelector('.add-dropzone');
    expect(dropzone?.textContent).toContain('Drop anything here');
    expect(dropzone?.textContent).toContain(
      'Photos, PDFs, screenshots, links.',
    );
  });

  it('mentions sharing in from another app', () => {
    expect(root.textContent).toContain(
      'Or share to Bower from any app: it lands here too.',
    );
  });

  it('has no submit button until something is queued (#333)', () => {
    expect(
      Array.from(root.querySelectorAll('button')).some((b) =>
        (b.textContent ?? '').includes('Add to Bower'),
      ),
    ).toBe(false);
  });

  it('uploading files resolves without starting a run', async () => {
    dropFiles([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
      new File(['c'], 'c.txt', { type: 'text/plain' }),
    ]);
    await flush();

    const addButton = Array.from(root.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add to Bower'),
    );
    if (addButton === undefined) {
      throw new Error('Add to Bower button missing');
    }
    void act(() => addButton.click());
    // Every upload resolves and the button goes back to its idle label —
    // the whole batch settled with nothing throwing and no run started.
    await waitFor(() => (addButton.textContent ?? '') === 'Add to Bower');

    expect(upload).toHaveBeenCalledTimes(3);
    expect(tidyUp).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it('carries the Tidy up button in the hint, which asks the run store (#320)', () => {
    const button = root.querySelector<HTMLButtonElement>(
      '.add-hint .process-button',
    );
    expect(button?.textContent).toBe('Tidy up');
    void act(() => button?.click());
    expect(tidyUp).toHaveBeenCalledTimes(1);
  });

  it('hides the hint when the inbox is empty (#336)', () => {
    vaultFiles = [];
    try {
      void act(() => {
        render(null, root);
      });
      void act(() => {
        render(h(Add, {}), root);
      });
      expect(root.querySelector('.add-hint')).toBeNull();
      expect(root.querySelector('.process-button')).toBeNull();
    } finally {
      vaultFiles = THREE_WAITING;
    }
  });

  // #334 (issue 21.2): the queue's own heading, its type icon, and the
  // per-row state text.
  it('heads the queue "Added · n" and shows the picked name', () => {
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    const head = root.querySelector('.add-queue-head');
    expect(head?.textContent).toBe('Added · 1');
    expect(root.querySelector('.add-queue-name')?.textContent).toBe(
      'receipt.txt',
    );
  });

  it('says "In your inbox" once a plain upload is done', async () => {
    dropFiles([new File(['a'], 'receipt.txt', { type: 'text/plain' })]);
    await flush();
    const addButton = Array.from(root.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add to Bower'),
    );
    if (addButton === undefined) throw new Error('Add to Bower missing');
    void act(() => addButton.click());
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
    const addButton = Array.from(root.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add to Bower'),
    );
    if (addButton === undefined) throw new Error('Add to Bower missing');
    void act(() => addButton.click());
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
    expect(box?.placeholder).toBe(
      'Just filing is fine. Or tell Bower what to do with these: "Job offers: pull out salary, location and deadline, and add them to a table". Say "from now on" and it becomes a rule.',
    );
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

  it('keeps the pasted link in the field after Save, so it never greys out', () => {
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
    expect(input.value).toBe('https://example.com/page');
    expect(save.hasAttribute('disabled')).toBe(false);
  });
});
