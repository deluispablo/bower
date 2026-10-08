# Packet: P4-24 review (stage 2: c2-runner-exit)

Starting model: `bower-escalated` (Opus), fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. Read only this packet, the rulings named here and the diff.

- **Diff:** `git diff a98d15a1..c17c3290 -- runner src api docs/specs` (red `f662934a`, code `c17c3290`, merged into `claude/p3`).
- **Contracts:** TL-P4-16 addendum 4 and the "## Ruling" of `defects/2026-10-08-smoke-runner-offline.md` (one exit function for the runner's exit paths; an additive "attempt ended" report; the Worker arms the run deadline at +60 s and redispatches; no if:failure step). TL-P4-14 rules. Mechanism map: shared contracts; Worker deadlines.
- **The fixed question (TL-P4-15):** does the change add a second way to do something that already exists (a second deadline path, a second recovery decision)? A yes blocks.
- **Look hardest at:** can an "attempt ended" report from an old attempt (or a replay) disturb a newer attempt or a finished run? Is the report authenticated by the same ticket rules as other status posts? Does the +60 s deadline go through the one deadlines table and `rearm()`? Exit path :146 (a newer attempt or revoked ticket) must not report. An uncaught error in main: does it reach the one exit function? Old Worker → 415: harmless as the row says?
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-24-review-notes.md`.
