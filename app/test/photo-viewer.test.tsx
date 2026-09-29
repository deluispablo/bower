// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import {
  PhotoViewer,
  counterText,
  zoomLabel,
} from '../src/components/photo-viewer.js';

const SIBLINGS = [
  { id: 'a', name: 'Front door' },
  { id: 'b', name: 'Arlington Road, window sign' },
  { id: 'c', name: 'Kitchen' },
  { id: 'd', name: 'Garden' },
  { id: 'e', name: 'Floor plan' },
];

let host: HTMLElement | undefined;

function mount(onNavigate: (index: number) => void = () => undefined): {
  root: HTMLElement;
  photo: HTMLElement;
} {
  const root = document.createElement('div');
  document.body.append(root);
  host = root;
  void act(() => {
    render(
      h(
        Fragment,
        null,
        h(PhotoViewer, {
          src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
          title: 'Arlington Road, window sign',
          siblings: SIBLINGS,
          index: 1,
          folderName: 'Flat hunt',
          onNavigate,
        }),
        h(OverlayHost, null),
      ),
      root,
    );
  });
  const photo = root.querySelector<HTMLElement>('.photo-viewer-open');
  if (photo === null) throw new Error('no fitted photo');
  return { root, photo };
}

function key(name: string): void {
  void act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, bubbles: true }),
    );
  });
}

afterEach(() => {
  if (host !== undefined) void act(() => render(null, host as HTMLElement));
  host?.remove();
  host = undefined;
});

describe('helpers', () => {
  it('words the counter and the zoom badge', () => {
    expect(counterText(1, 5, 'Flat hunt')).toBe('2 of 5 in Flat hunt');
    expect(zoomLabel(1.8)).toBe('1.8×');
    expect(zoomLabel(2)).toBe('2×');
  });
});

describe('PhotoViewer (issue #605)', () => {
  it('starts fitted, with the hint and no full-screen layer', () => {
    const { root } = mount();
    expect(root.textContent).toContain('Tap to see it whole');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens full screen on tap with a named Close and a text counter', () => {
    const { root, photo } = mount();
    void act(() => photo.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.querySelector('[aria-label="Close"]')).not.toBeNull();
    expect(document.querySelector('.photo-viewer-counter')?.textContent).toBe(
      '2 of 5 in Flat hunt',
    );
    expect(document.querySelector('.photo-viewer-caption')?.textContent).toBe(
      'Arlington Road, window sign',
    );
  });

  it('walks with the arrow keys and the buttons', () => {
    const onNavigate = vi.fn();
    const { root, photo } = mount(onNavigate);
    void act(() => photo.click());
    key('ArrowRight');
    expect(onNavigate).toHaveBeenLastCalledWith(2);
    key('ArrowLeft');
    expect(onNavigate).toHaveBeenLastCalledWith(0);
    void act(() =>
      document.querySelector<HTMLElement>('[aria-label="Next"]')?.click(),
    );
    expect(onNavigate).toHaveBeenLastCalledWith(2);
    void act(() =>
      document.querySelector<HTMLElement>('[aria-label="Previous"]')?.click(),
    );
    expect(onNavigate).toHaveBeenLastCalledWith(0);
    expect(onNavigate).toHaveBeenCalledTimes(4);
  });

  it('does not walk past the first or last item', () => {
    const onNavigate = vi.fn();
    const root = document.createElement('div');
    document.body.append(root);
    host = root;
    void act(() => {
      render(
        h(
          Fragment,
          null,
          h(PhotoViewer, {
            src: 'x.png',
            title: 'Front door',
            siblings: SIBLINGS,
            index: 0,
            folderName: 'Flat hunt',
            onNavigate,
          }),
          h(OverlayHost, null),
        ),
        root,
      );
    });
    void act(() =>
      root.querySelector<HTMLElement>('.photo-viewer-open')?.click(),
    );
    key('ArrowLeft');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(
      document
        .querySelector('[aria-label="Previous"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('traps focus in full screen and returns it to the photo on close', () => {
    const { root, photo } = mount();
    photo.focus();
    void act(() => photo.click());
    const close = document.querySelector<HTMLElement>('[aria-label="Close"]');
    expect(document.activeElement).toBe(close);

    // Shift+Tab from the first control wraps to the last one.
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(
      document.querySelector('[aria-label="Next"]'),
    );
    // Tab from the last control wraps to the first one.
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(close);

    key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(photo);
  });

  it('closes with the Close button', () => {
    const { root, photo } = mount();
    void act(() => photo.click());
    void act(() =>
      document.querySelector<HTMLElement>('[aria-label="Close"]')?.click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a double tap toggles 2x and shows the badge', () => {
    const { root, photo } = mount();
    void act(() => photo.click());
    const img = document.querySelector<HTMLElement>('.photo-viewer-img');
    expect(document.querySelector('.photo-viewer-badge')).toBeNull();
    void act(() => img?.click());
    void act(() => img?.click());
    expect(img?.className).toContain('is-zoomed');
    expect(document.querySelector('.photo-viewer-badge')?.textContent).toBe(
      '2×',
    );
    void act(() => img?.click());
    void act(() => img?.click());
    expect(img?.className).not.toContain('is-zoomed');
    expect(document.querySelector('.photo-viewer-badge')).toBeNull();
  });

  it('opens as one overlay dialog, named by the photo, over an inert page', () => {
    const page = document.createElement('div');
    page.id = 'app';
    const shell = document.createElement('div');
    shell.className = 'shell';
    page.append(shell);
    document.body.append(page);
    const { photo } = mount();
    void act(() => photo.click());
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.getAttribute('aria-label')).toBe(
      'Arlington Road, window sign',
    );
    expect(dialogs[0]?.querySelector('.photo-viewer-full')).not.toBeNull();
    expect(shell.hasAttribute('inert')).toBe(true);
    page.remove();
  });
});
