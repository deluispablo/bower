# Packet: P4-21 review (stage 1: c1-digest, c1-drive-ops-table)

Starting model: `bower-escalated` (Opus), fresh and read-only. Never start a server or run e2e; unit and contract tests only (TL-P4-13). Read only this packet, the rulings named here and the diffs.

- **Diffs:**
  - `c1-digest`: red `2f11f804`, code `c734261a` (merged into `claude/p3`; `git diff 5b6c76fc..c734261a`).
  - `c1-drive-ops-table`: red `1e64a9f0`, code `6a9573dc` on branch `claude/c1-driveops` (not merged; `git diff 5b6c76fc..6a9573dc`).
- **Contracts:** [TL-P4-14](2026-10-08-tl-p4-14-consolidation.md) "Rules for every consolidation entry" (behaviour unchanged except the listed fixes; red from today's drift; removed lines counted; goldens never rise) and the two stage 1 rows. Mechanism map in `docs/ARCHITECTURE.md`: Digests; Drive ports.
- **The fixed question (TL-P4-15):** does either change add a second way to do something that already exists? A yes blocks.
- **Look hardest at:**
  - **c1-drive-ops-table behaviour changes** the worker reports: `generateIds` is no longer fenced; the live wrapper no longer runs its after-check for `openResumable` and `putChunk`; unknown method names stay fenced. Is each a listed fix or a behaviour change the rules forbid? Can an upload chunk now land under a lost lease without the after-check?
  - **c1-digest:** the fake's report check moved from SHA-256 to MD5 like the runner. Is MD5 what the contract and Drive's md5Checksum need? Any hash left outside `hashes.ts` in production code? Does `sha256Sync` duplicate the async path?
- **Reply:** the review card in `docs/harness/WORKER.md`, verdict per entry (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-21-review-notes.md`.
