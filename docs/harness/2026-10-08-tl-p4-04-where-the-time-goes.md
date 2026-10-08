# Technical-lead decision TL-P4-2026-10-08-04: where the time goes, from the Worker's logs

**Evidence, 2026-10-08:** a live `wrangler tail` on staging `67d09cf`, covering the three C04 Claude runs.
- **Admission takes 20–24 s, and almost all of it is our own reading.** The admission lines read `reads=19733ms`, `23414ms` and `23474ms`; the session, check and admit steps take tens of milliseconds, and dispatch about 0.45 s. The "27 s from the press to the job" is the Worker reading the inbox and pile notes, not GitHub's queue (R3 measured 2 s there).
- **The checkpoint cost is the attempt check.** Before every fenced write the runner calls `GET /runner/runs/:id/token` (TL-P3-19 amendment), and these calls arrive every 1–2 s. That route serves a Drive access token, and one call failed with "Network connection lost" inside the person object.
- **Run 3 lost its dispatch.** "tidy dispatch failed: network error" after 40 ms, so the run sits queued until the 17-minute alarm redispatches it.

The model step itself took 2–3 s, 1 turn and about 6k tokens.

## Batch P4-4

1. **`admission-reads-cost`** (`bower-escalated`).
   - **Profile the reads,** then use one `files.list` per folder with only the needed fields, and read pile notes in parallel with bounded concurrency ([Drive API, performance tips](https://developers.google.com/workspace/drive/api/guides/performance)).
   - **Target:** admission under 3 s on the corpus folder.
   - The manifest rules and the readiness agreement of TL-P3-25 stay as they are.
2. **`attempt-check-light`** (`bower-escalated`).
   - **A new light route,** `GET /runner/runs/:id/attempt`, answers from the person object alone, with no Google call. The runner uses it before every fenced write.
   - **The token route** is called only when the Drive token is near expiry, and the runner keeps the token in memory until then.
   - **Unchanged:** the fence. A superseded attempt still gets 409 `stale-attempt`, and the recovery tests are the bar.
3. **`dispatch-retry`** (`bower-implementer`).
   - **On a network error or 5xx,** the Worker retries the dispatch twice with backoff. If it still fails, the alarm is set to 60 s, not 17 minutes, and redispatches then.
   - **A duplicate dispatch is harmless,** because the concurrency group and the ticket fence handle it (R3, TL-P3-18).

**Next:** after P4-4, three more C04 runs to compare with the original's numbers ([p4-speed-baseline.md](p4-speed-baseline.md)). The C04 quality check is noted: run 1 wrote the note with all four dates.

**Addendum, 2026-10-08: ticket hashes after Delete me.** Accepted. To keep "a wrong ticket gets 401" after Delete me, `forget()` keeps the live ticket rows for at most their 60-minute life. This is the same shape as the generation floor ([TL-P3-14](2026-10-07-tl-p3-14-lease-and-limits.md)): non-personal values kept only so revocation stays correct. Conditions:
- a kept row holds only the SHA-256 hash, its expiry and the attempt number: no Drive token, folder, name or address;
- expired rows are pruned, so an hour after Delete me no ticket row is left;
- a test proves both: after Delete me a valid ticket gets gone, a wrong ticket gets 401, and after expiry the rows are gone.
