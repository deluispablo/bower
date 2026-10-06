import { describe, expect, it } from 'vitest';
import { SET_ASIDE } from './fake/fake-runner';
import { SET_ASIDE_TEXT, setAsideOf } from './pile-readiness';

describe('a set-aside pile shows its reason in the inbox', () => {
  it('in the same words as the tidy-up report', () => {
    expect(SET_ASIDE_TEXT).toEqual({
      'not-arrived': SET_ASIDE.notArrived,
      'not-checked': SET_ASIDE.notChecked,
      unreadable: SET_ASIDE.unreadable,
      changed: SET_ASIDE.changed,
      declaration: SET_ASIDE.declaration,
      empty: SET_ASIDE.empty,
    });
  });

  it('for the reasons the runner reads, in its order', () => {
    const some = { things: 1, text: '', restore: false };
    const none = { things: 0, text: '', restore: false };
    expect(setAsideOf('unmarked', null, none)).toBeNull();
    expect(setAsideOf('conflict', null, some)).toBe('declaration');
    expect(setAsideOf('missing', null, some)).toBe('not-checked');
    expect(setAsideOf('unreadable', null, none)).toBe('unreadable');
    expect(setAsideOf('found', 'changed', none)).toBe('changed');
    expect(setAsideOf('found', 'not-arrived', some)).toBe('not-arrived');
    expect(setAsideOf('found', 'not-checked', some)).toBe('not-checked');
    expect(setAsideOf('found', null, none)).toBe('empty');
    expect(setAsideOf('found', null, { ...none, text: 'Receipts' })).toBeNull();
    expect(setAsideOf('found', null, { ...none, restore: true })).toBeNull();
    expect(setAsideOf('found', null, some)).toBeNull();
  });
});
