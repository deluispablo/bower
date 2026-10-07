# Packet: P3-17 and P3-18 delta review (pile notes at admission, deploy hardening, compatibility, behaviour suites)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. Admission now reads the person's notes in the Worker, which raises privacy and contract questions. The new suites are the P3 claim that the real adapters behave like the fake. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff 0abbbac..<HEAD in your prompt> -- src api runner scripts docs/specs docs/harness/2026-10-07-p3-compatibility.md docs/harness/2026-10-07-p3-behavior-suites.md`. Per change:
  - `ba11eef`: deploy hardening (red `3cdd763`).
  - `3cc965f`: pile notes at admission, the all-held race, total as things (red `ae5d063`). It adds the optional report field `nothingReady`.
  - `2650a73` and `a5023a0`: P2 fixtures and the compatibility list (red `4b5626c`).
  - `c48186f`: the real-adapter suites, plus a one-line api import-rule fix in `src/architecture.test.ts`.
  - The coordinator's change-list test now skips merge commits.
- **Contracts:**
  - [TL-P3-25](2026-10-07-tl-p3-25-pile-notes-and-the-last-p3-e-entries.md) and TL-P3-21;
  - the `POST /process` row and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`;
  - the packets `2026-10-07-p3-17-*` and `2026-10-07-p3-18-*`.
- **Look hardest at:**
  - **Pile notes in the Worker.**
    - Can any note text reach storage, a log line, an error cause or a reply?
    - Do admission and the runner now hold exactly the same piles? Look for cases where they still differ, such as a words-only pile with no folder to guess.
    - Is the 409 "Nothing in the inbox is ready yet." reached before any quota count?
    - Does the all-held race end `done`, with `waiting` dispositions, and never `failed`?
    - Is `nothingReady` safe to add: does the accepted app read a report that carries it?
    - Is `total` counted as things on every path, including a resume?
  - **Deploy hardening.** Can an env file still slip through, for example `.env.staging` with `--mode`, or one in `runner/`? Is the upload-line match strict?
  - **Compatibility.**
    - Were the fixtures really generated from `00ec9a5`, as their README says?
    - Does every `.bower` shape and journal line kind have one?
    - Could the "read the same" test pass while a field changed meaning?
    - Should the change-list test skip merges?
  - **Suites.**
    - Do the real-adapter worlds use the real `DriveHttp`, `WorkerHttp`, Worker routes and `Person`, or do shims hollow them out (`node:sqlite`, a `timingSafeEqual` shim, a mocked `cloudflare:workers`)?
    - Does each of the six cases fail when its guard is broken?
    - Is the `architecture.test.ts` change sound?
- **Run:** single test files only, one at a time. Make reproductions in your own worktree under `/private/tmp/p3-18-review/`, and remove it afterwards. Never run `scripts/deploy-staging.sh` outside its test, `wrangler`, `gh`, or any network call.
- **Reply:** the review card in `docs/harness/WORKER.md`.
