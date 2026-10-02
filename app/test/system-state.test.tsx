// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMPTY_COPY,
  ERROR_COPY,
  EmptyFolder,
  EmptySegment,
  ErrorLine,
  SKELETON_DELAY_MS,
  Skeleton,
} from '../src/components/system-state.js';

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  vi.useRealTimers();
  void act(() => {
    render(null, host);
  });
  host.remove();
});

describe('Skeleton (#908, R-SYS-1)', () => {
  it('shows nothing before 300 ms, then rows shaped like the list', () => {
    vi.useFakeTimers();
    void act(() => {
      render(h(Skeleton, { shape: 'rows', count: 2 }), host);
    });
    expect(SKELETON_DELAY_MS).toBe(300);
    expect(host.querySelector('.skeleton')?.getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(host.querySelectorAll('.skeleton-row')).toHaveLength(0);
    void act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(host.querySelectorAll('.skeleton-row')).toHaveLength(0);
    void act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(host.querySelectorAll('.skeleton-row')).toHaveLength(2);
    expect(host.querySelector('.skeleton-row .skeleton-box')).not.toBeNull();
    expect(host.querySelectorAll('.skeleton-row .skeleton-bar')).toHaveLength(
      4,
    );
  });

  it('draws tiles and properties too', () => {
    void act(() => {
      render(
        h('div', null, [
          h(Skeleton, { shape: 'tiles', count: 3, delay: 0 }),
          h(Skeleton, { shape: 'properties', count: 2, delay: 0 }),
        ]),
        host,
      );
    });
    expect(host.querySelectorAll('.skeleton-tile')).toHaveLength(3);
    expect(host.querySelectorAll('.skeleton-property')).toHaveLength(2);
  });
});

describe('ErrorLine (#908, R-SYS-2, R-GLOBAL-7)', () => {
  it('says the spec sentence with "Try again." as a link that retries', () => {
    const onRetry = vi.fn();
    void act(() => {
      render(h(ErrorLine, { what: 'folder', onRetry }), host);
    });
    const line = host.querySelector('.error-line');
    expect(line?.textContent).toBe('Could not load this folder. Try again.');
    void act(() => {
      line?.querySelector<HTMLButtonElement>('button')?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(ERROR_COPY).toEqual({
      folder: 'Could not load this folder. Try again.',
      note: 'Could not open this note. Try again.',
      file: 'Could not open this file. Try again.',
      home: 'Could not load Home. Try again.',
    });
  });
});

describe('EmptyFolder and EmptySegment (#908, R-SYS-4)', () => {
  it('shows the bird 52, the line and the Add and Ask Bower links', () => {
    const onAsk = vi.fn();
    void act(() => {
      render(h(EmptyFolder, { onAsk }), host);
    });
    const bird = host.querySelector('.empty-folder svg');
    expect(bird?.getAttribute('width')).toBe('52');
    expect(host.querySelector('.empty-folder-title')?.textContent).toBe(
      'Nothing here yet.',
    );
    expect(host.querySelector('.empty-folder-text')?.textContent).toBe(
      'Add something, or ask Bower to write about this folder. Add · Ask Bower',
    );
    expect(
      host.querySelector('a.empty-folder-link')?.getAttribute('href'),
    ).toBe('/add');
    void act(() => {
      host
        .querySelector<HTMLButtonElement>('button.empty-folder-link')
        ?.click();
    });
    expect(onAsk).toHaveBeenCalled();
  });

  it('says what the empty inbox is for, with Add only (#1004)', () => {
    void act(() => {
      render(h(EmptyFolder, { onAsk: vi.fn(), inbox: true }), host);
    });
    expect(host.querySelector('.empty-folder-title')?.textContent).toBe(
      'Nothing waiting.',
    );
    expect(host.querySelector('.empty-folder-text')?.textContent).toBe(
      'Things you add land here until the next tidy-up. Add',
    );
    expect(
      host.querySelector('a.empty-folder-link')?.getAttribute('href'),
    ).toBe('/add');
    expect(host.querySelector('button')).toBeNull();
  });

  it('writes the empty segment lines with no bird', () => {
    void act(() => {
      render(h(EmptySegment, { segment: 'originals' }), host);
    });
    expect(host.textContent).toBe(
      'No originals here. Everything in this folder was written by Bower.',
    );
    expect(host.querySelector('svg')).toBeNull();
    expect(EMPTY_COPY.bower).toBe('Nothing by Bower here yet.');
  });
});
