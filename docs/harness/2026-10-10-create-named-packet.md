# Packet: create-named (DEFECTS new-folder-first-letters, ruling (b), entry 1 of 2)

- **Entry:** `create-named`. Worktree `/private/tmp/bower-create-named`, branch `create-named` from `claude/p3`. Codex implements; a Claude review. `ui: false` (no visible change).
- **Ruling:** DEFECTS new-folder-first-letters (b) on main; diagnosis `docs/harness/2026-10-10-new-folder-first-letters-diagnosis.md`.
- **Why:** the app has two orders for one act (NameSheet names first and creates once; the tree creates first, then renames). Entry 1 gives the name-first create one home, so entry 2 can reuse it.

## Contract

1. Move NameSheet's create part (NameSheet.tsx:43-51: `vault.create(folder, 'folder', name)`, its refusal handling, toast and navigation) into one `createNamed(folder, name)` in `src/features/files/file-actions.ts` beside `create`. NameSheet calls it. No behaviour change: same calls, same strings, same errors, same focus and navigation.
2. One home: no copy of the name checks; NameSheet's validation (empty, slash, leading dot, taken) stays where it is today unless it is already in file-actions.
3. Compatibility row for each commit under src/features (docs/harness/2026-10-07-p3-compatibility.md): "none: refactor".

## Red

A unit test (vitest + testing-library, as file-actions.test.tsx:58) that `createNamed('Resources', 'Garden plans')` calls `vault.create('Resources', 'folder', 'Garden plans')` exactly once and reports a refused create with NameSheet's sentence; it fails now because `createNamed` does not exist (an assertion, not a load error: import the module and check the export). NameSheet's existing tests stay green unchanged.

## Verify

The red by exact name, NameSheet's existing tests, `pnpm check`; e2e qa7 "New folder in an empty folder asks for a name, then opens the folder" and v2-name-sheet on demo and fake.

## Commits

Red (tests only), fix, notes (`docs/harness/2026-10-10-create-named-notes.md`, line 3 `implementer: codex`, `removed:` lines).
