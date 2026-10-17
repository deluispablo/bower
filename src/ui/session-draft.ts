import { useState } from 'react';

/**
 * Words being typed, kept for the tab across reloads (sessionStorage ends with the tab). Each key is listed in
 * `PERSON_SESSION` (`data/device.ts`) so sign-out forgets it; an empty value removes the key.
 * The third item clears the words only while they are still exactly `sent`: a save that ends late never clears newer
 * words, on this screen or on one opened again after leaving (qa-live-claude F2).
 */
export function useSessionDraft(key: string): [string, (v: string) => void, (sent: string) => void] {
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
  const clearIf = (sent: string): void => {
    // The latest words in memory, not this render's: the save may end many renders later.
    setTextState((now) => (now === sent ? '' : now));
    try {
      if (sessionStorage.getItem(key) === sent) sessionStorage.removeItem(key);
    } catch {
      // expected: Without storage only the words in memory are compared.
    }
  };
  return [text, setText, clearIf];
}
