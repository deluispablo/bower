# Packet: P4-43b check (c3-subject fix round)

Starting model: Opus, fresh and read-only. Unit tests only; never start a server or run e2e. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-subj`.

- **Diff:** `git diff 33963342..655040ed` (red `7a7895ed`, fix `0378e601`, notes `655040ed`). The merge `33963342` brought in claude/p3. The whole entry is `e48bd296..655040ed`.
- **Findings:** `/private/tmp/p4-43-review-notes.md` (P4-43 PASS with minors). Two were taken into this round:
  - the rule test scanned the repo inside vitest;
  - `related()` + `sameContent()` were repeated inline.
- **Rulings:** TL-P4-17 addenda 3 and 4. Syntax rules have one home, ESLint. Vitest keeps a fast fixture test of the rule only. A rule targets the behaviour or construction, never one spelling.
- **The fixed question:** second way? Your card must say "second way? no" or name it, for the question key, ESLint rules and the saved-Bin match.
- **Also check:**
  - the "left out" gap (`q-${K.ask}-` member expression, run-time prefixes): acceptable, or a hole that makes the rule a name check;
  - the three eslint configs share one rule module;
  - P4-43's PASS points still hold.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-43b-review-notes.md`.
