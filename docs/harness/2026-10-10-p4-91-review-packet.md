# Packet: P4-91 review (b2a-summary-format, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b2a-summary-format`.

## What to review

- **Diff:** `git diff claude/p3...b2a-summary-format -- src` (reds, fix e3047855, red repairs, fix round 1), notes and two Codex passes.
- **Contract:** `docs/harness/2026-10-10-b2a-summary-format-packet.md`; TL-P4-42 Q1-Q2; the lead's rulings: decode quoted values per YAML; plain values parse exactly as before; a person note's bytes are never rewritten (byte-range edits only). Known limit (TL-P4-42 addendum 3, DEFECT_LOG b2a-person-copy-reserialize): serializeNote on an untouched copy of a person note is not a production path; do not re-raise it unless a production path does it.

## Look hardest at

- Write side: every value YAML 1.1 or 1.2 readers would type or misparse is quoted; plain stays plain otherwise; one line; validSummary refuses empty, multi-line (incl. U+2028/U+2029/U+0085), control characters, lone surrogates, over 200.
- Read side: quoted values decode per YAML; legacy plain values unchanged; no second YAML mechanism.
- Reds pin each packet point; no red weaker than its point; compatibility rows for the src/data/contracts commits.
- You may run `pnpm exec vitest run src/data/vault/note-format.test.ts --maxWorkers=2` with output to /tmp/p4-91-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
