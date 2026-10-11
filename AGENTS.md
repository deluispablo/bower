# AGENTS.md

The Bower app rebuild. Owner authorization and roles: `docs/harness/GOVERNANCE.md` (P2 and P3 accepted; P4 authorized 2026-10-07, plan `docs/P4_PLAN.md`). Phases: `docs/PHASES.md`.

## Start here: read only what your role needs (token budget, TL-P2-41)

- **Worker** (implementer, reviewer, evaluator): read `docs/harness/WORKER.md` and your packet. Nothing else unless the packet names it.
- **Coordinator**: `docs/harness/HANDOFF.md` (current state, kept short) and the current `docs/harness/ACTIVE.md`; `harness/briefs/coordinator.md` once per session.
- **Technical lead**: `docs/harness/LEAD.md` (its own state), `docs/harness/DECISIONS.md` (one line per ruling) and `harness/briefs/technical-lead.md`; open a full planning doc only for the section in question.
- **Designer** (`Diseñador`, TL-P4-18): `harness/briefs/designer.md` via `/bower-design`. It talks with the owner directly, never edits app code, and hands specs to the lead. It answers UI consults from the lead and the coordinator, and verifies every built UI change before its entry closes (TL-P4-18 addendum 3).
- **Codex takeover (TL-P4-56).** If Claude is unavailable, Codex sessions hold these same roles under the same method: `docs/harness/CODEX_TAKEOVER.md` maps each Claude mechanism to its Codex one.
- Every session writes its own state to these files at batch boundaries and after decisions (TL-P2-43); no session clears itself, the owner compacts by hand (TL-P2-45); nothing important lives only in chat.
- **Output (TL-P3-17, TL-P3-29).** Only the lead (and the designer, TL-P4-18) talks to the owner. The coordinator and every worker write for no reader: no text between tool calls, and the end of a coordinator turn is one line. A worker's final reply is its card from `WORKER.md`, each line under 120 characters, with details in a notes file. Messages between sessions stay complete and are 10 lines at most. The coordinator never asks the owner anything (no question tool, no question in its output): it messages the lead, who rules or asks the owner (TL-P4-02).
- **Defects (TL-P4-15).** Nothing is fixed where it shows: log it, diagnose it, the lead rules on the design, then implement (`docs/harness/DEFECTS.md`). Each mechanism has one home (`docs/ARCHITECTURE.md`, mechanism map); never add a second way to do what one already does.
- **Integration (TL-P4-17, TL-P4-19).** Merges go only through `harness/integrate.sh`, which also removes the merged branch and worktree. Only the coordinator switches the main checkout's branch; other sessions use their own worktrees (`docs/harness/COORDINATION.md`).
- Never read `harness/features.json` whole (query it with `jq`), archives, history files or old reviews unless the task is about them.

## Where things are

- Planning: `docs/PRODUCT.md`, `docs/WORK_PLAN.md`, `docs/P2_ACCEPTANCE.md`, `docs/ARCHITECTURE.md`, `docs/specs/`. Method: `docs/harness/METHOD.md`, `COORDINATION.md`. Decisions: `docs/harness/DECISIONS.md`.
- Code: screens `src/features/`, shell `src/app/`, parts `src/ui/`, Bower the bird `src/bird/`. Data through `src/data/sources.ts`/`provider.tsx`; sources `demo/`, `fake/` (pretend Drive/Worker), real (`vault/`, `drive/`, `live/`, `worker/`), picked by `choose.ts` (`?source=`).
- Skills: `.agents/skills/` (canonical), linked from `.claude/skills/`.

## Hard rules

- No personal data: names, places, companies, emails, vault content are made up (`Alex`, `you@example.com`, `FOLDER_ID`). The one exception: the owner's GitHub links (`github.com/deluispablo`, its `bower` repo), which the landing needs as a portfolio.
- Development stays local. Owner-authorized exception: back up only accepted local `main` to private `deluispablo/bower-app`, following `docs/harness/BACKUP.md`. Workers never push; no other branch/tag, force push or deployment. No secrets in the repo.
- English everywhere. UI copy: sentence case, plain words, never "vault", no file names or jargon in sentences. Bower is a bowerbird, never "the bird" in copy.
- TypeScript strict, no `any`. Errors are never swallowed: a `BowerError` with one short sentence for the person, details to `console.error`.
- The app never hard-deletes (Drive Bin only), never writes the runner's files in `.bower/` (including `index.md`, `hot.md` and `log.md` there, TL-P4-45), nor Bower's sections of a note. Every content write passes the modifiedTime it read; a move or rename checks the name and place it read (`stillAsSeen`), since a text change elsewhere does not clash with it.
- Sign-out forgets what this device kept about the person (`data/device.ts`); the journal outbox stays at sign-out, since its lines are changes already made in that folder (keyed by folder, never sent to another).
- Bower on screen: one animated bird per screen (`bird/presence.ts`); respect "Bower moves" and reduced motion.
- Brand tokens: `src/styles/tokens.json`, then `pnpm tokens`. Teal and amber are fills; text uses `--brand-line` / `--accent-line`.
- `public/landing/` is exported from the design canvas: do not edit it by hand; mechanical fixes go in `scripts/fix-landing.mjs`, run after each export.
- Owner rules (2026-10-06): research the standard solution first and cite it; reuse the original app and existing libraries; simplest proven approach for rare cases (limit or reload, if honest and lossless).
- Gates: `pnpm check` plus the touched screens' e2e per entry; full e2e suites per integration batch and at the freeze. Test output goes to a file; read only failures. At most one Claude and three Codex workers at once, four Codex after `codex-run.sh` (TL-P4-29, TL-P4-31).
