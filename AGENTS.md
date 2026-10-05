# AGENTS.md

The map for any agent working on the Bower app rebuild. Short on purpose; the detail is in `docs/`.

## Start here, every session

1. Read the adopted `docs/PRODUCT.md`, `docs/WORK_PLAN.md` and current phase acceptance (`docs/P2_ACCEPTANCE.md` for P2). Compare `docs/harness/PLAN_REVISION` with local main as `docs/harness/GOVERNANCE.md` describes. Follow `docs/harness/STARTUP.md` and load `.agents/skills/bower-session/SKILL.md` once. Read `docs/harness/METHOD.md`, `docs/PHASES.md`, `docs/harness/HANDOFF.md`, the `## Next` of `harness/progress.md` and `git log --oneline -15` as startup specifies.
2. Read the current integration copy of `docs/harness/ACTIVE.md`; follow `docs/harness/COORDINATION.md` for assignments. One writer per checkout; only the named coordinator writes live implementation records; the technical lead owns main planning as GOVERNANCE defines. Preserve others' dirty work; unassigned sessions stay read-only.
3. Load only the assigned role skill/brief; check actual tools using `docs/harness/SKILLS.md`. Assigned writers run `bash harness/init.sh` with exclusive checkout use; reviewers/evaluators remain read-only and use a prepared target.
4. One assigned entry at a time, test first; flip `passes` only after its `verify` is green; the coordinator records progress; one entry per commit (parallel candidate/closure flow: `COORDINATION.md`).

## Where things are

- Planning authority: `docs/PRODUCT.md`, `docs/WORK_PLAN.md`, `docs/P2_ACCEPTANCE.md`; roles and main/implementation separation: `docs/harness/GOVERNANCE.md`.
- Boundary architecture: `docs/ARCHITECTURE.md`; orchestrator launch queue: `docs/harness/ORCHESTRATOR_START.md`. Read relevant sections before contract work or assignment.
- Specs: `docs/specs/` (UI, who does what, the Worker contract). Plans and their ledgers: `docs/superpowers/plans/`.
- Phases (`docs/PHASES.md`): 1 UI on demo data (done), 2 complete app with simulated backend (in progress), 3 minimal real Worker, 4 full second-brain runner. No next-phase implementation while an entry is open; bounded P2 premise probes follow WORK_PLAN.
- Screens: `src/features/`, shell `src/app/`, parts `src/ui/`, Bower the bird `src/bird/`.
- Data: screens only use `src/data/sources.ts` through `provider.tsx`. Sources: `demo/` (in memory), `vault/` + `drive/` + `live/` + `worker/` (real), `fake/` (pretend Drive and Worker). `choose.ts` picks one (`?source=demo|fake|real`).
- Coordination: `docs/harness/COORDINATION.md` (worktrees, ownership, serialized integration and browser gates).
- Skills: `.agents/skills/` is canonical; `.claude/skills/` links to it. Startup applies even without native skill discovery; read the SKILL.md directly as fallback.
- Role briefs: `harness/briefs/` (technical lead, coordinator, implementer, evaluator, reviewer).

## Hard rules

- No personal data: names, places, companies, emails, vault content are made up (`Alex`, `you@example.com`, `FOLDER_ID`). The one exception: the owner's GitHub links (`github.com/deluispablo`, its `bower` repo), which the landing needs as a portfolio.
- Local only: never `git push`, never add a remote. No secrets in the repo.
- English everywhere. UI copy: sentence case, plain words, never "vault", no file names or jargon in sentences. Bower is a bowerbird, never "the bird" in copy.
- TypeScript strict, no `any`. Errors are never swallowed: a `BowerError` with one short sentence for the person, details to `console.error`.
- The app never hard-deletes (Drive Bin only), never writes `index.md`, `hot.md`, `log.md`, nor Bower's sections of a note. Every content write passes the modifiedTime it read; a move or rename checks the name and place it read (`stillAsSeen`), since a text change elsewhere does not clash with it.
- Sign-out forgets what this device kept about the person (`data/device.ts`); the journal outbox stays at sign-out, since its lines are changes already made in that folder (keyed by folder, never sent to another).
- Bower on screen: one animated bird per screen (`bird/presence.ts`); respect "Bower moves" and reduced motion.
- Brand tokens: `src/styles/tokens.json`, then `pnpm tokens`. Teal and amber are fills; text uses `--brand-line` / `--accent-line`.
- `public/landing/` is exported from the design canvas: do not edit it by hand; mechanical fixes go in `scripts/fix-landing.mjs`, run after each export.
- Gates before a commit: `pnpm check`; screens also `pnpm e2e` and `pnpm e2e:fake`.
