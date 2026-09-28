// @vitest-environment jsdom

/**
 * The Ideas screen (#332): the board's groups render, each row's Copy link
 * points at the Bower tab with the row's prompt prefilled, and Back goes
 * to the Bower tab.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ShellSlotsProvider,
  useShellSlots,
} from '../src/components/shell-slots.js';
import { IDEAS } from '../src/ideas.js';

const { Ideas } = await import('../src/routes/ideas.js');

let root: HTMLDivElement;

/** Renders the `back` slot `Ideas` fills, the same way `Layout` would. */
function BackSlot() {
  const { back } = useShellSlots();
  return h('div', { class: 'topbar' }, back);
}

async function mount(): Promise<void> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(
      h(ShellSlotsProvider, null, [
        h(BackSlot, { key: 'bar' }),
        h(Ideas, { key: 'screen' }),
      ]),
      root,
    );
  });
}

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('the Ideas screen', () => {
  it('shows every group and idea from the board, each with a Copy link', async () => {
    await mount();
    const groupTitles = [...root.querySelectorAll('.idea-group-title')].map(
      (el) => el.textContent,
    );
    expect(groupTitles).toEqual(IDEAS.map((group) => group.title));

    const rows = [...root.querySelectorAll('.idea-row')];
    const totalIdeas = IDEAS.reduce((n, group) => n + group.ideas.length, 0);
    expect(rows).toHaveLength(totalIdeas);

    const first = IDEAS[0]?.ideas[0];
    if (first === undefined) throw new Error('No first idea');
    expect(rows[0]?.textContent).toContain(first.text);
    const copyLink = rows[0]?.querySelector('a.idea-copy');
    expect(copyLink?.getAttribute('href')).toBe(
      `/bower?text=${encodeURIComponent(first.prompt)}`,
    );
  });

  it('Back goes to the Bower tab', async () => {
    await mount();
    const back = root.querySelector('.topbar-back');
    expect(back?.getAttribute('href')).toBe('/bower');
  });
});
