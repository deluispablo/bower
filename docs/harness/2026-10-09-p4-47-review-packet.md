# Packet: P4-47 review (c3-state-mark)

Read-only and fresh. Unit, runner and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo, in any form. Run git with `-C /private/tmp/bower-c3-state`.

- **Diff:** `git diff 365e4a2f..1d2e5a26`. The merge c65fb2ab brought in claude/p3 365e4a2f, which carries c3-pair-ask's `answered` row.
  - Round 1: red 1299ca14, fix d36ba829, compatibility 501e4b44, notes 0ab159c8.
  - Round 2: test 95fdd9d8, fix 11e79dc6, notes 1d2e5a26.
- **Packet:** docs/harness/2026-10-09-c3-state-mark-packet.md (contract points 1–3). Notes: docs/harness/2026-10-09-c3-state-mark-notes.md.
- **Rulings:**
  - TL-P4-14, the state mark.
  - TL-P4-16 addendum 2 and TL-P4-19 addendum 7, write-it-silent: a yes applies the shown text with no model call, and re-asks if the section changed, using write-once's stamp+checksum comparison with no new helper. Both reds must be green.
  - TL-P4-19 addendum 10: no-effect answers go in the `answered` row.
- **Fixed questions (TL-P4-20):** first the contract (each point met, with a test), then the second way (a second state search, a second stamp comparison, a second report shape). Give every finding a severity.
- **Look hardest at:**
  - `withoutSaid` is gone, and the manifest read is lenient. What happens when there is no earlier manifest, or the earlier one cannot be read?
  - `Question.shown` is optional, so old questions keep today's path. Check the validator in layout.ts.
  - Is the re-ask comparison the existing write-once `holds`/`confirms`, or a new one?
  - The Claude provider plans with no model when only shown q-state answers exist. Is that sound when other work is pending?
  - Contract point 3 and the verify ask for a real entry point (e2e) for "Write it". The worker left it out ("scripted provider never grants"). Is that a contract gap?
  - The re-ask uses the first-ask wording with no reason. Refused-write and nothing-to-write are silent. The copy is with the designer; say only whether the code leaves a clean seam.
  - The `tests changed:` lines, no `.only` or `.skip`, and the goldens C04 78 and 25-runs 88.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with lines under 120 characters. Details go in `/private/tmp/p4-47-review-notes.md`.
