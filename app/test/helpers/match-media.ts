/**
 * The one `matchMedia` stub the unit tests share (spec §7c item 7). jsdom has
 * no `matchMedia`; a test installs this instead of copying its own. Undo with
 * `vi.unstubAllGlobals()` in `afterEach`.
 */

import { vi } from 'vitest';

/** Which queries match: one answer for all, or a function of the query text. */
export type MatchMediaAnswer = boolean | ((query: string) => boolean);

/** The stub's handle: flip the answer and tell every listener about it. */
export interface MatchMediaStub {
  /** Answers the stub gives from now on; fires `change` on live lists. */
  set(answer: MatchMediaAnswer): void;
}

interface StubList {
  matches: boolean;
  media: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function resolve(answer: MatchMediaAnswer, query: string): boolean {
  return typeof answer === 'function' ? answer(query) : answer;
}

/** Installs a `window.matchMedia` that answers `answer`. */
export function stubMatchMedia(answer: MatchMediaAnswer): MatchMediaStub {
  let current = answer;
  const lists: { list: StubList; listeners: Set<() => void> }[] = [];

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string): StubList => {
      const listeners = new Set<() => void>();
      const list: StubList = {
        matches: resolve(current, query),
        media: query,
        addEventListener: (_type, listener) => {
          listeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          listeners.delete(listener);
        },
      };
      lists.push({ list, listeners });
      return list;
    }),
  );

  return {
    set(next: MatchMediaAnswer): void {
      current = next;
      for (const { list, listeners } of lists) {
        list.matches = resolve(current, list.media);
        for (const listener of [...listeners]) listener();
      }
    },
  };
}

/** A stub where only `query` matches: a width, `prefers-reduced-motion`. */
export function stubMatchMediaFor(query: string): MatchMediaStub {
  return stubMatchMedia((asked) => asked === query);
}
