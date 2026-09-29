// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { BackLink } from '../src/components/back-link.js';

let root: HTMLDivElement;

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

describe('BackLink named (R-NOTE-10)', () => {
  it("keeps the folder's name beside the chevron on a note", async () => {
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(
        h(BackLink, { href: '/folder/x', label: 'Applications', named: true }),
        root,
      );
    });
    const link = root.querySelector('a');
    expect(link?.classList.contains('topbar-back-named')).toBe(true);
    expect(link?.getAttribute('aria-label')).toBe('Back to Applications');
    expect(link?.querySelector('.topbar-back-label')?.textContent).toBe(
      'Applications',
    );
  });

  it('is unchanged without the flag', async () => {
    root = document.createElement('div');
    document.body.append(root);
    await act(() => {
      render(h(BackLink, { href: '/', label: 'Home' }), root);
    });
    expect(root.querySelector('a')?.className).toBe('topbar-back');
  });
});
