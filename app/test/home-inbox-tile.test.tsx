// @vitest-environment jsdom

/**
 * Home's Inbox tile (#1001): as a link it opens the inbox folder on every
 * screen size (it used to open `/notes`, which on desktop sends you back
 * Home), and while the listing is read again after a run it says
 * "Updating…" and offers no Tidy up.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INBOX_HREF, InboxTile } from '../src/routes/home.js';

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(
  props: Omit<Parameters<typeof InboxTile>[0], 'onOpenSheet'>,
): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(h(InboxTile, { onOpenSheet: vi.fn(), ...props }), root);
  });
}

describe('InboxTile (#1001)', () => {
  it('opens the inbox folder, not /notes', async () => {
    expect(INBOX_HREF).toBe('/folder/0-Inbox');
    await mount({ state: 'done', pending: 2 });
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      '/folder/0-Inbox',
    );
  });

  it('still leads to Add when nothing waits', async () => {
    await mount({ state: 'done', pending: 0 });
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/add');
  });

  it('says "Updating…" with no Tidy up while the listing is read again', async () => {
    await mount({ state: 'done', pending: 3, updating: true });
    expect(root.textContent).toContain('Updating…');
    expect(root.textContent).toContain('3');
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('a')?.getAttribute('href')).toBe(
      '/folder/0-Inbox',
    );
  });

  it('offers no Tidy up on a failed run while updating', async () => {
    await mount({ state: 'failed', pending: 2, updating: true });
    expect(root.textContent).toContain('Updating…');
    expect(root.querySelector('button')).toBeNull();
  });
});
