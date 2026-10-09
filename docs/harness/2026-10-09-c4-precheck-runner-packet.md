# Packet: c4-precheck-runner (defect done-precheck-matches-words; harness, Codex)

- **Entry:** `c4-precheck-runner`. Worktree `/private/tmp/bower-c4-precheck`, branch `c4-precheck-runner` from `claude/p3`.
- **Ruling:** the lead, 2026-10-09 (by message, logged in DEFECT_LOG `done-precheck-matches-words`): detect the e2e runner from the command words only, never from text in a test name. This is the match-by-words class.
- **Starting model:** Codex, then a fresh Claude review. Size S.

## Contract

1. `isE2e` and `patterns` in `scripts/harness-rules.mjs:45-53` decide the runner from the command with its quoted `-t`/`-g`/`--grep`/`--testNamePattern` values removed first. A test name such as "e2e-both uses the same re-entry rule as with-lock" never makes a vitest command count as e2e.
2. The same holds at every other site that reads a verify's runner from its text. Check `:78` and `:156` and list each one in the notes. There must be one helper that strips the names, not a second copy.
3. Behaviour is otherwise unchanged. A real playwright, e2e-both.sh or `pnpm e2e*` command is still e2e.

## Red

Add to `src/harness.test.ts`, next to the existing harness-rules tests:
- `a test name that mentions e2e does not make a vitest verify an e2e one`: `patterns('pnpm exec vitest run src/harness.test.ts -t "e2e-both uses the same re-entry rule"')` gives kind `unit`.
- `a playwright verify is still e2e`: a guard for the e2e-both.sh and `pnpm e2e:fake` forms.

## Then

The coordinator puts the word back in c4-lockf's verify ("e2e-both uses the same re-entry rule as with-lock") and re-proves it with done.sh.

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-09-c4-precheck-runner-notes.md`), with `tests changed:` lines (or "none").
