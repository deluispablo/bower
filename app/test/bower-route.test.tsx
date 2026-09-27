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

import type { Me } from '../src/api.js';
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
}

const state = vi.hoisted((): State => ({
  files: [],
  fetchedAt: '2026-09-27T09:00:00.000Z',
  query: {},
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

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/bower', query: state.query, route: vi.fn() }),
}));

vi.mock('../src/session.js', () => ({
  useSession: () => ({ me, setMe: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({
    files: state.files,
    fetchedAt: state.fetchedAt,
    refresh,
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
  createTextFile.mockClear();
  refresh.mockClear();
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
    expect(root.textContent).not.toContain('Nothing yet');
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
