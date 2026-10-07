# Technical-lead decision TL-P3-2026-10-07-24: the first real runs, and the rest of P3

**Result, 2026-10-07, staging `16738e1`:**
- **First real run.** A tidy-up as A was dispatched in 6 s and done in 2m07s. The note was filed and its pile went to the Bin.
- **Cancel-and-recover.** The run was cancelled on Actions with no app open. The alarm redispatched it exactly once, 4 s after the deadline, and attempt 2 finished it with one filed note, one checkpoint chain and `last-run.json` done.

C12's dispatch, recovery without the browser and duplicate-free resume hold live.

## The findings

1. **`dispositions-match-report`** (`bower-escalated`): `dispositions.json` said `set-aside` for a pile file that was filed. The dispositions and the report must come from the same record.
2. **`runner-reports-reading-total`** (`bower-implementer`), in parallel with 1: the runner never reports `reading` with `total`, as the contract asks.
3. **"Try again" keeps the failed run's scope.** It retries that run, which is the P2 behaviour. It is rechecked in the C16 walk.

## The rest of P3, in order

The open P3_DRAFT entries are registered now, batch by batch:
1. **P3-E, the app on real adapters.**
   - **`upload-queue-real`** folds in the open `upload-queue-persistent`. The bytes stay on the device until Drive confirms, the upload resumes from the server's offset (R4 Part B), and it never makes two files (R4 Part A). If the browser lost the stored bytes, the person is asked to choose the file again; nothing is silently dropped. This settles the "retained bytes or reselect" question with the accepted P2 entry's choice.
   - **`declare-piles-real`**, in parallel.
   - Then **`behavior-suites-real-adapters`** (the shared behaviour suites against the real adapters, including browser close, revoked auth, duplicate dispatch, expired attempts and lost callbacks) and **`compatibility-accepted-app`**.
2. **P3-F, operations, in parallel with P3-E when a slot frees.**
   - **`deploy-and-migrations`** turns the STAGING runbook and the person-object schema steps into one script, with the production guards.
   - **`runbook-p3`** covers setup, secrets, rotation, deletion and recovery.
   - **`security-review`** runs at the freeze, over the Worker and the runner. It includes pinning Actions by commit SHA (TL-P3-23) and the P4 rate-limit note (TL-P3-14).
3. **P3-G, the close.**
   - Freeze, then run the four suites.
   - Run the cross-provider review on the TL-P2-46 fallback (TL-P3-16).
   - Run the C16 walk on staging, phone and desktop, by keyboard, on a fresh origin.
   - Write the dossier.

The C16 walk comes last, on the frozen SHA, never before P3-E.
