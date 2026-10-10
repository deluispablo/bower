# Packet: P4-81 review (create-named, written by Codex; DEFECTS new-folder-first-letters (b), entry 1)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-create-named`. You may run `pnpm exec vitest run src/features/files --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...create-named`: `src/features/files/file-actions.ts` (`createNamed`, `open` hoisted), `NameSheet.tsx`, `file-actions.test.tsx`, notes and compatibility rows.
- **Contract:** `docs/harness/2026-10-10-create-named-packet.md`; the diagnosis `docs/harness/2026-10-10-new-folder-first-letters-diagnosis.md` (option (b)).

## Look hardest at

- No behaviour change for NameSheet: same `vault.create` call and arguments, same strings ("The folder was not made. Try again.", the slash toast), same navigation on success and on a failed-but-applied create, same focus; the note branch untouched.
- One home: createNamed is the only named-folder create; no copied name rules; `open` hoisting keeps `useMemo` identity semantics.
- The red fails for the stated reason before the fix (an assertion, not a load error) and pins one call plus the refusal sentence.

Already run by the coordinator: pnpm check and e2e (v2-name-sheet, qa7, qa9, qa12) on demo and fake.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
