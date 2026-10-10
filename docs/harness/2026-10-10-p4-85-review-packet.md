# Packet: P4-85 review (tree-name-first, written by Codex; DEFECTS new-folder-first-letters (b), entry 2)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-tree-name-first`. You may run `pnpm exec vitest run src/features/files src/app --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...tree-name-first`: Explorer.tsx, file-actions.ts (createNamed reporting to the box), NameSheet.tsx, NameForm.tsx and name-rules.ts (new), ui-store.ts, explorer.module.css; reds in tree-name-first.test.tsx, e2e/tree-name-first.spec.ts, qa7's restored guard, and the repaired no-new-note and qa6 tests; notes and compatibility rows.
- **Contract:** `docs/harness/2026-10-10-tree-name-first-packet.md` (the designer-signed rows are contract, strings word for word); the diagnosis `docs/harness/2026-10-10-new-folder-first-letters-diagnosis.md`.

## Look hardest at

- The name box exists and is focused before any await, for the row menu and the header; nothing is created before the name; Enter or a named blur creates exactly once through createNamed; Escape and an empty blur make nothing and return focus as signed.
- One naming flow: create-then-rename, justMade and discard for new folders are gone (`removed:` lines) with no dead code; name rules have one home (NameForm/name-rules), not copied; NameSheet's behaviour is unchanged (phone).
- A failed create keeps the typed name with "The folder was not made. Try again.", Enter retries, no toast; taken names and leading dots as NameSheet does.
- The red owner's test repairs (no-new-note's box name; qa6's relative locator, Escape proof and positive control) weaken nothing.

Already run by the coordinator: pnpm check; e2e (tree-name-first, no-new-note, qa6, qa7, qa9, qa12, v2-name-sheet) on demo and fake; the immediate-typing guard 20/20 on desktop.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
