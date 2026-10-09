# Packet: P4-65 review (c4-parse-once, escalated; written by Codex; TL-P4-22 addenda 18 and 25 to 27)

This review is read-only and fresh. Run unit tests only (the runner tests included); never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-parse-once`.

## What to review

- **Diff:** `git diff claude/p3...c4-parse-once`.
  - Reds: b48a7655 (session 1), 573c4bfd (bowerNote shape, addendum 26), 0ee90829 (round 2, addendum 27).
  - Fixes: d146960e and eb909a67. Notes and compatibility rows: a2250927 and 1262949d.
- **Packet:** `docs/harness/2026-10-09-c4-parse-once-packet.md`.
- **Sign-off:** `2026-10-09-c4-parse-once-contract-signoff.md`.
- **Adversarial passes:** `2026-10-09-codex-c4-parse-once-adversarial.md`. Round 1 found 1 Important; round 2 found 0.

## Look hardest at

- **One memo.** It sits beside parseOwnership and is keyed by (fileId, sha256 of the exact bytes) from contracts/hashes.ts. It lives for one attempt: one context runs from planning to effects, and recovery or a second attempt makes a fresh one. There is no module state and no cache on the vault.
- **Coverage.** Only text read from Drive is memoised. Candidates and fragments are not memoised, and are counted separately.
- **Every forwarding file only forwards.** Check script.ts, claude.ts, read.ts, fake-runner.ts, plan.ts, provider.ts and drive-vault.ts.
- **No behaviour change.** Written bytes and sections are unchanged. The goldens stay exactly 78 and 88 with their phase counts, and no Drive call is added.
- **The reds were changed only by red-owning sessions.** 573c4bfd went through a lead ruling. The implementer changed no test.
- **Compatibility rows** exist for every commit under src/data/contracts. Also check the `tests changed:` lines, and that there is no `.only`, `.skip` or real timer.

Already run by the coordinator: pnpm check, green at 1262949d.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
