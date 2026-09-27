import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  currentToast,
  dismissToast,
  showToast,
  TOAST_LIFETIME_MS,
} from '../src/toast-store.js';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    dismissToast();
    vi.useRealTimers();
  });

  it('shows a toast and clears it after its lifetime', () => {
    showToast('Unpinned');
    expect(currentToast()?.message).toBe('Unpinned');
    vi.advanceTimersByTime(TOAST_LIFETIME_MS - 1);
    expect(currentToast()?.message).toBe('Unpinned');
    vi.advanceTimersByTime(1);
    expect(currentToast()).toBeNull();
  });

  it('keeps the link when there is one', () => {
    showToast('3 files processed', { href: '/folder/Answers', label: 'See' });
    expect(currentToast()?.link).toEqual({
      href: '/folder/Answers',
      label: 'See',
    });
  });

  it('closes at once on dismiss', () => {
    showToast('Pinned to Home');
    dismissToast();
    expect(currentToast()).toBeNull();
  });

  it('a new toast replaces the old one with its own full lifetime', () => {
    showToast('Pinned to Home');
    const first = currentToast()?.id;
    vi.advanceTimersByTime(TOAST_LIFETIME_MS - 1_000);
    showToast('Pinned to Home');
    expect(currentToast()?.id).not.toBe(first);
    vi.advanceTimersByTime(1_000);
    expect(currentToast()?.message).toBe('Pinned to Home');
    vi.advanceTimersByTime(TOAST_LIFETIME_MS);
    expect(currentToast()).toBeNull();
  });
});
