/**
 * qa7-a11y-empty (qa-7 Claude F4): pressing "Take … out" on an Add draft removes its row, and the button with it, so
 * keyboard focus falls to the page body (WCAG 2.4.3 Focus Order). Focus goes to the row that took its place, else the
 * one before it, else the page (`focusMain`, `ui/focus.ts`), never to nothing. Made-up names only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { FileKind } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { Add } from './Add';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  sessionStorage.clear();
});

const links = ['one.example/a', 'one.example/b'];

function draft(names = links, duplicate = false, kind: FileKind = 'link'): void {
  sessionStorage.setItem('bower:add-items', JSON.stringify(names.map((name, i) => ({ key: `K-${i}-${name}`, name, kind, origin: kind === 'link' ? 'A link you pasted' : 'From this device', ...(kind === 'link' ? { url: `https://one.example/${i}` } : {}), ...(duplicate ? { dup: 'Resources/Copy.md' } : {}) }))));
  const base = loadingSources();
  render(
    <MemoryRouter initialEntries={['/add']}>
      <DataProvider sources={{ ...base, vault: { ...base.vault, duplicates: async () => [] } }}>
        <main id="main" tabIndex={-1}>
          <Routes><Route path="/add" element={<Add />} /></Routes>
        </main>
      </DataProvider>
    </MemoryRouter>,
  );
}

/** Presses the row's Take out button from the keyboard and lets any deferred focus move land. */
async function takeOut(name: string, duplicate = false): Promise<void> {
  const row = screen.getByRole('button', { name: `Take ${name} out` }).closest('li');
  if (!row) throw new Error('The draft row is missing.');
  const button = within(row).getByRole('button', { name: duplicate ? 'Leave it out' : `Take ${name} out` });
  button.focus();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.click(button);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  vi.useRealTimers();
}

describe.each([false, true])('qa7-a11y-empty: taking a thing out of Add keeps the keyboard (Leave it out %s)', (duplicate) => {
  it('AC3 qa7-a11y-empty-add-next: focus goes to the row that took the removed one\'s place', async () => {
    draft(links, duplicate);
    await takeOut('one.example/a', duplicate);
    // Positive control: the row is gone and the other stays.
    expect(within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take one.example/b out' }));
  });

  it('AC3 qa7-a11y-empty-add-previous: removing the last row sends focus to the row before it', async () => {
    draft(links, duplicate);
    await takeOut('one.example/b', duplicate);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take one.example/a out' }));
  });

  it('AC3 qa7-a11y-empty-add-page: removing the only row sends focus to the page, not to nothing', async () => {
    draft(links, duplicate);
    await takeOut('one.example/a', duplicate);
    await takeOut('one.example/b', duplicate);
    expect(screen.queryByRole('list', { name: 'In this pile' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('AC3 qa7-a11y-empty-add-names: quoted, bracketed and repeated names focus the next row by position', async () => {
    const name = 'Saltmere "papers" [draft].pdf';
    draft([name, name, name], duplicate, 'pdf');
    const rows = within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem');
    if (!rows[1] || !rows[2]) throw new Error('The three draft rows are missing.');
    const next = within(rows[2]).getByRole('button', { name: `Take ${name} out` });
    const button = within(rows[1]).getByRole('button', { name: duplicate ? 'Leave it out' : `Take ${name} out` });
    button.focus();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(rows[1]).not.toBeInTheDocument();
    expect(rows[0]).toBeInTheDocument();
    expect(next).toHaveFocus();
  });

  it.each([1, 2])('AC3 qa7-a11y-empty-add-placed: deferred recovery leaves the person\'s focus alone (%s rows)', async (count) => {
    draft(links.slice(0, count), duplicate);
    const row = screen.getByRole('button', { name: 'Take one.example/a out' }).closest('li');
    if (!row) throw new Error('The draft row is missing.');
    const button = within(row).getByRole('button', { name: duplicate ? 'Leave it out' : 'Take one.example/a out' });
    button.focus();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    expect(button).not.toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'What is this?' });
    field.focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(field).toHaveFocus();
  });
});
