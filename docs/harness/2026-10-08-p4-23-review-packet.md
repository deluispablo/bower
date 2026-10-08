# Packet: P4-23 review (stage 1: c1-still-as-seen)

Starting model: `bower-escalated` (Opus), fresh and read-only. Never start a server or run e2e; unit and contract tests only (TL-P4-13). Read only this packet, the rulings named here and the diff.

- **Diff:** `git diff fd51b737..6290eb31 -- src runner` (red `9a32c5bb`, code `6290eb31`, merged into `claude/p3`).
- **Contracts:** [TL-P4-14](2026-10-08-tl-p4-14-consolidation.md) "Rules for every consolidation entry" and the `c1-still-as-seen` row. AGENTS.md: a move or rename checks the name and place it read; a text change elsewhere does not clash; every content write passes the modifiedTime it read. Mechanism map: "Still as seen" fence.
- **The fixed question (TL-P4-15):** does the change add a second way to do something that already exists? A yes blocks. The worker left `report.ts:45` matching a refusal by text (it says the text is on the wire): judge it.
- **Look hardest at:** parents now compare as a set everywhere (the app had accepted a changed second parent; the fake and the app refused reordered parents): is a set right for every caller, including a move whose target is a second parent? Does every write path still refuse exactly when it must (move, rename, bin, content write with modifiedTime, children checks)? Is the reason code used by every caller instead of message text? Any refusal that became an accept?
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-23-review-notes.md`.
