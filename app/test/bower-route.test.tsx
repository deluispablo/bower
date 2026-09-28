// @vitest-environment jsdom

/**
 * The Bower tab (#340): the box has no Rule/Task/Question selector, the
 * first time shows the tip open with three examples, Send writes a
 * `kind: request` instruction note without starting a run, and the sent
 * sentence shows under Requests as Waiting. Drive, the session and the
 * folder listing are mocked; nothing leaves the test.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me, Run } from '../src/api.js';
import type { CreateTextFileOptions, DriveFile } from '../src/drive.js';

const me: Me = {
  email: 'you@example.com',
  vault: { folderId: 'FOLDER_ID', inboxFolderId: 'INBOX_ID', name: 'Bower' },
  quota: { used: 0, limit: 10 },
  needsReauth: false,
  hasApiKey: false,
};

interface State {
  files: DriveFile[];
  fetchedAt: string | null;
  query: Record<string, string>;
  /** Note contents by id, for `getNoteText` and `openNoteForEdit`. */
  notes: Record<string, string>;
  phase: string;
  run: Run | null;
}

const state = vi.hoisted((): State => ({
  files: [],
  fetchedAt: '2026-09-27T09:00:00.000Z',
  query: {},
  notes: {},
  phase: 'idle',
  run: null,
}));

type CreateTextFile = (
  parentId: string,
  name: string,
  content: string,
  options?: CreateTextFileOptions,
) => Promise<DriveFile>;

const createTextFile = vi.fn<CreateTextFile>((_parent, name) =>
  Promise.resolve({
    id: 'NEW_ID',
    name,
    mimeType: 'text/markdown',
    parents: ['INBOX_ID'],
    path: name,
  }),
);

const refresh = vi.fn(() => Promise.resolve());
// Stable across renders, as the vault's own callbacks are.
const getNoteText = vi.fn((id: string) =>
  Promise.resolve(state.notes[id] ?? ''),
);
const openNoteForEdit = vi.fn((id: string) =>
  Promise.resolve({ text: state.notes[id] ?? '', modifiedTime: 'T1' }),
);
const saveEditedNote = vi.fn(() =>
  Promise.resolve({ text: '', modifiedTime: 'T2' }),
);
const deleteFile = vi.fn(() => Promise.resolve());
const doItNow = vi.fn();
const editRule = vi.fn(() => Promise.resolve());
const decideProposal = vi.fn(() => Promise.resolve());
const keepRule = vi.fn<(sentence: string) => Promise<string>>(() =>
  Promise.resolve('Finance'),
);

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile,
  deleteFile,
}));

vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ phase: state.phase, run: state.run, doItNow }),
}));

vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/bower', query: state.query, route: vi.fn() }),
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me, setMe: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({
    index: null,
    files: state.files,
    fetchedAt: state.fetchedAt,
    refresh,
    getNoteText,
    openNoteForEdit,
    saveEditedNote,
    editRule,
    decideProposal,
    keepRule,
  }),
}));

const { Bower } = await import('../src/routes/bower.js');

let root: HTMLDivElement;

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(Bower, null), root);
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    (button) =>
      (button.getAttribute('aria-label') ?? button.textContent?.trim()) ===
      name,
  );
}

function box(): HTMLTextAreaElement {
  const textarea = root.querySelector('textarea');
  if (textarea === null) throw new Error('No box');
  return textarea;
}

beforeEach(() => {
  localStorage.clear();
  state.files = [];
  state.fetchedAt = '2026-09-27T09:00:00.000Z';
  state.query = {};
  state.notes = {};
  state.phase = 'idle';
  state.run = null;
  createTextFile.mockClear();
  saveEditedNote.mockClear();
  deleteFile.mockClear();
  doItNow.mockClear();
  refresh.mockClear();
  keepRule.mockClear();
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('the Bower tab', () => {
  it('has one box, Send and three segments, and no Rule/Task/Question control', async () => {
    await mount();
    expect(box().getAttribute('aria-label')).toBe(
      'Tell Bower what to do, or ask it something',
    );
    expect(buttonNamed('Send')).toBeDefined();
    const tabs = [...root.querySelectorAll('[role="tab"]')].map((tab) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toEqual(['Rules', 'Requests', 'Activity']);
    const text = root.textContent ?? '';
    for (const label of ['A rule', 'A task', 'A question']) {
      expect(buttonNamed(label)).toBeUndefined();
    }
    expect(text).not.toMatch(/\bvault\b/i);
  });

  it('the first time: the tip is open, and an example fills the box without sending', async () => {
    await mount();
    expect(root.textContent).toContain('Nothing yet');
    const examples = [...root.querySelectorAll('.bower-example')];
    expect(examples).toHaveLength(3);
    await act(() => {
      (examples[0] as HTMLButtonElement).click();
    });
    expect(box().value).toBe(examples[0]?.textContent);
    expect(createTextFile).not.toHaveBeenCalled();

    const moreIdeas = [...root.querySelectorAll('a')].find(
      (a) => a.textContent === 'More ideas',
    );
    expect(moreIdeas?.getAttribute('href')).toBe('/ideas');
  });

  it('with something waiting: the tip starts closed and opens on "?"', async () => {
    state.files = [
      {
        id: 'Q_ID',
        name: 'Bower - 2026-09-27 0815 Which flat first.md',
        mimeType: 'text/markdown',
        parents: ['INBOX_ID'],
        path: '0-Inbox/Bower - 2026-09-27 0815 Which flat first.md',
        modifiedTime: '2026-09-27T08:15:00.000Z',
      },
    ];
    await mount();
    const toggle = buttonNamed('Things you can ask');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await act(() => {
      toggle?.click();
    });
    expect(root.querySelectorAll('.bower-example')).toHaveLength(3);
  });

  it('Send writes a request note, starts no run and shows it under Requests as Waiting', async () => {
    await mount();
    await act(() => {
      box().value = 'Which flat should I visit first?';
      box().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonNamed('Send')?.click();
      await Promise.resolve();
    });

    expect(createTextFile).toHaveBeenCalledTimes(1);
    const call = createTextFile.mock.calls[0];
    if (call === undefined) throw new Error('No note written');
    const [parent, name, content, options] = call;
    expect(parent).toBe('INBOX_ID');
    expect(name).toMatch(
      /^Bower - \d{4}-\d{2}-\d{2} \d{4} Which flat should I visit first\.md$/,
    );
    expect(content).toContain('kind: request\n');
    expect(content).toContain('Which flat should I visit first?');
    expect(options?.appProperties).toEqual({ bower: 'instruction' });
    expect(refresh).toHaveBeenCalledTimes(1);

    expect(box().value).toBe('');
    const requests = root.querySelector('#bower-panel-requests');
    expect(requests?.hasAttribute('hidden')).toBe(false);
    expect(requests?.textContent).toContain('Which flat should I visit first?');
    expect(requests?.textContent).toContain('Waiting');
  });

  it('keeps the text and says so when Drive refuses the note', async () => {
    createTextFile.mockRejectedValueOnce(new Error('Drive said no'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await mount();
    await act(() => {
      box().value = 'Hello';
      box().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonNamed('Send')?.click();
      await Promise.resolve();
    });
    expect(root.textContent).toContain('Could not send that. Try again.');
    expect(box().value).toBe('Hello');
    consoleError.mockRestore();
  });
});

describe('a rule kept at once (#343)', () => {
  async function send(text: string): Promise<void> {
    await act(() => {
      box().value = text;
      box().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonNamed('Send')?.click();
      await Promise.resolve();
    });
  }

  it('keeps a "from now on" sentence in your rules: no note, Rule kept under Requests', async () => {
    await mount();
    await send('  From now on, receipts go under Finance');

    expect(keepRule).toHaveBeenCalledWith(
      'From now on, receipts go under Finance',
    );
    expect(createTextFile).not.toHaveBeenCalled();
    expect(box().value).toBe('');
    const requests = root.querySelector('#bower-panel-requests');
    expect(requests?.hasAttribute('hidden')).toBe(false);
    const row = [...(requests?.querySelectorAll('li') ?? [])].find((li) =>
      li.textContent?.includes('From now on, receipts go under Finance'),
    );
    expect(row?.textContent).toContain('Rule kept');
    expect(row?.textContent).not.toContain('Waiting');

    const link = [...(row?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'In your rules',
    );
    await act(() => {
      link?.click();
    });
    expect(
      root.querySelector('#bower-panel-rules')?.hasAttribute('hidden'),
    ).toBe(false);
  });

  it('a question and a job wait for the next tidy-up, each named', async () => {
    await mount();
    await send('Which flat should I visit first?');
    await send('Make a packing list for my next trip');

    expect(keepRule).not.toHaveBeenCalled();
    expect(createTextFile).toHaveBeenCalledTimes(2);
    const text = root.querySelector('#bower-panel-requests')?.textContent;
    expect(text).toContain('Waiting · question');
    expect(text).toContain('Waiting · job');
  });

  it('keeps the sentence in the box and says so when the rule cannot be saved', async () => {
    keepRule.mockRejectedValueOnce(new Error('Drive said no'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await mount();
    await send('Never archive Finance');
    expect(root.textContent).toContain('Could not keep that rule. Try again.');
    expect(box().value).toBe('Never archive Finance');
    expect(createTextFile).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('Requests (#344)', () => {
  const question: DriveFile = {
    id: 'Q_ID',
    name: 'Bower - 2026-09-27 0815 Which flat should I visit.md',
    mimeType: 'text/markdown',
    parents: ['INBOX_ID'],
    path: '0-Inbox/Bower - 2026-09-27 0815 Which flat should I visit.md',
    modifiedTime: '2026-09-27T08:15:00.000Z',
  };
  const context: DriveFile = {
    ...question,
    id: 'C_ID',
    name: 'Bower - 2026-09-27 0816 Context.md',
    path: '0-Inbox/Bower - 2026-09-27 0816 Context.md',
  };
  const head =
    '---\ntags: [instruction]\ndate: 2026-09-27T08:15:00.000Z\nvia: app\nkind: request\n---\n\n';

  function row(text: string): HTMLLIElement | undefined {
    return [...root.querySelectorAll('#bower-panel-requests li')].find((li) =>
      li.textContent?.includes(text),
    ) as HTMLLIElement | undefined;
  }

  function button(within: Element | undefined, name: string) {
    return [...(within?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === name,
    );
  }

  /** Mounts, then lets the notes' words load. */
  async function mountRead(): Promise<void> {
    await mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  beforeEach(() => {
    state.files = [question, context];
    state.notes = {
      Q_ID: `${head}Which flat should I visit first?\n`,
      C_ID: `${head.replace('request', 'context')}Receipts\n\n## Applies to\n\n- a.pdf\n`,
    };
  });

  it('shows each waiting note in its words, with Edit, Remove and Do it now', async () => {
    await mountRead();
    const waiting = row('Which flat should I visit first?');
    expect(waiting?.textContent).toContain('Waiting · question');
    expect(waiting?.textContent).toContain('goes with the next tidy-up');
    for (const name of ['Edit', 'Remove', 'Do it now']) {
      expect(button(waiting, name)).toBeDefined();
    }
    // Add's context note: named for what it is, no Edit.
    const about = row('About the files you added');
    expect(about?.textContent).toContain('Waiting');
    expect(button(about, 'Edit')).toBeUndefined();
    expect(button(about, 'Remove')).toBeDefined();
  });

  it('Do it now opens the confirmation with the count of requests', async () => {
    await mountRead();
    await act(() => {
      button(row('Which flat should I visit first?'), 'Do it now')?.click();
    });
    expect(doItNow).toHaveBeenCalledWith(2);
  });

  it('Edit fills the box, and Send rewrites the note with its frontmatter', async () => {
    await mountRead();
    await act(async () => {
      button(row('Which flat should I visit first?'), 'Edit')?.click();
      await Promise.resolve();
    });
    expect(box().value).toBe('Which flat should I visit first?');
    expect(root.textContent).toContain('Changing a request');

    await act(() => {
      box().value = 'Which flat is closest to work?';
      box().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttonNamed('Send')?.click();
      await Promise.resolve();
    });
    expect(saveEditedNote).toHaveBeenCalledWith(
      'Q_ID',
      `${head}Which flat is closest to work?\n`,
      { baseModifiedTime: 'T1' },
    );
    expect(createTextFile).not.toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('Remove sends the note to the Trash and takes it off the list', async () => {
    await mountRead();
    await act(async () => {
      button(row('Which flat should I visit first?'), 'Remove')?.click();
      await Promise.resolve();
    });
    expect(deleteFile).toHaveBeenCalledWith('Q_ID');
    expect(refresh).toHaveBeenCalled();
    expect(row('Which flat should I visit first?')).toBeUndefined();
  });

  it('while a run is in flight: Tidying up, and nothing to press', async () => {
    state.phase = 'running';
    state.run = {
      state: 'running',
      requestedAt: '2026-09-27T09:00:00.000Z',
      startedAt: '2026-09-27T09:00:00.000Z',
    };
    await mountRead();
    const tidying = row('Which flat should I visit first?');
    expect(tidying?.textContent).toContain('Tidying up · question');
    expect(tidying?.textContent).toMatch(/started /);
    expect(tidying?.querySelectorAll('button')).toHaveLength(0);
  });
});
