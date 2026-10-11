# The harness

How work is done here: `docs/harness/METHOD.md`. Where it stands and what comes next: `docs/harness/HANDOFF.md`. The map: `AGENTS.md` (imported by `CLAUDE.md`). Both agents start through `docs/harness/STARTUP.md`; skills and capability selection are in `docs/harness/SKILLS.md`.

- `features.json`: everything that must work or be fixed, each with its `verify` command and `passes`.
- `progress.md`: one dated line per session or feature.
- `init.sh`: assigned writers install, run every check gate and print the next open entry in their exclusively owned checkout; read-only roles use a prepared target.
- `briefs/`: assignments for coordinator, implementer, evaluator and reviewer, in either tool.
- `codex-run.sh`: runs one local Codex delivery, scans and commits its plan, gates it and records its card and usage.
- `.agents/skills/bower-*`: canonical session/implement/review/evaluate skills; `.claude/skills/bower-*` are committed links to them.
- `docs/harness/ACTIVE.md`: current integration assignments and resource reservations; `COORDINATION.md` defines worktree and closure flow.

- Adopted product/plan: `docs/PRODUCT.md`, `docs/WORK_PLAN.md`, `docs/P2_ACCEPTANCE.md`; compare `docs/harness/PLAN_REVISION` with local main before a new assignment.
- Technical leadership and operational ownership: `docs/harness/GOVERNANCE.md`. A docs-only main merge does not close a product phase.

- Stable boundaries and recovery: `docs/ARCHITECTURE.md`. First coordinator assignments and dependencies: `docs/harness/ORCHESTRATOR_START.md`. The existing skills route here through maintained role briefs; no new orchestration plugin is required.

## Coordinator jobs (`jobs/`, TL-P4-56)

Run each script as `bash harness/jobs/<script> …` from the main checkout. Logs go to `/tmp`. Machine paths, the staging origin, folder ids and account details are arguments, never literals.

- `jobs/red-then-impl.sh <wt> <red prompt> <effort> <red msg> <impl prompt> <effort> <tag>`: a Codex red; the coordinator commits the test files; then a Codex implementation.
- `jobs/codex-impl.sh <wt> <prompt> <effort> <tag>`: one Codex implementation session; prints the card and status.
- `jobs/codex-readonly.sh <dir> <prompt> <effort> <out>`: one read-only Codex session (pass, diagnosis or review); its final message goes to `<out>`.
- `jobs/gates.sh <wt> <tag> <specs…>`: check, e2e and e2e:fake on the named specs, into `/tmp/gates-<tag>/`.
- `jobs/gates-and-pass.sh <wt> <adv prompt> <tag> <specs…>`: the gates beside a read-only Codex adversarial pass (`/tmp/gates-<tag>/adv.md`).
- `jobs/impl-then-e2e.sh <wt> <prompt> <effort> <tag> <pnpm script>`: a Codex implementation, then one e2e script.
- `jobs/integrate-done.sh <branch> <entry> <msg> <fix sha>`: integrate.sh, then done.sh `--fixed-in`.
- `jobs/integrate-known-green.sh <branch> <entry> <msg> <why>`: integrate.sh, then done.sh `--known-green`. Commit the Close note first.
- `jobs/done-entry.sh <entry> <msg> <fix sha>`: done.sh `--fixed-in` only.
- `jobs/done-known-green.sh <entry> <msg> <why>`: done.sh `--known-green` only.
- `jobs/new-worktrees.sh <branch>…`: worktrees from claude/p3 at `${BOWER_WORKTREES:-/private/tmp}/bower-<branch>`, installed offline.
- `jobs/disjoint.sh <owned list> <wt>…`: the owned files that any worktree already changes (the TL-P4-54 parallel check).
- `jobs/suites.sh`: the four batch suites on the main checkout, into `/tmp/suites-*`.
- `jobs/backup-scan.sh <old backup sha>`: the pre-backup scan of history newly reachable from main (BACKUP.md).
- `jobs/splice-handoff.sh <block file> <first> <last>`: replaces HANDOFF's Resume lines with a new block, then commits.
- `jobs/wait-run.sh <owner/repo> <run id>`: waits for a runner run, then prints its timing line.
