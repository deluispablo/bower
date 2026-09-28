// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearOpened,
  loadOpened,
  recordOpened,
} from '../src/switcher-store.js';

beforeEach(() => {
  localStorage.clear();
});

describe('the opened-lately list', () => {
  it('keeps the newest first and forgets on clearOpened', () => {
    recordOpened('a');
    recordOpened('b');
    expect(loadOpened()).toEqual(['b', 'a']);
    clearOpened();
    expect(loadOpened()).toEqual([]);
    expect(localStorage.getItem('bower.opened.recent')).toBeNull();
  });
});
