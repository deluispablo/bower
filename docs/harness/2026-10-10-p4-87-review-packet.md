# Packet: P4-87 review (c05-person-notes, escalated; rounds 4–5 written by Claude and Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c05-person-notes`.

## What to review

- **Diff:** `git diff claude/p3...c05-person-notes -- src runner` (the whole entry), with most weight on rounds 4–5: `git diff 87ef51bf..HEAD -- src runner`.
- **Contract:** the packet `docs/harness/2026-10-10-c05-person-notes-packet.md` (its "What the person sees" rows are contract, TL-P4-22, including TOO_OLD_WHY and NOTHING_FOUND_WHY, owner-approved through the designer); TL-P4-32 and addenda 1–6 in `docs/harness/DECISIONS.md`.
- **Prior passes:** the Codex reviews `docs/harness/2026-10-10-codex-c05-person-notes-adversarial*.md` (pass 5 PASS); the notes' round sections and their logged v1 limits.

## Look hardest at

- One settlement home (settleRequest), one binding, one archive path; no second store.
- Addendum 5: completed by the record id in the bytes; never title-resolved once bound or completed; fail closed past the oldest retained run with TOO_OLD_WHY.
- Addendum 6: every named target is bound at first admission and settles in that run (line = append + completion; no line = one NOTHING_FOUND_WHY row); archive once all settle; only a clash carries over on bound ids; a later run adds nothing.
- The red repair a00b7167 changed three older tests: judge each against addendum 6 alone; nothing else loosened.
- A person's note never gains metadata; every write passes what it read (modifiedTime/md5); match by id, never by title.
- Only Blocking findings in normal use go back to the lead (loop end); everything else is a v1 limit.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
