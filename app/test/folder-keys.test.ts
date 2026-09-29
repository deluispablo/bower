import { describe, expect, it } from 'vitest';

import { folderKeyAction, rowDate } from '../src/folder-keys.js';
import type { KeyContext, KeyInput } from '../src/folder-keys.js';

const ctx: KeyContext = {
  selected: 1,
  count: 4,
  columns: 1,
  canGoUp: true,
  typing: false,
  onControl: false,
};

function key(name: string, extra: Partial<KeyInput> = {}): KeyInput {
  return { key: name, ctrlKey: false, metaKey: false, altKey: false, ...extra };
}

describe('folderKeyAction', () => {
  it('moves the selection with the arrows and stops at the ends', () => {
    expect(folderKeyAction(key('ArrowDown'), ctx)).toEqual({
      type: 'select',
      index: 2,
    });
    expect(folderKeyAction(key('ArrowUp'), ctx)).toEqual({
      type: 'select',
      index: 0,
    });
    expect(folderKeyAction(key('ArrowUp'), { ...ctx, selected: 0 })).toEqual({
      type: 'select',
      index: 0,
    });
    expect(folderKeyAction(key('ArrowDown'), { ...ctx, selected: 3 })).toEqual({
      type: 'select',
      index: 3,
    });
  });

  it('starts at the first row (or the last) when nothing is selected', () => {
    const none = { ...ctx, selected: -1 };
    expect(folderKeyAction(key('ArrowDown'), none)).toEqual({
      type: 'select',
      index: 0,
    });
    expect(folderKeyAction(key('ArrowUp'), none)).toEqual({
      type: 'select',
      index: 3,
    });
  });

  it('moves by a line in the grid and by one with left and right', () => {
    const grid = { ...ctx, columns: 3, selected: 0 };
    expect(folderKeyAction(key('ArrowDown'), grid)).toEqual({
      type: 'select',
      index: 3,
    });
    expect(folderKeyAction(key('ArrowRight'), grid)).toEqual({
      type: 'select',
      index: 1,
    });
    expect(folderKeyAction(key('ArrowRight'), ctx)).toBeNull();
  });

  it('Space is quick look, Enter opens, Backspace goes up', () => {
    expect(folderKeyAction(key(' '), ctx)).toEqual({ type: 'quick-look' });
    expect(folderKeyAction(key('Enter'), ctx)).toEqual({ type: 'open' });
    expect(folderKeyAction(key('Backspace'), ctx)).toEqual({ type: 'up' });
    expect(folderKeyAction(key('Backspace'), { ...ctx, canGoUp: false })).toBe(
      null,
    );
  });

  it('leaves Enter and Space to a focused link or button', () => {
    const onControl = { ...ctx, onControl: true };
    expect(folderKeyAction(key('Enter'), onControl)).toBeNull();
    expect(folderKeyAction(key(' '), onControl)).toBeNull();
  });

  it('does nothing while typing, and finds the search keys', () => {
    expect(folderKeyAction(key('ArrowDown'), { ...ctx, typing: true })).toBe(
      null,
    );
    expect(folderKeyAction(key('/'), ctx)).toEqual({ type: 'search' });
    expect(folderKeyAction(key('k', { ctrlKey: true }), ctx)).toEqual({
      type: 'search',
    });
    expect(folderKeyAction(key('ArrowDown', { altKey: true }), ctx)).toBeNull();
  });

  it('does nothing on an empty folder except go up and search', () => {
    const empty = { ...ctx, count: 0, selected: -1 };
    expect(folderKeyAction(key('ArrowDown'), empty)).toBeNull();
    expect(folderKeyAction(key('Backspace'), empty)).toEqual({ type: 'up' });
  });
});

describe('rowDate', () => {
  const now = new Date(2026, 8, 28, 15, 0).getTime();
  it('shows the time today and the day otherwise', () => {
    expect(rowDate(new Date(2026, 8, 28, 10, 42).toISOString(), now)).toBe(
      '10:42',
    );
    expect(rowDate(new Date(2026, 8, 27, 10, 42).toISOString(), now)).toBe(
      'Sep 27',
    );
  });
  it('is empty without a date', () => {
    expect(rowDate(undefined, now)).toBe('');
    expect(rowDate('nonsense', now)).toBe('');
  });
});
