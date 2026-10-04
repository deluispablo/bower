/**
 * What this device keeps about the person signed in, and forgetting it at
 * sign-out: what they have seen, dismissed and bookmarked, open folders and
 * an unsent Add draft (names and links). Settings like the theme stay: they
 * belong to the device, not the person.
 */
const PERSON_LOCAL = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away'];
const PERSON_SESSION = ['bower:add-draft', 'bower:add-items', 'bower:toured'];

export function forgetThisPerson(): void {
  try {
    PERSON_LOCAL.forEach((k) => localStorage.removeItem(k));
    PERSON_SESSION.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    // Storage blocked: there was nothing kept to forget.
    console.error(e);
  }
}
