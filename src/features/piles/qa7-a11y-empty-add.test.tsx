/**
 * qa7-a11y-empty (qa-7 Claude F4): pressing "Take … out" on an Add draft removes its row, and the button with it, so
 * keyboard focus falls to the page body (WCAG 2.4.3 Focus Order). Focus goes to the row that took its place, else the
 * one before it, else the page (`focusMain`, `ui/focus.ts`), never to nothing. Made-up names only.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
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

function draft(): void {
  sessionStorage.setItem('bower:add-items', JSON.stringify(links.map((name) => ({ key: `K-${name}`, name, kind: 'link', origin: 'A link you pasted', url: `https://${name}` }))));
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
async function takeOut(name: string): Promise<void> {
  const button = screen.getByRole('button', { name: `Take ${name} out` });
  button.focus();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.click(button);
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  vi.useRealTimers();
}

describe('qa7-a11y-empty: taking a thing out of Add keeps the keyboard', () => {
  it('AC3 qa7-a11y-empty-add-next: focus goes to the row that took the removed one\'s place', async () => {
    draft();
    await takeOut('one.example/a');
    // Positive control: the row is gone and the other stays.
    expect(within(screen.getByRole('list', { name: 'In this pile' })).getAllByRole('listitem')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take one.example/b out' }));
  });

  it('AC3 qa7-a11y-empty-add-previous: removing the last row sends focus to the row before it', async () => {
    draft();
    await takeOut('one.example/b');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take one.example/a out' }));
  });

  it('AC3 qa7-a11y-empty-add-page: removing the only row sends focus to the page, not to nothing', async () => {
    draft();
    await takeOut('one.example/a');
    await takeOut('one.example/b');
    expect(screen.queryByRole('list', { name: 'In this pile' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});
