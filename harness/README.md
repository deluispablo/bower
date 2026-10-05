# The harness

How work is done here: `docs/harness/METHOD.md`. Where it stands and what comes next: `docs/harness/HANDOFF.md`. The map: `AGENTS.md` (imported by `CLAUDE.md`). Both agents start through `docs/harness/STARTUP.md`; skills and capability selection are in `docs/harness/SKILLS.md`.

- `features.json`: everything that must work or be fixed, each with its `verify` command and `passes`.
- `progress.md`: one dated line per session or feature.
- `init.sh`: assigned writers install, run every check gate and print the next open entry in their exclusively owned checkout; read-only roles use a prepared target.
- `briefs/`: assignments for coordinator, implementer, evaluator and reviewer, in either tool.
- `.agents/skills/bower-*`: canonical session/implement/review/evaluate skills; `.claude/skills/bower-*` are committed links to them.
- `docs/harness/ACTIVE.md`: current integration assignments and resource reservations; `COORDINATION.md` defines worktree and closure flow.

- Adopted product/plan: `docs/PRODUCT.md`, `docs/WORK_PLAN.md`, `docs/P2_ACCEPTANCE.md`; compare `docs/harness/PLAN_REVISION` with local main before a new assignment.
- Technical leadership and operational ownership: `docs/harness/GOVERNANCE.md`. A docs-only main merge does not close a product phase.

- Stable boundaries and recovery: `docs/ARCHITECTURE.md`. First coordinator assignments and dependencies: `docs/harness/ORCHESTRATOR_START.md`. The existing skills route here through maintained role briefs; no new orchestration plugin is required.
