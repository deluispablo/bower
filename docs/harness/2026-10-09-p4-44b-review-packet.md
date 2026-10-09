# Packet: P4-44b check (c3-reply-schema fix round)

Starting model: Opus, fresh and read-only. Unit, runner and contract tests only; never start a server, run e2e or call the claude CLI. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-rs`.

- **Diff:** `git diff 6d56157b..46627bad` (red `358476d4`, fix `8dd8a5dc`, notes `46627bad`). The merge `6d56157b` brought in claude/p3. The whole entry is `f20c4d3c..46627bad`.
- **Findings:** `/private/tmp/p4-44-review-notes.md` (P4-44 BLOCK).
- **Rulings (TL-P4-14 addendum 22):**
  1. Strict on write, lenient on read: 8×200 for what Bower writes (`next`), 20×400 for what it reads (`previous`, a person's state, stored manifests). Every stored v2 manifest still parses.
  2. `--json-schema` stays off the CLI. The retry stays as before, the zod declaration stays, and the `structured_output` branch is gone.
  3. The order of the first refusal kind is accepted.
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Lead asks:** state where the lines went. The entry's net is +288/-168 = +120 (claude.ts +97). Say whether +97 in claude.ts is the declaration replacing hand checks, or a second copy of anything.
- **Also check:**
  - the `RunnerWrite` union typing keeps `Effect.path` typed;
  - the RUNNER_WRITES test drives the provider run;
  - the compatibility rows exist for the contract commits;
  - the goldens are unchanged.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-44b-review-notes.md`.
