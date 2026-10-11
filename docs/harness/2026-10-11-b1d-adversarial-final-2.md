# B1d adversarial pass 2 (Codex gpt-6-astra xhigh, read-only) on 737bcdbc

- **Important — Blocking: normal use — [runner/src/claude.ts:1362](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1362):** A valid 5,287-byte ownership-formatted MOC has a region crossing the 4,096-byte prefix boundary. Parsing that prefix as a complete note throws “This note cannot be read safely.” Through `main`, planning fails before either model call—even when the MOC is unrelated. The 967-byte control completes.

- **Important — Blocking: normal use — [runner/src/timing.ts:119](/private/tmp/bower-b1d-selection/runner/src/timing.ts:119):** Cold setup with the three baseline notes, 140 short archive notes and one offer accepts both valid replies and moves `Offer.txt`. Maintenance then exhausts its 300-send allowance; `main` ends `saving`, code 1. Ledger exhaustion therefore occurs after touching the source, instead of leaving it untouched in the inbox. The 139-note control completes.

- **Important — Blocking: normal use — [runner/src/claude.ts:1407](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1407):** Admit three independent “keep one” answers, each selecting its own two notes. Every source inherits all six answer pins, so all three valid selections exceed five and are rejected twice. `main` returns code 1 without execution. One pair succeeds; the allowance is incorrectly shared across unrelated sources.

- **Important — Blocking: normal use — [runner/src/claude.ts:1391](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1391):** A folded MOC has refreshed `members: [recordId]`, while its stored body has not yet gained that member link. `Record.md` has an unrelated summary. Selecting the MOC exposes no member expansion in either call; requesting `recordId` is rejected twice despite being within both limits. The code discards membership before constructing either prompt.

- **Important — Blocking: normal use — [src/data/vault/vault-index.ts:140](/private/tmp/bower-b1d-selection/src/data/vault/vault-index.ts:140):** Matching `Terms.md` links to `[[Garden#Soil]]`; `Garden.md` otherwise has unrelated metadata. The resolver treats the heading as part of the filename, omits Garden from candidates, and selecting it fails twice with code 1. Changing only the link to `[[Garden]]` succeeds. The existing `linkTarget` normalization handles this syntax.

No second planner, cache, ledger, writer or pending store found. No unauthorized assertion weakening found across sweeps 3–6.

verdict: BLOCK
