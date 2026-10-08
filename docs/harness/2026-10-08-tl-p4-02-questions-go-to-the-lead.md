# Technical-lead decision TL-P4-2026-10-08-02: the coordinator's questions go to the lead

**Owner observation, 2026-10-08:** the coordinator is asking the owner questions that belong to the lead.

**What happened.** On 2026-10-07 at 22:30Z, the coordinator used its question tool to ask the owner whether it could add made-up piles to A's inbox and press Tidy up for the P4-2 speed runs. That is a technical-lead question. The owner had already allowed presses on staging, and synthetic piles in a test account's folder are part of every evaluation since P3.

**Ruling.**
- **Owner rulings go only through the lead.** The coordinator never asks the owner anything, by tool or in its output; it messages the lead. The lead decides, or asks the owner when it is truly the owner's call (credentials, sign-ins, product choices, phase acceptance, the cutover). This is now one line in `AGENTS.md`, which every session reloads after a compaction (TL-P3-29).
- **Standing approval for test data.** Made-up piles and notes in A's or B's Bower folder on staging, and presses of Tidy up there, need no question. They stay synthetic, inside the test accounts' Bower folders, with no delete outside the Bin and no sign-in by an agent.
- **If it happens again** after this line is loaded, the next step is a `PreToolUse` hook that refuses the question tool in the coordinator's checkout.
