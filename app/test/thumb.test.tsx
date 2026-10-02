// @vitest-environment jsdom

/**
 * #1004: a photo from the index has no `thumbnailLink` of its own. When the
 * picture cannot be fetched, `Thumb` asks Drive for a link and shows it as
 * an <img> instead of the generic icon (the preview column, R-FOLDER-5/6).
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const LINK = 'https://lh3.googleusercontent.com/photo-thumb=s220';

const thumbnailLinkOf = vi.hoisted(() =>
  vi.fn<(id: string) => Promise<string | null>>(),
);

vi.mock('../src/cache.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache.js')>()),
  loadThumbnail: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  thumbnailLinkOf,
}));

const { Thumb } = await import('../src/components/folder-grid.js');

let host: HTMLDivElement | undefined;

async function mount(file: {
  id: string;
  thumbnailLink?: string;
}): Promise<HTMLDivElement> {
  const root = document.createElement('div');
  document.body.append(root);
  host = root;
  await act(async () => {
    render(
      h(Thumb, {
        file,
        kind: 'photo',
        alt: 'Preview of Garden',
        fallback: h('span', { class: 'generic-icon' }),
      }),
      root,
    );
    await Promise.resolve();
  });
  // The cache answer, then Drive's link: let both settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  document.body.replaceChildren();
  thumbnailLinkOf.mockReset();
});

describe('Thumb for a photo with no link of its own', () => {
  it('shows the picture from a fresh Drive link, not the icon', async () => {
    thumbnailLinkOf.mockResolvedValue(LINK);
    const root = await mount({ id: 'photo-1' });
    expect(thumbnailLinkOf).toHaveBeenCalledWith('photo-1');
    // Sized as the fetched picture would be (`thumbnailUrl`).
    expect(root.querySelector('img')?.getAttribute('src')).toMatch(
      /^https:\/\/lh3\.googleusercontent\.com\/photo-thumb=s\d+$/,
    );
    expect(root.querySelector('.generic-icon')).toBeNull();
  });

  it('keeps the icon when Drive has no thumbnail', async () => {
    thumbnailLinkOf.mockResolvedValue(null);
    const root = await mount({ id: 'photo-2' });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.generic-icon')).not.toBeNull();
  });

  it('uses the listing link as it is when there is one', async () => {
    const root = await mount({ id: 'photo-3', thumbnailLink: LINK });
    expect(thumbnailLinkOf).not.toHaveBeenCalled();
    expect(root.querySelector('img')?.getAttribute('src')).toBe(LINK);
  });
});
