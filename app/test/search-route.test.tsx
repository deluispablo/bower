// @vitest-environment jsdom

/**
 * `/search?q=...` (#495, #917): with a page behind it (a tag on a note),
 * steps back to that page; on a fresh load, routes to Home. Either way it
 * then opens the switcher prefilled with `q`, from a microtask, so a
 * switcher mounting in the same commit has already subscribed to the store
 * by the time it fires.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const query: Record<string, string> = {};
  return { query, calls: [] as string[], lastPage: null as string | null };
});
const route = vi.fn(() => {
  state.calls.push('route');
});
const openSwitcher = vi.fn((q: string) => {
  state.calls.push(`openSwitcher:${q}`);
});

vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/search', query: state.query, route }),
}));

vi.mock('../src/switcher-store.js', () => ({
  openSwitcher,
  lastPage: () => state.lastPage,
}));

const { SearchRedirect } = await import('../src/routes/search.js');

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
  route.mockClear();
  openSwitcher.mockClear();
  vi.restoreAllMocks();
  state.query = {};
  state.calls = [];
  state.lastPage = null;
});

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(SearchRedirect, null), root);
  });
}

describe('the /search redirect', () => {
  it('routes to Home on a fresh load, then opens the switcher prefilled with q', async () => {
    state.query = { q: 'note' };
    await mount();

    expect(route).toHaveBeenCalledWith('/', true);
    expect(openSwitcher).toHaveBeenCalledWith('note');
    // route() runs synchronously in the effect; openSwitcher is only
    // queued there, so it must land after route() actually ran (#495).
    expect(state.calls).toEqual(['route', 'openSwitcher:note']);
  });

  it('steps back to the note a tag was tapped on, then opens the tag search (R-SE-5)', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {
      state.calls.push('back');
    });
    state.lastPage = '/note/NOTE_ID';
    state.query = { q: '#summary' };
    await mount();

    expect(back).toHaveBeenCalledTimes(1);
    expect(route).not.toHaveBeenCalled();
    expect(state.calls).toEqual(['back', 'openSwitcher:#summary']);
  });

  it('opens the switcher with an empty query when q is absent', async () => {
    state.query = {};
    await mount();

    expect(openSwitcher).toHaveBeenCalledWith('');
  });
});
