# delete-me-admit-window (Important)

Source: c2-worker-dispatch worker (left out), confirmed by the P4-27 Opus review (read-only), §4 of its notes. The review served as the diagnosis; no separate diagnoser ran.

## Cause
- `startWaiting` (api/src/person.ts:846) awaits `admission` (Drive reads). A `forget` (Delete me) that runs during that await empties runs, quota and the key-value entries.
- `admitSync` (person.ts:854) then runs. It does not check that the account still exists, so it inserts a run with its manifest, counts quota and arms `run`.
- `dispatchDue` then mints a ticket and dispatches. The runner gets null (not gone) from `runnerAccess`. The run row and the manifest stay after Delete me.
- The same window exists on `/process` (the press path): admission reads, then admitSync.

## Age
It predates c2-worker-dispatch: at 67e59d04, `startWaiting` did the same with `dispatchNew`. The synchronous `forget` does not widen the window.

## Effect
After Delete me, a run can start for the person, and a run row and manifest (personal) survive. The runner cannot act (no access), but stored data outlives a Delete me.

## Options (for the lead; the coordinator does not design)
Any fix belongs to the one admission path (`admitSync`), not a second check elsewhere.
