/**
 * `useMediaQuery` (#357): whether a CSS media query matches, following the
 * window as it is resized. For the few screens whose markup, not only
 * their styles, changes at a breakpoint (the Bower tab's three columns
 * from 1200 px). False where `matchMedia` is missing (tests, old browsers),
 * so the phone layout is the fallback.
 */

import { useEffect, useState } from 'preact/hooks';

/** Whether `query` matches right now; false without `matchMedia`. */
export function mediaMatches(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => mediaMatches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = (): void => {
      setMatches(list.matches);
    };
    onChange();
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, [query]);
  return matches;
}
