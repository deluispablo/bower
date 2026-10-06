# AGENTS.md

Current owner authorization: autonomous P2 completion, conditional P2 acceptance and continuation into P3, with periodic private main backups, follows [GOVERNANCE](docs/harness/GOVERNANCE.md#owner-authorization-for-unattended-continuation-2026-10-05). It supersedes older wait-for-owner wording below; all objective gates remain required. P4 is not authorized.

The map for any agent working on the Bower app rebuild. Short on purpose; the detail is in `docs/`.

## Start here, every session

1. Read the adopted `docs/PRODUCT.md`, `docs/WORK_PLAN.md` and current phase acceptance (`docs/P2_ACCEPTANCE.md` for P2). Compare `docs/harness/PLAN_REVISION` with local main as `docs/harness/GOVERNANCE.md` describes. Follow `docs/harness/STARTUP.md` and load `.agents/skills/bower-session/SKILL.md` once. Read `docs/harness/METHOD.md`, `docs/PHASES.md`, `docs/harness/HANDOFF.md`, the `## Next` of `harness/progress.md` and `git log --oneline -15` as startup specifies.
2. Read the current integration copy of `docs/harness/ACTIVE.md`; follow `docs/harness/COORDINATION.md` for assignments. One writer per checkout; only the named coordinator writes live implementation records; the technical lead owns main planning as GOVERNANCE defines. Preserve others' dirty work; unassigned sessions stay read-only.
3. Load only the assigned role skill/brief; check actual tools using `docs/harness/SKILLS.md`. Assigned writers run `bash harness/init.sh` with exclusive checkout use; reviewers/evaluators remain read-only and use a prepared target.
4. One assigned entry per worker at a time; the coordinator may delegate multiple independent entries concurrently under COORDINATION. Test first; flip `passes` only after its `verify` is green; the coordinator records progress; one entry per commit (parallel candidate/closure flow: `COORDINATION.md`).

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
- Development stays local. Owner-authorized exception: back up only accepted local `main` to private `deluispablo/bower-app`, following `docs/harness/BACKUP.md`. Workers never push; no other branch/tag, force push or deployment. No secrets in the repo.
- English everywhere. UI copy: sentence case, plain words, never "vault", no file names or jargon in sentences. Bower is a bowerbird, never "the bird" in copy.
- TypeScript strict, no `any`. Errors are never swallowed: a `BowerError` with one short sentence for the person, details to `console.error`.
- The app never hard-deletes (Drive Bin only), never writes `index.md`, `hot.md`, `log.md`, nor Bower's sections of a note. Every content write passes the modifiedTime it read; a move or rename checks the name and place it read (`stillAsSeen`), since a text change elsewhere does not clash with it.
- Sign-out forgets what this device kept about the person (`data/device.ts`); the journal outbox stays at sign-out, since its lines are changes already made in that folder (keyed by folder, never sent to another).
- Bower on screen: one animated bird per screen (`bird/presence.ts`); respect "Bower moves" and reduced motion.
- Brand tokens: `src/styles/tokens.json`, then `pnpm tokens`. Teal and amber are fills; text uses `--brand-line` / `--accent-line`.
- `public/landing/` is exported from the design canvas: do not edit it by hand; mechanical fixes go in `scripts/fix-landing.mjs`, run after each export.
- Reuse before building (owner, 2026-10-06): reuse features that already worked in the original Bower app and existing libraries or samples; record the source and reason in the entry. They still pass tests, review and the no-personal-data rule.
- Research first, always (owner, 2026-10-06). Before designing or ruling on any problem, search the web for how it is usually solved, the recommended practice and the relevant standards (specs, official docs, well-known libraries, successful apps and repositories). Then follow that. Cite the sources in the decision, packet or commit. Only design our own when nothing fits, and say why.
- Simplest proven approach (owner, 2026-10-06): for complex or rare cases, copy how successful apps or repositories solve it; limit or reload rather than perfect, if honest and lossless.
- Gates before a commit: `pnpm check`; screens also their e2e on demo and fake. Full `pnpm e2e`, `pnpm e2e:fake` and `pnpm e2e:pwa` run once per integration batch and at the freeze (TL-P2-38). At most two workers at once on this machine.
