# AGENTS.md

The Bower app rebuild. Owner authorization and roles: `docs/harness/GOVERNANCE.md` (P2 → P3 continuation authorized; P4 not). Phases: `docs/PHASES.md`.

## Start here: read only what your role needs (token budget, TL-P2-41)

- **Worker** (implementer, reviewer, evaluator): read `docs/harness/WORKER.md` and your packet. Nothing else unless the packet names it.
- **Coordinator**: `docs/harness/HANDOFF.md` (current state, kept short) and the current `docs/harness/ACTIVE.md`; `harness/briefs/coordinator.md` once per session.
- **Technical lead**: `docs/harness/LEAD.md` (its own state), `docs/harness/DECISIONS.md` (one line per ruling) and `harness/briefs/technical-lead.md`; open a full planning doc only for the section in question.
- Every session writes its own state to these files at batch boundaries and after decisions (TL-P2-43); no session clears itself, the owner compacts by hand (TL-P2-45); nothing important lives only in chat.
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
- The app never hard-deletes (Drive Bin only), never writes `index.md`, `hot.md`, `log.md`, nor Bower's sections of a note. Every content write passes the modifiedTime it read; a move or rename checks the name and place it read (`stillAsSeen`), since a text change elsewhere does not clash with it.
- Sign-out forgets what this device kept about the person (`data/device.ts`); the journal outbox stays at sign-out, since its lines are changes already made in that folder (keyed by folder, never sent to another).
- Bower on screen: one animated bird per screen (`bird/presence.ts`); respect "Bower moves" and reduced motion.
- Brand tokens: `src/styles/tokens.json`, then `pnpm tokens`. Teal and amber are fills; text uses `--brand-line` / `--accent-line`.
- `public/landing/` is exported from the design canvas: do not edit it by hand; mechanical fixes go in `scripts/fix-landing.mjs`, run after each export.
- Owner rules (2026-10-06): research the standard solution first and cite it; reuse the original app and existing libraries; simplest proven approach for rare cases (limit or reload, if honest and lossless).
- Gates: `pnpm check` plus the touched screens' e2e per entry; full e2e suites per integration batch and at the freeze. Test output goes to a file; read only failures. At most two workers at once.
