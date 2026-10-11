# Packet: P4-117 review (next-steps-plain-list)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-next-steps-plain-list`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- src e2e`. The reds are 9c8e61b0 and 4de03d64, the implementation is 1465a126, and the e2e repair is de8ffea7.
- **Contract:** the packet `docs/harness/2026-10-11-next-steps-plain-list-packet.md`, including "Ruled (TL-P4-55 addendum 1)", and the spec `docs/design/specs/2026-10-11-next-steps-plain-list.md`.
- **Gates (codex-run):** pnpm check, plus e2e next-steps-plain-list on demo and fake, green on de8ffea7. Coordinator gates on 2b0ca0f9 also passed for app, capabilities, c05-person-notes and empty-note-help.

## Look hardest at

- One home. `Note.taskRegions` is optional and additive, filled only from B6a's projection by parseNote, DriveVault, demo and fake. The UI never parses regions, and there is no second parser and no mapping layer.
- An absent field means every task is the person's. Toggles keep global body indexes, and a tick never lands on a Bower item. b6a-task-regions.test.tsx is unchanged and passes.
- Bower items are plain list items, not disabled controls. Done items use md-done. There is no new copy.
- The e2e repair keeps every assertion. The fixture moved under a named folder because of a separate root-note breadcrumb defect; check that this hides nothing that this entry owns.
- The contract compatibility row is in docs/harness/2026-10-07-p3-compatibility.md.
- You may run `pnpm exec vitest run src/features/note src/data/contracts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the full review (findings with file:line and severity), then the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every card line under 120 characters.
