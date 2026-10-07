# Packet: runner-restart-truth-fix (P3-12 review fix)

Starting model: `bower-escalated` (Opus). Reason: the P3-12 delta review blocked on one Important finding: a run that changed things still says nothing changed ([ARCHITECTURE](../ARCHITECTURE.md) invariant 6). The fix applies the rule the [TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) addendum already adopted, so no new ruling is needed.

- **Entry:** `runner-restart-truth-fix`. Checkout `/private/tmp/bower-p3-restart`, branch `claude/p3-restart`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `new-instance.sh` against a real repository.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and TL-P3-22 with its addendum;
  - `runner/src/main.ts`, `runner/src/spine/run.ts`, `runner/src/effects.ts`, `runner/src/status.ts`;
  - `scripts/new-instance.sh` and `runner/test/new-instance.test.ts`.
- **Acceptance contract:**
  - **Restart truth (Important).**
    - Today a later runner on the same run (the same attempt again, or attempt + 1) whose first Drive read fails (`shownDone` or `records.found`) has an empty `seen.chain`. It posts `failed` with `B_FAILURE` even though attempt 1 applied effects and reported `saving`.
    - The nothing-changed rule must hold only when the runner **read** its run's chain, and found no applied outcome in it.
    - When the chain could not be read, the runner sends no `failed`. It throws, so the job fails visibly, and the Worker's recovery decides.
    - A run that never left a phase below `saving` and cannot read its chain also sends nothing; recovery's `STALE_FAILURE` covers it.
  - **Possible effect before the check (minor).**
    - Today `possible-effect` is committed before `check()` reads. A failed read leaves an operation that was never sent counted as changed.
    - Fix it so that an operation counts as possibly sent only once its send was attempted.
    - Keep the evidence read before any resend.
  - **new-instance.sh (minor).**
    - An OWNER/NAME that starts with `-` is refused whether typed at the prompt or given on the command line.
    - The test removes its `bower-instance-*` temp folders.
  - **Named tests, red first** (commit them on their own before the fix):
    - `a restarted runner that cannot read its folder never says nothing changed`, built from the reviewer's repro: attempt 1 applies 2 effects with `StubEffects` `breakAfter=2` and stops in `saving`; then the same attempt runs again and Drive throws on the first read. The statuses must never include `failed` with `B_FAILURE`.
    - `a check that cannot read never counts as a change`.
    - `new-instance refuses a repository that looks like a flag`.
  - **Files in scope:** `runner/src/**`, `runner/test/**`, `scripts/new-instance.sh`. If you touch `src/data/spine/**`, name it and say why.
- **Out of scope:** everything else, including the test Worker's ticket retirement and the `listedPiles` flag (both are on the polish list).
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e:fake` in full on private ports 5195–5198 (5197 if 5198 is held by the `/private/tmp/bower-p2-final` preview, which is not yours).
  - Never write `harness/` records, and never run `done.sh`, `wrangler` or `gh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
