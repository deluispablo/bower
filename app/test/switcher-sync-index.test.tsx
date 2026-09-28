// @vitest-environment jsdom

/**
 * The switcher shows the vault index's own name/path matches synchronously,
 * before Drive's full-text search resolves (#308, board `Phone-Switcher`):
 * a note whose name matches the query must appear even while
 * `searchFullText` is still in flight — or never resolves at all, as here.
 * The ranking itself (`rankNotes`) is unit-tested directly in
 * `switcher.test.ts`; this only checks the component wires it in without
 * waiting on the debounced Drive call.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Run } from '../src/api.js';
import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { closeSwitcher, openSwitcher } from '../src/switcher-store.js';
import { buildVaultIndex } from '../src/vault-index.js';

function note(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

function folder(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: FOLDER_MIME, parents: ['PARENT'], path };
}

function file(id: string, path: string, mimeType: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType, parents: ['PARENT'], path };
}

const LISBON = note('lisbon', '2-Areas/Travel/Lisbon Trip.md');
const CURRY = note('curry', 'Weeknight curry.md');
const PARA_FOLDERS = [
  folder('f-inbox', '0-Inbox'),
  folder('f-projects', '1-Projects'),
  folder('f-areas', '2-Areas'),
  folder('f-resources', '3-Resources'),
  folder('f-archives', '4-Archives'),
];
const FLAT_HUNT = folder('flat', '1-Projects/Flat hunt');
const FLAT_NOTE = note('flat-note', '1-Projects/Flat hunt/Arlington Road.md');
const LEASE = file(
  'lease',
  '1-Projects/Flat hunt/Lease agreement 2026.pdf',
  'application/pdf',
);
const FILES = [...PARA_FOLDERS, FLAT_HUNT, FLAT_NOTE, LEASE, LISBON, CURRY];
const INDEX = buildVaultIndex(FILES);

// `vi.mock` factories are hoisted above every import, so the mocks they
// reference must be too (`vi.hoisted`) — otherwise they are read before
// they exist.
const { searchFullText, loadNote, process, tidyUp, runStub } = vi.hoisted(
  () => ({
    runStub: { lastFinished: null as Run | null },
    // Resolves never: stands in for a Drive full-text search that never
    // comes back (offline, or just slow), so any result shown before it
    // settles must have come from the local index, not from this.
    searchFullText: vi.fn<(query: string) => Promise<DriveFile[]>>(
      () => new Promise<DriveFile[]>(() => {}),
    ),
    loadNote: vi.fn<(id: string) => Promise<{ text: string }>>(
      () => new Promise(() => {}),
    ),
    process: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    tidyUp: vi.fn<() => void>(),
  }),
);

vi.mock('preact-iso', () => ({ useLocation: () => ({ route: vi.fn() }) }));
vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  searchFullText,
}));
vi.mock('../src/cache.js', () => ({ loadNote }));
vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  getRuns: () => Promise.resolve({ runs: [] }),
}));
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: INDEX, files: FILES }),
}));
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ process, tidyUp, lastFinished: runStub.lastFinished }),
}));

const { Switcher } = await import('../src/components/switcher.js');

let root: HTMLDivElement;

function type(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function optionTexts(): string[] {
  return Array.from(root.querySelectorAll('[role="option"]')).map(
    (el) => el.textContent ?? '',
  );
}

beforeEach(() => {
  localStorage.clear();
  runStub.lastFinished = null;
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
  openSwitcher();
  void act(() => {
    render(h(Switcher, {}), root);
  });
});

afterEach(() => {
  closeSwitcher();
  root.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('the switcher, against a Drive search that never resolves', () => {
  it('shows a matching note name before any Drive request completes', async () => {
    await flush();
    const field = root.querySelector('input') as HTMLInputElement;

    void act(() => {
      type(field, 'lisbon');
    });
    await flush();

    // No time has passed at all yet: the debounce timer has not even fired,
    // so `searchFullText` was never called — the match is purely local.
    expect(searchFullText).not.toHaveBeenCalled();
    expect(optionTexts().some((text) => text.includes('Lisbon Trip'))).toBe(
      true,
    );
    expect(optionTexts().some((text) => text.includes('Weeknight curry'))).toBe(
      false,
    );
  });

  it('keeps showing the match once the never-resolving search is actually in flight', async () => {
    await flush();
    const field = root.querySelector('input') as HTMLInputElement;

    void act(() => {
      type(field, 'lisbon');
    });
    await flush();

    // Let the debounce elapse so the (forever-pending) Drive call starts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(searchFullText).toHaveBeenCalledWith('lisbon');
    expect(optionTexts().some((text) => text.includes('Lisbon Trip'))).toBe(
      true,
    );
    // The status line never falsely claims no notes match while the
    // request is still pending.
    expect(root.textContent).not.toContain('No notes contain');
  });
});

describe('the Tidy up command (#320)', () => {
  it('goes through the same tidyUp as the Inbox card and Add, never process', async () => {
    await flush();
    const field = root.querySelector('input') as HTMLInputElement;
    void act(() => {
      type(field, 'tidy');
    });
    await flush();

    const row = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[role="option"] a, [role="option"] button',
      ),
    ).find((el) => (el.textContent ?? '').includes('Tidy up the inbox'));
    if (row === undefined) throw new Error('Tidy up command missing');
    void act(() => {
      row.click();
    });

    expect(tidyUp).toHaveBeenCalledTimes(1);
    expect(process).not.toHaveBeenCalled();
  });
});

function buttonNames(): string[] {
  return Array.from(root.querySelectorAll('button')).map((el) =>
    (el.textContent ?? '').trim(),
  );
}

describe('the empty query (#593, board Phone-Search-Start)', () => {
  it('shows the four PARA chips, Opened lately, Filed in the last tidy-up and Searched before', async () => {
    // The switcher mounted in beforeEach already read an empty device; open
    // it again with the lists filled.
    closeSwitcher();
    await flush();
    localStorage.setItem('bower.opened.recent', JSON.stringify(['lease']));
    localStorage.setItem('bower.search.recent', JSON.stringify(['boiler']));
    runStub.lastFinished = {
      state: 'done',
      requestedAt: '2026-09-27T10:00:00.000Z',
      finishedAt: new Date().toISOString(),
      items: [
        {
          path: '0-Inbox/IMG_1.pdf',
          kind: 'file',
          to: '1-Projects/Flat hunt/Arlington Road.md',
        },
        { path: '0-Inbox/gone.pdf', kind: 'file', to: 'Nowhere/Missing.pdf' },
      ],
    };
    openSwitcher();
    await flush();

    const chips = buttonNames().map((name) =>
      name.replace(/^[PARA](?=[A-Z][a-z])/, ''),
    );
    for (const label of ['Projects', 'Areas', 'Resources', 'Archives']) {
      expect(chips).toContain(label);
    }
    expect(chips).not.toContain('Inbox');
    const text = root.textContent ?? '';
    expect(text).toContain('Opened lately');
    expect(text).toContain('Lease agreement 2026');
    expect(text).toContain('Filed in the last tidy-up');
    expect(text).toContain('Arlington Road');
    expect(text).not.toContain('Missing');
    expect(text).toContain('Searched before');
    expect(chips).toContain('boiler');
  });

  it('scopes the search to a PARA folder when its chip is tapped', async () => {
    await flush();
    const chip = Array.from(root.querySelectorAll('button')).find((el) =>
      (el.textContent ?? '').trim().endsWith('Areas'),
    );
    if (chip === undefined) throw new Error('Areas chip missing');
    void act(() => {
      chip.click();
    });
    const field = root.querySelector('input') as HTMLInputElement;
    expect(field.placeholder).toBe('Search in Areas');

    void act(() => {
      type(field, 'lisbon');
    });
    await flush();
    expect(optionTexts().some((t) => t.includes('Lisbon Trip'))).toBe(true);

    void act(() => {
      type(field, 'lease');
    });
    await flush();
    expect(optionTexts().some((t) => t.includes('Lease agreement'))).toBe(
      false,
    );
  });
});

describe('results (#593, board Phone-Search)', () => {
  it('groups folders, notes and files, with counts and the fuzzy hint', async () => {
    await flush();
    const field = root.querySelector('input') as HTMLInputElement;
    void act(() => {
      type(field, 'flat hnt');
    });
    await flush();

    const headings = Array.from(root.querySelectorAll('.switcher-heading')).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(['Folder', 'Notes', 'Files']);
    expect(buttonNames()).toContain('All 3');
    expect(root.textContent).toContain(
      'Close enough counts: “flat hnt” finds Flat hunt.',
    );
    expect(root.querySelector('.switcher-match')).not.toBeNull();
  });

  it('offers Ask Bower where it is when nothing matches', async () => {
    searchFullText.mockResolvedValueOnce([]);
    await flush();
    const field = root.querySelector('input') as HTMLInputElement;
    void act(() => {
      type(field, 'boiler warranty');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(root.textContent).toContain('Nothing called “boiler warranty”');
    expect(root.textContent).toContain(
      'No folder, note or file has those words in its name or its text.',
    );
    const ask = Array.from(root.querySelectorAll('a')).find(
      (el) => el.textContent === 'Ask Bower where it is',
    );
    expect(ask?.getAttribute('href')).toBe(
      '/bower?text=Where%20is%20boiler%20warranty%3F',
    );
  });
});
