import { useState } from 'react';

/**
 * Words being typed, kept for the tab across reloads (sessionStorage ends with the tab). Each key is listed in
 * `PERSON_SESSION` (`data/device.ts`) so sign-out forgets it; an empty value removes the key.
 */
export function useSessionDraft(key: string): [string, (v: string) => void] {
  const [text, setTextState] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? '';
    } catch {
      // expected: storage may be blocked (a private window); the default holds.
      return '';
    }
  });
  const setText = (v: string): void => {
    setTextState(v);
    try {
      if (v) sessionStorage.setItem(key, v);
      else sessionStorage.removeItem(key);
    } catch {
      // expected: Without storage the draft lasts while the screen is open.
    }
  };
  return [text, setText];
}
