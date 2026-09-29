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

import { stubMatchMedia } from './helpers/match-media.js';

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
  /** The run store's shared clock (#513, #537): epoch ms. */
  now: number;
  runs: Run[];
}

const state = vi.hoisted((): State => ({
  files: [],
  fetchedAt: '2026-09-27T09:00:00.000Z',
  query: {},
  notes: {},
  phase: 'idle',
  run: null,
  now: Date.parse('2026-09-27T09:00:00.000Z'),
  runs: [],
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
const processRun = vi.fn<(scope?: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const getRuns = vi.fn<() => Promise<{ runs: Run[] }>>(() =>
  Promise.resolve({ runs: state.runs }),
);
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
  useRun: () => ({
    phase: state.phase,
    run: state.run,
    process: processRun,
    lastFinished: null,
    now: state.now,
  }),
}));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  getRuns,
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
    // Real, built from `state.files` (empty when none, same as no vault
    // yet): lets a test register a `Rules.md` file for `rulesLoad` (#507's
    // "already in your rules" check) without changing anything else here.
    index: state.files.length === 0 ? null : buildVaultIndex(state.files),
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
const { buildVaultIndex } = await import('../src/vault-index.js');
const { cardWhen } = await import('../src/activity.js');

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
  state.now = Date.parse('2026-09-27T09:00:00.000Z');
  createTextFile.mockClear();
  saveEditedNote.mockClear();
  deleteFile.mockClear();
  processRun.mockClear();
  getRuns.mockClear();
  state.runs = [];
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

  it('draws the bird 56 px high above the composer (ruling, R-BIRD)', async () => {
    await mount();
    const bird = root.querySelector('.bower-box-intro svg');
    expect(bird?.getAttribute('width')).toBe('56');
    expect(bird?.getAttribute('height')).toBe('56');
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
    expect(requests?.textContent).toContain('In your inbox');
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
    expect(text).toContain('Which flat should I visit first?');
    expect(text).toContain('Make a packing list for my next trip');
    expect(text?.match(/In your inbox/g)).toHaveLength(2);
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

describe('the confirmation line under the box (#507)', () => {
  const RULES_FILE: DriveFile = {
    id: 'RULES_ID',
    name: 'Rules.md',
    mimeType: 'text/markdown',
    parents: ['FOLDER_ID'],
    path: 'Rules.md',
  };
  const RULES_TEXT =
    '# Rules\n\n## Finance\n\n' +
    "- Receipts go under Finance (owner's request, 2026-09-20)\n";

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

  function confirmLine(): string | null {
    return root.querySelector('.bower-send-confirm')?.textContent ?? null;
  }

  it('is a live region present before anything is ever sent (#553)', async () => {
    await mount();
    const el = root.querySelector('.bower-send-confirm');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
    expect(el?.textContent).toBe('');
  });

  it('says "Kept as a rule" for a new one', async () => {
    await mount();
    await send('From now on, never archive Money notes');
    expect(confirmLine()).toBe('Kept as a rule');
  });

  it('says "Already in your rules" for one already there', async () => {
    state.files = [RULES_FILE];
    state.notes[RULES_FILE.id] = RULES_TEXT;
    await mount();
    // The mocked `keepRule` never actually rewrites `state.notes`, so the
    // fixture above is what `rulesLoad` — and the dedup check — reads.
    await send('From now on, receipts go under Finance');
    expect(confirmLine()).toBe('Already in your rules');
  });

  it('says "Will go with the next tidy-up" for anything sent while a run is in progress', async () => {
    state.phase = 'running';
    state.run = {
      state: 'running',
      requestedAt: '2026-09-27T09:00:00.000Z',
    };
    await mount();
    await send('Which flat should I visit first?');
    expect(confirmLine()).toBe('Will go with the next tidy-up');
  });

  it('shows nothing sent idle (the row itself is confirmation enough)', async () => {
    await mount();
    await send('Which flat should I visit first?');
    // The live region (#553) stays mounted, just empty — not null.
    expect(confirmLine()).toBe('');
  });

  it('clears on the next Send', async () => {
    await mount();
    await send('From now on, never archive Money notes');
    expect(confirmLine()).toBe('Kept as a rule');
    await send('Make a packing list for my next trip');
    expect(confirmLine()).toBe('');
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

  /** Opens a row's More menu; its items are portalled to `document.body`. */
  async function openMenu(text: string): Promise<void> {
    await act(() => {
      row(text)
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="More for this request"]',
        )
        ?.click();
    });
  }

  function menuItem(name: string): HTMLButtonElement | undefined {
    return [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        '[role="menu"] [role="menuitem"]',
      ),
    ].find((item) => item.querySelector('span')?.textContent === name);
  }

  it('shows each waiting note in its words, with a More menu: Edit, Just this, now, Remove', async () => {
    await mountRead();
    const waiting = row('Which flat should I visit first?');
    expect(waiting?.textContent).toContain('In your inbox');
    expect(waiting?.textContent).toContain('Bower does it at the next tidy-up');
    // No row has a button that starts a run on its own (R-REQ-2).
    expect(waiting?.querySelectorAll('button')).toHaveLength(1);
    const more = waiting?.querySelector('button');
    expect(more?.getAttribute('aria-label')).toBe('More for this request');
    expect(more?.getAttribute('aria-haspopup')).toBe('menu');

    await openMenu('Which flat should I visit first?');
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu?.getAttribute('aria-label')).toBe('Request actions');
    for (const name of ['Edit', 'Just this, now', 'Remove from the inbox']) {
      expect(menuItem(name)).toBeDefined();
    }
    expect(menuItem('Just this, now')?.textContent).toContain(
      'uses one run of your Claude plan',
    );
    expect(menu?.textContent).toContain(
      'runs only this request and leaves everything else in the inbox for the tidy-up. It is off while a tidy-up is running.',
    );
  });

  it("Add's context note: named for what it is, no Edit in its menu", async () => {
    await mountRead();
    const about = row('About the files you added');
    expect(about?.textContent).toContain('In your inbox');
    await openMenu('About the files you added');
    expect(menuItem('Edit')).toBeUndefined();
    expect(menuItem('Remove from the inbox')).toBeDefined();
  });

  it("a done request reads the run store's shared clock, with its run's counts and a link to Just filed (#513, R-REQ-1, R-REQ-4)", async () => {
    state.files = [];
    state.notes = {};
    const doneName = 'Bower - 2026-09-27 0815 Make a packing list.md';
    const path = `0-Inbox/${doneName}`;
    state.runs = [
      {
        state: 'done',
        runId: 'RUN_ID',
        requestedAt: '2026-09-27T08:20:00.000Z',
        finishedAt: '2026-09-27T08:26:00.000Z',
        items: [{ path, kind: 'request' }],
        created: ['1-Projects/Trip/Packing list.md'],
        updated: [{ path: '3-Resources/Lists.md' }],
      },
    ];
    await mountRead();
    await act(() => {
      buttonNamed('Requests')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const done = row('Make a packing list');
    expect(done?.textContent).toContain('Done');
    expect(done?.textContent).toContain(
      `${cardWhen('2026-09-27T08:26:00.000Z', state.now)
        .charAt(0)
        .toLowerCase()}${cardWhen('2026-09-27T08:26:00.000Z', state.now).slice(1)} · 1 new · 1 updated`,
    );
    const link = done?.querySelector('a');
    expect(link?.textContent).toBe('See what came of it');
    expect(link?.getAttribute('href')).toBe('/just-filed?run=RUN_ID');
    // Done: nothing to press, no menu.
    expect(done?.querySelectorAll('button')).toHaveLength(0);
  });

  it('a request a run could not finish reads Did not finish and carries the menu', async () => {
    state.runs = [
      {
        state: 'failed',
        requestedAt: '2026-09-27T08:20:00.000Z',
        finishedAt: '2026-09-27T08:26:00.000Z',
        items: [{ path: question.path, kind: 'question' }],
      },
    ];
    await mountRead();
    await act(() => {
      buttonNamed('Requests')?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const failed = row('Which flat should I visit first?');
    expect(failed?.textContent).toContain('Did not finish');
    expect(failed?.textContent).toContain(
      'still in your inbox for the next tidy-up',
    );
    await openMenu('Which flat should I visit first?');
    expect(menuItem('Just this, now')).toBeDefined();
  });

  it('Just this, now starts an instructions-only run through the shared helper', async () => {
    await mountRead();
    await openMenu('Which flat should I visit first?');
    await act(async () => {
      menuItem('Just this, now')?.click();
      await Promise.resolve();
    });
    expect(processRun).toHaveBeenCalledWith('instructions');
  });

  it('Just this, now is off while a tidy-up is running, and says why', async () => {
    // The run was asked for before the note was sent: the note waits for
    // the next tidy-up, and its menu is off.
    state.phase = 'running';
    state.run = {
      state: 'running',
      requestedAt: '2026-09-26T09:00:00.000Z',
    };
    await mountRead();
    await openMenu('Which flat should I visit first?');
    const item = menuItem('Just this, now');
    expect(item?.disabled).toBe(true);
    expect(item?.textContent).toContain('A tidy-up is running');
    await act(() => {
      item?.click();
    });
    expect(processRun).not.toHaveBeenCalled();
  });

  it('Edit fills the box, and Send rewrites the note with its frontmatter', async () => {
    await mountRead();
    await openMenu('Which flat should I visit first?');
    await act(async () => {
      menuItem('Edit')?.click();
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
    await openMenu('Which flat should I visit first?');
    await act(async () => {
      menuItem('Remove from the inbox')?.click();
      await Promise.resolve();
    });
    expect(deleteFile).toHaveBeenCalledWith('Q_ID');
    expect(refresh).toHaveBeenCalled();
    expect(row('Which flat should I visit first?')).toBeUndefined();
  });

  it('while a run is in flight: Being done now, and nothing to press', async () => {
    state.phase = 'running';
    state.run = {
      state: 'running',
      requestedAt: '2026-09-27T09:00:00.000Z',
      startedAt: '2026-09-27T09:00:00.000Z',
    };
    await mountRead();
    const tidying = row('Which flat should I visit first?');
    expect(tidying?.textContent).toContain('Being done now');
    expect(tidying?.textContent).toMatch(/started \d{2}:\d{2}/);
    expect(tidying?.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('three columns from 1200 px (#357)', () => {
  function stubWidth(wide: boolean): void {
    stubMatchMedia((query) => wide && query === '(min-width: 1200px)');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Rules, Requests and Activity as three headed columns, no tabs', async () => {
    stubWidth(true);
    await mount();
    expect(root.querySelector('[role="tablist"]')).toBeNull();
    expect(root.querySelector('[role="tabpanel"]')).toBeNull();
    const heads = [...root.querySelectorAll('.bower-column-head')].map((head) =>
      head.textContent?.trim(),
    );
    expect(heads).toEqual(['Rules', 'Requests', 'Activity']);
    // Each column is labelled by its own header, and all three show at once.
    for (const column of root.querySelectorAll('.bower-column')) {
      const id = column.getAttribute('aria-labelledby') ?? '';
      expect(root.querySelector(`#${id}`)?.tagName).toBe('H2');
      expect(column.children.length).toBeGreaterThan(1);
    }
    // The box still spans above them.
    expect(box()).toBeDefined();
  });

  it('keeps the segments under 1200 px', async () => {
    stubWidth(false);
    await mount();
    expect(root.querySelector('[role="tablist"]')).not.toBeNull();
    expect(root.querySelector('.bower-columns')).toBeNull();
  });
});
