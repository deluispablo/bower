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

import type { DriveFile } from '../src/drive.js';
import { closeSwitcher, openSwitcher } from '../src/switcher-store.js';
import { buildVaultIndex } from '../src/vault-index.js';

function note(id: string, path: string): DriveFile {
  const name = path.split('/').pop() ?? path;
  return { id, name, mimeType: 'text/markdown', parents: ['PARENT'], path };
}

const LISBON = note('lisbon', '2-Areas/Travel/Lisbon Trip.md');
const CURRY = note('curry', 'Weeknight curry.md');
const FILES = [LISBON, CURRY];
const INDEX = buildVaultIndex(FILES);

// `vi.mock` factories are hoisted above every import, so the mocks they
// reference must be too (`vi.hoisted`) — otherwise they are read before
// they exist.
const { searchFullText, loadNote, process } = vi.hoisted(() => ({
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
}));

vi.mock('preact-iso', () => ({ useLocation: () => ({ route: vi.fn() }) }));
vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  searchFullText,
}));
vi.mock('../src/cache.js', () => ({ loadNote }));
vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ index: INDEX, files: FILES }),
}));
vi.mock('../src/run-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/run-store.js')>()),
  useRun: () => ({ process }),
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
