/**
 * What this device keeps about the person signed in, and forgetting it at
 * sign-out: what they have seen, dismissed and bookmarked, open folders and
 * an unsent Add draft (names and links). Settings like the theme stay: they
 * belong to the device, not the person.
 *
 * The journal outbox (`bower:outbox:<folder>`) stays at sign-out: its lines are
 * changes already made in that Drive folder, and dropping them would hide those
 * changes from the next tidy-up. They are keyed by the folder, so they only ever
 * go to it, the next time someone signed in to it uses this device.
 */
const PERSON_LOCAL = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away'];
const PERSON_SESSION = ['bower:add-draft', 'bower:add-items', 'bower:toured'];

/** The account is gone: the sign-in screen says so once (it reads and clears 'bower:bye'). */
export function sayGoodbye(): void {
  try {
    sessionStorage.setItem('bower:bye', '1');
  } catch (e) {
    // Storage blocked: the sign-in screen shows without the goodbye.
    console.error(e);
  }
}

export function forgetThisPerson(): void {
  try {
    PERSON_LOCAL.forEach((k) => localStorage.removeItem(k));
    PERSON_SESSION.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    // Storage blocked: there was nothing kept to forget.
    console.error(e);
  }
}
