# Technical-lead decision TL-P3-2026-10-07-15: process admission and the status revision

**Coordinator questions, 2026-10-07:** six points before writing the `worker-process-admission` and `worker-status-revision` packets. The coordinator's drafts are adopted with the changes below, and the [Worker contract](../specs/2026-10-04-worker-contract.md) is updated to match.

1. **`requestId`.** The app makes one per press of Tidy up (`crypto.randomUUID()` fits: lowercase letters, digits and dashes, at most 64) and sends it on every retry of that press.
   - A repeat with the same `requestId` returns that request's run, even after the run has ended.
   - The first request's scope and `allowWeb` win: a repeat never changes a run.
   - A request with no `requestId` counts as new. It is still safe, because one active run per person returns the run already going.
   - This is the standard idempotency-key pattern ([IETF draft, Idempotency-Key](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)). The key goes in the body because the contract carries everything else there.
2. **`nothing` waits for the manifest.** Admission does not read Drive in this entry. The 409 `nothing` comes with `spine-admission-manifest` (P3-D), and until then the app keeps its client-side guard.
3. **A run never blocks forever.** The original's staleness thresholds are reused: queued 17 min, running 30 min.
   - Expiry is written, not only computed. When `/process` or `/status` finds a stale run, the person object marks it failed `stale` once, in the same synchronous section, and raises the revision. The next admission then sees it closed.
   - `worker-stale-run-recovery` tunes the thresholds from R3's timings and the job's `started_at`/`completed_at` ([TL-P3-12](2026-10-07-tl-p3-12-r3-r4-and-p3-6-close.md)).
4. **The quota is adopted as drafted.** An atomic per-UTC-day counter sits in the same synchronous section as admission. It rises only when a new run is admitted, never on a repeat or a refusal. Over `DAILY_RUN_LIMIT` the answer is 429 `rate-limited`.
5. **The revision's server half folds into admission; the client half stays its own entry.**
   - **Server half, in admission.** The control row's `status_revision` rises with every write to the person's runs: admit, expire, and later each runner report. Admission is the first writer, and retrofitting the revision later would touch every writer. `POST /process` and `GET /status` both answer `{ run, revision }`.
   - **Client half, in `worker-status-revision`.** The client drops an answer whose revision is lower than the last it took. That replaces the ticket order in `runs.ts` for the real source, and the fake does the same. It also has the contract tests for out-of-order answers.
   - Refusing out-of-order runner reports belongs to `worker-runner-tickets`.
6. **The fence:** `/process` mounts `requireLease`, as [TL-P3-14](2026-10-07-tl-p3-14-lease-and-limits.md) says.

**Delete, confirmed as built:** the revoke at Google comes first, then `person.forget()` with a re-migrate, then 204 with the cookie cleared. A failed revoke does not block (TL-P3-14 addendum).
