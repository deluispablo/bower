# Technical-lead decision TL-P4-20: method refinement from external practice

**Owner request, 2026-10-09:** research how people run the harness method and multi-agent Claude Code work, and refine ours. The research report sits outside the repository, in the owner's projects folder (`reports/Refinar el método harness.md`), with its notes. Its sources include:

- Anthropic's harness posts of [Nov 2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) and [Mar 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps);
- the [C compiler run](https://www.anthropic.com/engineering/building-c-compiler);
- the [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system);
- the Claude Code docs on [hooks](https://code.claude.com/docs/en/hooks), [subagents](https://code.claude.com/docs/en/sub-agents), [settings](https://code.claude.com/docs/en/settings) and [output styles](https://code.claude.com/docs/en/output-styles);
- [ImpossibleBench](https://arxiv.org/abs/2510.20270) on test tampering, and mutation-testing studies;
- practitioner accounts (Willison, Osmani, Superpowers, compound engineering).

**Finding.** Our method already has every part the public harnesses use, and `done.sh` red→green proof is stronger than Anthropic's `passes` flag. The cheapest gains come from three changes:

1. Turn rules that agents could ignore into hooks, permissions and native caps, because instructions are advice and hooks block.
2. Close the test gap: nothing flags a changed or deleted test, and red→green proves a test can fail once, not that the suite catches faults.
3. Measure what each role costs, so that a piece can be removed when a newer model no longer needs it.

The owner's request authorizes the configuration changes below: `.claude/settings.json`, agent frontmatter and hooks.

## Adopted now

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                        | Where                                             | Entry             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------- |
| 1   | **Test-tamper gate.** Every existing test or e2e file that an entry modifies or deletes (`git diff --diff-filter=DM` against the base) needs a line `tests changed: <file>: <why>` in the notes. The reviewer checks each one. `forbidOnly: true` in Playwright, and no new `.only` or `.skip` in unit tests.                                                                                 | check-harness, integrate.sh, WORKER, review skill | `c3-test-tamper`  |
| 2   | **Stop gate for implementers.** A frontmatter `Stop` hook on `bower-implementer` and `bower-escalated`, which runs as `SubagentStop`, exits 2 unless the tree is clean and a green `pnpm check` mark names the current HEAD. A wrapper writes that mark on green. It honours `stop_hook_active`.                                                                                              | hook script, agent frontmatter                    | `c3-hooks`        |
| 3   | **Hook audit:** denials exit 2, never 1; `guard-main-checkout.mjs` reads `cwd` from the hook input; one handler per rule with an `if` filter where the docs confirm it; a check in check-harness that every hook script path in settings exists; SessionStart also on `resume`; a PreCompact hook that never blocks.                                                                          | settings, scripts                                 | `c3-hooks`        |
| 4   | **Permissions block:** deny `Edit` and `Write` on `public/landing/**`, deny reads of `.env*`, and deny `git push` except the backup push of `main` to `backup` (BACKUP.md), which a hook allows by exact command. Verify the backup flow once.                                                                                                                                                | settings, hook                                    | `c3-permissions`  |
| 5   | **Native caps,** each checked against the current docs before use: the subagent concurrency limit at 2, `maxTurns` on every worker agent, no nested dispatch for workers.                                                                                                                                                                                                                     | settings, agents                                  | `c3-agent-defs`   |
| 6   | **Tool allowlists** (`tools:`) instead of denylists for the read-only roles (reviewer, evaluator, diagnoser, impact, design-checker), listing the browser MCP tools they use. Each role is run once to confirm it still works.                                                                                                                                                                | agents                                            | `c3-agent-defs`   |
| 7   | **Reviewer calibration.** Review in two passes: the acceptance contract first, then code quality and "second way?". Report every finding with a severity; the coordinator filters on "correctness or contract gap?" and "second way?". Worked PASS and BLOCK examples from our own history. The evaluator has a hard pass rule per criterion: a criterion passes only if all its checks pass. | bower-review skill, reviewer, evaluator           | lead, now         |
| 8   | **Session-start smoke:** the coordinator runs `harness/init.sh` and a fast e2e smoke before the first dispatch of each batch, so a break left by the last session shows before new work starts.                                                                                                                                                                                               | coordinator brief                                 | lead, now         |
| 9   | **Flaky policy:** `failOnFlakyTests` on batch and freeze e2e runs. A retry-passed test enters the defect flow. A quarantine file gives each quarantined test an owner and an expiry, and a script checks it. Never skip a test.                                                                                                                                                               | playwright config, script                         | `c3-flaky-policy` |
| 10  | **Cost per entry.** `harness/tokens.csv` is already the home. Every agent run fills tokens, tool uses and minutes, and the lead reads it by role and rung at each stage end.                                                                                                                                                                                                                  | coordinator brief, lead brief                     | lead, now         |
| 11  | **Bower quiet** only reaches the main session and forks. Its description says so, and worker brevity stays in the agent bodies.                                                                                                                                                                                                                                                               | output style                                      | lead, now         |
| 12  | **DECISIONS bar.** A line is a ruling that changes what someone does. Status news belongs in HANDOFF or LEAD, not in DECISIONS.                                                                                                                                                                                                                                                               | lead brief                                        | lead, now         |

## Trials (adopted with a measurement, then kept or dropped)

- **Contract sign-off for escalated entries:** the reviewer approves the packet's acceptance contract and verify steps before implementation starts (Anthropic's "sprint contracts"). Measure: fewer BLOCKs per escalated entry.
- **Reviewer measurement at the stage 3 end:** seed known bugs into three past diffs, and count what fresh reviewers catch.
- **Pruning at each stage end:** the lead names one harness piece to relax for the next batch, for example the per-entry evaluator on entries that are not risky, or the Haiku rung. It compares tokens.csv and later defects, and keeps the piece only if it pays. Every piece encodes a model weakness, so each new model release triggers an audit.
- **Stage 4 or later:**
  - StrykerJS `--incremental` on `src/data/` files that escalated entries touch, with survivors listed in the notes;
  - fast-check properties for data-safety invariants (section round trip, modifiedTime on every write, a stale move refused);
  - a ratchet on complexity and function size;
  - `type-coverage`.
- **Accessibility:** for `ui: true` entries, the touched screens' e2e include an axe scan with WCAG 2.2 tags and `target-size` enabled.

## Not adopted, with the reason

- **More than two workers:** review capacity is the bottleneck.
- **Agent teams for implementation:** still experimental, and weak on shared files.
- **TDD Guard:** redundant with red→green, at the cost of a model call per edit.
- **spec-kit or BMAD:** markdown overhead.
- **eslint-plugin-boundaries:** a second way, since dependency-cruiser already does the job.
- **Hosted AI review bots:** code leaves the machine.
- **Packaging as a plugin:** plugin agents ignore hooks.
- **`isolation: worktree`:** it branches from the default branch, not `claude/p3`.
- **`memory` or `omitClaudeMd` on workers.**
- **Broad visual-regression baselines:** the animated bird and fonts make them flaky. The designer's check covers visuals.

## Order

`c3-test-tamper` and `c3-hooks` run after `c3-state-mark`, then `c3-agent-defs`, `c3-permissions` and `c3-flaky-policy`, all on Sonnet and within the two-worker cap. They close stage 3 together with its smoke.
