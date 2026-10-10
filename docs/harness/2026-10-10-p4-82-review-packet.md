# Packet: P4-82 review (c5-remove-new-note, written by Codex; TL-P4-33/35)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-remove-new-note`. You may run `pnpm exec vitest run src/features --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...c5-remove-new-note`: the removal of New note (menus, buttons, store, actions), e2e changes (no-new-note, qa5/qa6/qa7/qa9, v2-name-sheet), `harness/features.json` (seven closed entries reopened with new verifies), notes and compatibility rows.
- **Contract:** `docs/harness/2026-10-10-c5-remove-new-note-packet.md`; TL-P4-33/35 in DECISIONS; the lead's ruling on new-folder-first-letters (the immediate-typing e2e moved to tree-name-first; create-name-speed stays open until then).

## Look hardest at

- New note is gone from every surface (desktop tree menus, header, phone sheets, palette, empty folder, shortcuts) and no dead code is left behind (`removed:` lines); Add/upload and New folder still work.
- Each reopened entry's new verify pins behaviour that still exists, on its surviving surface, with no weaker assertion than before (new-note-opens, new-note-escape, weak-tests, namesheet-names, v2-name-sheet, c4-e2e-sync; create-name-speed open with its note).
- The axe scan scoped to `main` on /files only excludes the pre-existing right-panel heading-order (DEFECT files-heading-order); menus and sheets keep their own scans.
- The new tests (Escape on a new folder, empty-folder New folder naming, name-sheet dots/slashes, one .md on rename) assert the real behaviour, not a wait-and-fill that hides a defect.

Already run by the coordinator: pnpm check green; e2e on demo green, fake green except a pre-existing empty-note-help flake (DEFECT empty-note-help-flaky, 1/10 on claude/p3).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
