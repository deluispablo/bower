# Packet: P4-101 review (orphan-pile-count-data, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-orphan-pile-count-data`.

## What to review

- **Diff:** `git diff claude/p3...orphan-pile-count-data -- src` (reds f53be704; red repairs and sweeps 1–3; implementation rounds; fix rounds 1–2 and addendum 6) with the notes `docs/harness/2026-10-10-orphan-pile-count-data-notes.md`, plus the c2-pile-records reopen in `harness/features.json`.
- **Contract:** the packet `docs/harness/2026-10-10-orphan-pile-count-data-packet.md`; TL-P4-53 Q3, Q4, Q7 and addenda 2, 5, 6, 7 (DECISIONS).
- **Prior passes:** Codex adversarial 1 and 2 (BLOCK 1 each); `docs/harness/2026-10-10-codex-orphan-pile-count-data-adversarial*.md`. The lead ended the loop at addendum 7.
- **Gates (coordinator):** pnpm check and e2e app/capabilities on demo and fake (in the coordinator's message).

## Look hardest at

- `orphanSummary(): {count, complete}`; unknown never zero; count ≥1 with complete false is "at least N".
- A stamped declaration is retired from its listing stamp alone; only unstamped ones are read; reads never grow with history on any piles()/orphanSummary() path.
- A missing context gets one Bin lookup by identity (shared with row accounting); binned means removed ("Nothing is left"); a context missing without binning keeps "not arrived".
- Home's goldens unchanged except the ruled empty-inbox rename; one log per failure; no second scan, store or wire format; shared Pile/SetAside untouched.
- The red repairs and sweeps changed tests only per the addenda.
- You may run `pnpm exec vitest run src/data/orphan-pile-count.test.ts src/data/live/home-cache.test.ts --maxWorkers=2` with output to the OS temp folder.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
