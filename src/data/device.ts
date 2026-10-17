/**
 * What this device keeps about the person signed in, and forgetting it at
 * sign-out: what they have seen, dismissed and bookmarked, open folders and
 * an unsent Add draft (names and links), unsent Tell Bower words and a pile note's unsaved words. Settings like the theme stay: they
 * belong to the device, not the person.
 *
 * The journal outbox (`bower:outbox:<folder>`) stays at sign-out: its lines are
 * changes already made in that Drive folder, and dropping them would hide those
 * changes from the next tidy-up. They are keyed by the folder, so they only ever
 * go to it, the next time someone signed in to it uses this device.
 */
import { forgetAll } from './draft-files';
import { forgetFailedInMemory } from './vault/journal';

const PERSON_LOCAL = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away', 'bower:failed-lines'];
const PERSON_SESSION = ['bower:add-draft', 'bower:add-items', 'bower:tell-draft', 'bower:tell-intent', 'bower:toured', 'bower:tabs', 'bower:tell-kind'];
/** Session keys kept one per thing, forgotten by their prefix: a pile note's unsaved words (`bower:pile-note:<pile>`). */
const PERSON_SESSION_PREFIX = 'bower:pile-note:';

/** The account is gone or the person signed out: the sign-in screen says so once (it reads and clears 'bower:bye'). */
export function sayGoodbye(reason: 'deleted' | 'signed-out' = 'deleted'): void {
  try {
    sessionStorage.setItem('bower:bye', reason === 'deleted' ? '1' : reason);
  } catch (e) {
    // Storage blocked: the sign-in screen shows without the goodbye.
    console.error(e);
  }
}

export function forgetThisPerson(): void {
  // Memory is independent of whether this device permits storage access.
  forgetAll();
  forgetFailedInMemory();
  for (const key of PERSON_LOCAL) {
    try { localStorage.removeItem(key); }
    catch (e) { console.error(e); }
  }
  let keyed: string[] = [];
  try { keyed = Object.keys(sessionStorage).filter((k) => k.startsWith(PERSON_SESSION_PREFIX)); }
  catch (e) { console.error(e); }
  for (const key of [...PERSON_SESSION, ...keyed]) {
    try { sessionStorage.removeItem(key); }
    catch (e) { console.error(e); }
  }
}
