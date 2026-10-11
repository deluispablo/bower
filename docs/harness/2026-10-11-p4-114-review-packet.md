# Packet: P4-114 review (b6a-templates, the P4-113 fix)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b6a-templates`.

## What to review

- **Diff:** `git diff c30f7adc~1..HEAD -- src` (red c30f7adc; fix after it). Notes: "Fix round 4 reds", "Fix round 4". This is the delta since P4-113 BLOCK (`docs/harness/2026-10-11-p4-113-review.md`).
- **Contract:** the lead's ruling on P4-113:
  - the Source/MOC-only refusals key on byBower plus type;
  - a person's note typed source or moc keeps the mechanical link rewrite (TL-P4-32 addendum 1) and C05's append;
  - the minors are folded in (template names from NOTE_TEMPLATES, the dead unknown-template check removed, a stated choice on plain-note link grounding).
- **Gates (coordinator):** pnpm check and e2e app/capabilities on demo and fake, run after the fix commit.

## Look hardest at

- No Bower-written Source/MOC lost a refusal. No person note gained a refusal.
- The plain-note grounding choice holds to the packet's rule.
- You may run `pnpm exec vitest run src/data/contracts/note-edit.test.ts src/data/spine/scripted.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
