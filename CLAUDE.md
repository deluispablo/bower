# CLAUDE.md

Bower: a PWA that tidies a person's Google Drive folder into a second brain. Product: `docs/PRODUCT.md`. Architecture and the mechanism map: `docs/ARCHITECTURE.md`. Operations: `docs/runbook.md`.

## Commands

```bash
pnpm install
pnpm dev          # the demo at http://localhost:5190
pnpm check        # lint, types, unit tests (app, api, runner), builds, duplication, unused code, dependencies, bundle, landing
pnpm e2e          # Playwright on the demo, phone and desktop, with axe
pnpm e2e:fake     # the same suite over the pretend Drive and Worker
```

Gates: `pnpm check` plus the touched screens' e2e for every change; the full e2e suites before merging to `main`. Heavy runs share one lock (`testing/with-lock.sh`). Test output goes to a file; read only the failures.

## Where things are

- Screens `src/features/`, shell `src/app/`, parts `src/ui/`, Bower the bird `src/bird/`.
- Data goes through `src/data/sources.ts` and `provider.tsx`. Sources: `demo/`, `fake/` (pretend Drive and Worker) and real (`vault/`, `drive/`, `live/`, `worker/`), picked by `choose.ts` (`?source=`).
- The Worker is `api/`, the runner is `runner/`, the end-to-end suites are `e2e/`.
- Contracts `docs/specs/`, UI specs `docs/design/specs/`.
- Test fixtures, the synthetic corpus, the timer gate and the gate baselines: `testing/`.

## Hard rules

- No personal data: names, places, companies, emails and vault content are made up (`Alex`, `you@example.com`, `FOLDER_ID`). The one exception: the owner's GitHub links (`github.com/deluispablo`, its `bower` repo), which the landing needs as a portfolio.
- Development stays local. Only accepted local `main` is backed up to the private `deluispablo/bower-app`; no other branch or tag, no force push, no deployment without the owner. No secrets in the repo.
- English everywhere. UI copy: sentence case, plain words, never "vault", no file names or jargon in sentences. Bower is a bowerbird, never "the bird" in copy.
- TypeScript strict, no `any`. Errors are never swallowed: a `BowerError` with one short sentence for the person, details to `console.error`.
- The app never hard-deletes (Drive Bin only), never writes the runner's files in `.bower/` (including `index.md`, `hot.md` and `log.md` there), nor Bower's sections of a note. Every content write passes the modifiedTime it read; a move or rename checks the name and place it read (`stillAsSeen`), since a text change elsewhere does not clash with it.
- Sign-out forgets what this device kept about the person (`data/device.ts`); the journal outbox stays at sign-out, since its lines are changes already made in that folder (keyed by folder, never sent to another).
- Bower on screen: one animated bird per screen (`bird/presence.ts`); respect "Bower moves" and reduced motion.
- Brand tokens: `src/styles/tokens.json`, then `pnpm tokens`. Teal and amber are fills; text uses `--brand-line` / `--accent-line`.
- `public/landing/` is exported from the design canvas: do not edit it by hand; mechanical fixes go in `scripts/fix-landing.mjs`, run after each export.
- Each mechanism has one home (`docs/ARCHITECTURE.md`, mechanism map); never add a second way to do what one already does. Fix a defect at its cause, in that home.
- Research the standard solution first and cite it; reuse the original app and existing libraries; take the simplest proven approach for rare cases (a limit or a reload, if honest and lossless).
