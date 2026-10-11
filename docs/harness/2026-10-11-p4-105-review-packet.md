# Packet: P4-105 review (pile-binned-context-hold, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-pile-binned-context-hold`.

## What to review

- **Diff:** `git diff claude/p3...pile-binned-context-hold -- src` (red 1ac7a3bd; fix at HEAD). Notes: `docs/harness/2026-10-11-pile-binned-context-hold-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-11-pile-binned-context-hold-packet.md`; TL-P4-53 addenda 6 and 7 (DECISIONS); DEFECT_LOG pile-binned-context-hold.
- **Gates (coordinator):** pnpm check green; e2e app, inbox-first and capabilities pass on demo (35) and fake (61).

## Look hardest at

- There is one "binned counts as removed" predicate in pile-readiness. It is true for a journal `trash` line or for the one Bin lookup (addendum 6). The app (drive-vault) and the runner (plan.ts) both call it; there is no runner-only patch and no second rule.
- A note binned through Drive with ready things left gets the same answer on both sides: filed, or held with the reason shown. It is never held without a reason.
- A context only missing (never binned) stays not-arrived. The Drive-call goldens are unchanged, and there is no second Bin listing.
- You may run `pnpm exec vitest run src/data/pile-readiness.test.ts src/data/spine/plan.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
