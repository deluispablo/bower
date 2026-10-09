# Technical-lead decision TL-P4-28: a larger role for Codex

**Owner request, 2026-10-09:** give Codex more weight, so token use is spread better across the two providers.

**Evidence from stage 4:**

- **Codex found what Claude did not.** It found real Important findings that Claude reviews had passed: the P3 review (3), c4-app-fence (6 over four rounds), c4-undo-withdraw (12), and d-v2-07 (several).
- **Fix rounds are the largest cost.** c4-app-fence, c4-undo-withdraw and d-v2-07 took four rounds each, and the pattern is the same each time: the defect is found after the code is built.
- **Codex's own entries were clean.** Its implementations (c4-segmented-one, v2-move-here, c4-new-pill-one, v2-still-marks, c4-api-audit) had no quality misses; their slips came from the packets.

## Rulings (amending TL-P4-23)

1. **Codex does the contract sign-off for escalated entries.** The sign-off of an escalated entry's packet (the TL-P4-20 trial) is a Codex read-only pass (`codex exec --sandbox read-only`) against the packet, the cited code and DECISIONS, asking what an implementer would guess and what would break the contract. The Claude contract pass is dropped for those entries, so the work moves rather than doubles. It is measured by the fix rounds per escalated entry against stage 4's count so far.
2. **Codex writes the property tests on data-safety entries.** On escalated data entries, Codex writes the fast-check property, the adversarial half, in its own worktree from the packet's invariants, before or beside the implementer. Its tests commit first as the red. The implementer may not change them; a change needs the lead (TL-P4-22 addendum 22). One provider builds and the other tries to break.
3. **Codex takes all non-escalated implementation, with two Codex slots.** The cap becomes 2 Claude workers plus 2 Codex workers, on files that do not overlap, with every gate under the lockf lock (TL-P4-22 addendum 23).
   - Codex's work: the remaining V2 blocks that are not escalated, the c4 data entries without write-once or concurrency, the polish, and harness and mechanical work.
   - Claude keeps the escalated entries and the engine work.
   - Each Codex entry still gets a fresh Claude review, so the providers keep reviewing each other.
   - The TL-P4-23 stop rule stands: back to one Codex slot if the lock wait eats the gain, or after two Codex entries in a row need a second fix round.
4. **Codex prepares P4.** In a free Codex slot it drafts the P4 capability preparation for C05 to C12: corpus cases with expected outcomes, and scripted proposals, as read-only research plus test fixtures. The lead reviews each one before it becomes a packet.

**What stays the same:**

- The coordinator commits for Codex, because its sandbox cannot write the git index. That overhead is accepted and counted in tokens.csv.
- The rules on personal data and secrets apply to every Codex prompt.
- Codex's usage is recorded in tokens.csv from `--json`, so the stage-end review compares the two providers' share.
