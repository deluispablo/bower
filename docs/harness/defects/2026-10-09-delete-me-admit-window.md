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

## Ruling (lead, DECISIONS main 314380d)
- The fix goes in the one admission path and reuses the existing generation floor; no new mechanism.
- Admission records the person's generation when it starts. admitSync, in its synchronous section, refuses if the account is gone or the generation moved: no run row, no quota, no manifest, and a gone answer.
- Tests: a forget during the admission reads, on the alarm path and on /process. They are folded into the c2-worker-dispatch fix round: "a Delete me during the alarm's admission reads admits no run" and "a Delete me during a press's admission reads admits no run".
- The v13/v14 deploy skew is accepted (rollout only; skew answers 503 since c1-worker-routes).
