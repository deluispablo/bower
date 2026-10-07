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
