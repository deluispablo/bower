import { describe, expect, it } from 'vitest';

import { demoTourSeenAt, setDemoTourSeenAt } from '../src/demo/store.js';

/** A minimal in-memory `Storage`, without needing jsdom's real one. */
function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

/** A `Storage` whose every method throws, as a blocked storage would. */
function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    clear: () => {
      throw new Error('blocked');
    },
    key: () => {
      throw new Error('blocked');
    },
    get length(): number {
      throw new Error('blocked');
    },
  };
}

describe('demoTourSeenAt', () => {
  it('is undefined on a first visit (nothing stored yet)', () => {
    expect(demoTourSeenAt(makeStorage())).toBeUndefined();
  });

  it('is the value set by setDemoTourSeenAt', () => {
    const storage = makeStorage();
    const seen = '2026-09-27T10:00:00.000Z';
    setDemoTourSeenAt(storage, seen);
    expect(demoTourSeenAt(storage)).toBe(seen);
  });

  it('is undefined when the storage throws', () => {
    expect(demoTourSeenAt(throwingStorage())).toBeUndefined();
  });
});

describe('setDemoTourSeenAt', () => {
  it('does not throw when the storage throws (best effort)', () => {
    expect(() =>
      setDemoTourSeenAt(throwingStorage(), '2026-09-27T10:00:00.000Z'),
    ).not.toThrow();
  });
});
