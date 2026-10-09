# Packet: P4-63 review (c4-precheck-runner, written by Codex; defect done-precheck-matches-words)

This review is read-only and fresh. Run unit tests only: never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-precheck`.

## What to review

- **Diff:** `git diff claude/p3...c4-precheck-runner`: the red 80bb1559, the fix 835eb3f5 and the notes 4c5f7bc2.
- **Packet:** `docs/harness/2026-10-09-c4-precheck-runner-packet.md`. **Defect:** DEFECT_LOG `done-precheck-matches-words`.

## Look hardest at

- **One helper (`withoutTestNames`)** strips the quoted `-t`/`-g`/`--grep`/`--testNamePattern` values before the runner or package is decided. Check that it is used at every site that reads a verify's text: `isE2e`, `patterns`' package match, `selectedTests`' words, and the `named` check in `problems`. Is any site missed, or is there a second copy?
- **The regex.** Single and double quotes, escaped quotes, the `=` form, and several names in one part. Does `selectedTests` still find the file filters, now that the names are blanked?
- **Unchanged behaviour.** A real playwright, `e2e-both.sh`, `pnpm e2e*` or `pnpm -C api|runner` verify keeps its kind. Run `node scripts/precheck-verify.mjs c4-precheck-runner c4-lockf` and the harness tests.
- **The red** fails before the fix on an assertion (`/tmp/precheck-red.log`), and its name matches the packet exactly.
- **Housekeeping:** `tests changed:` lines, and no `.only` or `.skip`.

Already run by the coordinator: `pnpm check` green, and the precheck for this entry ok.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
