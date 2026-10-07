# Technical-lead decision TL-P3-2026-10-07-11: the Drive behaviour suite's findings

**Result, 2026-10-07:** six of eight checks pass against real Drive on the synthetic probe folder: browse, pagination, search, name conflict, parent conflict, and Bin with restore.

## Rulings

- **F1, the changed-version check: rerun it as a task toggle.** C03's "edit supported fields/tasks" means the note screen's task checkbox (`vault.toggleTask`), which writes with the modifiedTime it read. Recipe:
  1. In the probe folder, a synthetic note with one task.
  2. Change the note outside the app through the Drive API.
  3. Toggle the task in the app. Expect "changed somewhere else" and no overwrite; a reload shows the outside change.

  Only this check reruns. The Inbox pile edit stays outside the probe.
- **F2, a lost reply is told untruthfully: new entry `lost-reply-reconcile`** (`bower-implementer`). When a write fails with a network error after the request may have reached Drive, the app re-reads the item before saying anything:
  - it matches the intended change: "Saved.";
  - it matches the old state: the usual offline sentence;
  - it can't be read: "Bower isn't sure that saved. Check again when you're back online."

  This is the standard way to handle an ambiguous outcome for a non-idempotent call: read back, never assume ([Google Cloud retry strategy, idempotency](https://cloud.google.com/storage/docs/retry-strategy#idempotency)). The tests use the fake Drive's lost-reply fault, for rename, move and task toggle.
- **F3, the `/status` banner: the Worker answers `GET /status` now.** While `/process` doesn't exist, the contract-true answer is `{ run: null }` from the person object. That goes into the queued `worker-logs-and-version` entry with a test. `worker-status-revision` later replaces it. `client-retry-policy` keeps its scope.
- **F4–F8 are Minor** and go to the P3 polish list. F4 (the Undo toast is too short) is to be reconsidered under [WCAG 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) at the P3 close.
- **The Drive scope is intended.** The P3 obligations name one OAuth client with the full `drive` scope for the app and the runner. That scope lets Bower read what the person puts into their folder by any means, which `drive.file` cannot. Narrowing it is a P4 production question: `drive` is a restricted scope that needs Google's verification for a public app. **Evaluator packets never read outside the probe or Bower folder.** The one listing outside it is noted; only fingerprints were printed and nothing was written.

## Amendment, 2026-10-07: no "Saved." sentence

The coordinator proposed that a read-back matching the intended change completes as a normal success, as if the reply had come: the index is updated, the journal is written once, and no sentence is shown. Accepted. The screens have no success sentence today, and a lost reply that landed is a success, so telling it differently would be inconsistent. The other three cases stand: the old state gives the offline sentence, an unreadable item gives "Bower isn't sure that saved…", and anything else takes the existing changed-elsewhere path.

## Amendment, 2026-10-07: the check 4 rerun

**Result.** As account A, the outside line was added (v3), then the task was toggled in the app (v5). Drive kept both. The app had refreshed its index before the toggle, so the write went through and no "changed somewhere else" appeared.

**Ruling: C03 "edit" passes, once the Drive half of the premise is on record.** The conflict check has two halves:
- **The comparison is the app's own code.** It refuses when Drive's current modifiedTime differs from the one in the index, and the fake-drive tests cover that branch.
- **The input comes from real Drive.** The premise is that an outside content edit moves modifiedTime. Google documents this (`modifiedTime`: "the last time the file was modified by anyone", [Files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)).

This run doesn't show that premise by itself. `toggleTask` reads the text fresh, so the outside line would have survived even if modifiedTime had not moved. The evidence therefore records the note's revisions from `revisions.list` on the probe note: the modifiedTime of v2, v3 and v5, showing v3 later than v2. This is one script call on the probe note, with no pane step.

Making the app stale on purpose in the pane is not attempted. It relies on timing a refresh, which is not reliable; the unit tests cover the stale branch.

**Minors, to polish:**
- Clicking the task's label does nothing. A native `<label>` should toggle its checkbox ([HTML label](https://html.spec.whatwg.org/multipage/forms.html#the-label-element)).
- The `fake-worker.test.ts` timeouts under load go to polish only as a note. If they fail the batch-close `pnpm check` on an idle machine, they become an entry.

**Noted, no action:**
- Drive can bump `version` without changing modifiedTime. The app compares modifiedTime only.
- The one name-exact folder search to find the probe folder is accepted. From now on, packets give the probe folder's id.
