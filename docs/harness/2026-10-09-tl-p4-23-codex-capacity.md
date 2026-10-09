# Technical-lead decision TL-P4-23: Codex capacity in stage 4

**Owner request, 2026-10-09:** the weekly Codex usage is back, so use it to speed the work up. `codex exec` answers (codex-cli 0.160.1, checked by the lead).

The method already has Codex workers ([TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md): `codex exec --json` with an explicit reasoning effort; the coordinator brief; COORDINATION). This ruling sets how stage 4 uses them. It adds no new mechanism.

## Rulings

1. **Codex as an implementer.** Codex takes Sonnet-rung entries that are well specified and not escalated: UI-only entries, polish, mechanical harness work, and the c4 data entries without write-once or concurrency.
   - Opus and escalated entries stay on Claude: `src/bird` engine work, contracts, data safety and Worker dispatch.
   - Each Codex entry gets a fresh Claude review (`bower-reviewer`, two passes), because the other provider reviews. The designer's sign-off and check apply as usual.
2. **The worker cap goes to three, as a trial.** It is two Claude workers plus at most one Codex worker, on entries whose files do not overlap.
   - Review capacity is no longer the bottleneck, because each provider reviews the other.
   - Machine load is held by the heavy-run lock (TL-P4-22 addendum 11). Every Codex gate goes through `harness/with-lock.sh` as well.
   - **Measure:** entries closed per day, lock wait, and defects traced to Codex entries.
   - **Stop rule:** back to two if the lock wait exceeds the time saved, or after two Codex entries in a row need a second fix round.
3. **The hooks do not reach Codex,** so the coordinator does what they would:
   - before review, check that the tree is clean and that `pnpm check` is green at the worker's HEAD (the Stop gate);
   - check the card's `worktree:` line;
   - keep the main checkout untouched, since Codex runs only in its own worktree.

   check-harness (test-tamper, review PASS, design `verified`) and done.sh's red→green apply unchanged.

4. **Setup:**
   - The coordinator makes the worktree and runs `pnpm install` before dispatch, because the sandbox has no network.
   - Codex runs with `--sandbox workspace-write` inside that worktree, starts from the packet and `WORKER.md`, and reads `AGENTS.md` natively.
   - The branch uses the normal worker name, never `codex/*`, which is protected for the owner's own Codex worktrees, so `integrate.sh` would never remove it. The notes say `implementer: codex`, and tokens.csv records the Codex tokens from `--json`.
   - First entry: `c4-segmented-one`, which is small and signed off. It also checks that e2e can bind its own port in the sandbox. If not, Codex runs unit tests and check only, and the coordinator runs the entry's e2e under the lock.
5. **The pending Codex review now** ([TL-P3-16](2026-10-07-tl-p3-16-codex-review-after-p3.md)), instead of on 2026-10-12. One read-only `codex exec --sandbox read-only` review of the P3 Worker and spine range plus the stage 2 range, against the ARCHITECTURE mechanism map and the defect classes. It runs in a scratch worktree, in parallel and non-blocking. Its findings enter the defect flow (TL-P4-15), and none is fixed where it shows.
6. **Cross-model review for escalated entries.** An escalated Claude entry may add one Codex read-only review pass, beside the Opus reviewer, when its packet names it (for example d-v2-02, VaultSource.answer). It replaces the pr-review-toolkit passes for that entry; it is never added on top of them.

**Data:** Codex sends the code it reads to OpenAI, as Claude does to Anthropic. The rules on personal data, secrets and test accounts apply to its prompts the same way, and a packet names only code and made-up data.
