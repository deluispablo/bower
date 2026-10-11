# Packet: P4-122 review (b4a-contract)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b4a-contract`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- src runner` (the merge of claude/p3 is already in; the branch carries rounds 1 to 6 and two older-test repairs).
- **Contract:** the packet `docs/harness/2026-10-11-b4a-contract-packet.md` (with "Ruled"), TL-P4-48 and its addenda 1–9 in docs/harness/DECISIONS.md, and the notes (`2026-10-11-b4a-contract-notes.md`, Rounds 2 to 6 and the red repairs).
- **Previous passes:** `2026-10-11-b4a-adversarial-{1,2,3,4}.md and the P4-120 and P4-121 reviews (BLOCK; rounds 5 and 6 answer them)`. Round 4 replaced the per-path checks by one `validLearnedBlock` called by every About me write path (create, init, write-through, consolidation, Forget, Undo, rebuild), per addendum 6.
- **Gates (coordinator):** pnpm check, and the capabilities e2e on demo and fake, green on HEAD (b4a-g10).

## Look hardest at

- The one validator: heading plus exactly the three ruled regions, every line citing a live observation, no tombstoned text anywhere in the block; any path that does not call it is a finding.
- Observation identity (source, hash, normalised text, without the section): a replay dedupes and falls with Undo or Forget; the last word wins for repeated remember and Forget.
- Byte preservation of personal text and front matter; regions that do not depend on front matter.
- Below budget a plain append; consolidation only over budget plus five new observations; Forget and Undo exempt, with the archive kept.
- The repaired older tests (b4a-fr1.test.ts, admitted.test.ts) keep every bound, fence, byte and id assertion.
- No second parser, writer or region mechanism. The ownership-format merge with B1d's prefix mode keeps both behaviours.

- Round 5 (addendum 7): for any manifest that touches About me, whatever its change kinds, the FINAL block is validated against the FINAL ledger (run-manifest.ts and runner admission); link rewrites never edit the learned section; creation is exactly the template plus empty regions. Probe each of the three P4-120 reproductions and look for any other path (change kind, order of effects, admission) that skips the final validation.

- Round 6 (addenda 8 and 9): a maintenance target's identity is its resolved file id; one helper (maintenanceTargetOk) bans About me, the ledger and archives by id or declared path and refuses a path/id mismatch, called by both run-manifest.ts and runner admission; runner/src/index.ts registers every id the producer adds in capture.places (from the listing or the reserved folder and name, never a declared path). The P4-121 alias reproduction must refuse. This is the last patch on the identity class: look for any other path-versus-id gap and report it as a finding.

## Reply

Reply with the full review (findings with file:line and severity), then the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every card line under 120 characters.
