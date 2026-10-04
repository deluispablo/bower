# AGENTS.md

The map for any agent working on the Bower app rebuild. Short on purpose; the detail is in `docs/`.

## Start here, every session

1. Read `docs/harness/METHOD.md` (how work is done) once, then the last lines of `harness/progress.md` and `git log --oneline -15`.
2. `bash harness/init.sh`: installs, runs every gate, prints the next open entry of `harness/features.json`.
3. One entry at a time, test first; flip `passes` only after its `verify` is green; one line in `progress.md`; one commit.

## Where things are

- Specs: `docs/specs/` (UI, who does what, the Worker contract). Plans and their ledgers: `docs/superpowers/plans/`.
- Phases: 1 UI on demo data (done), 2 logic over Drive and the Worker (done, fixing findings), 3 the Worker, 4 the agent. No next phase while an entry is open.
- Screens: `src/features/`, shell `src/app/`, parts `src/ui/`, Bower the bird `src/bird/`.
- Data: screens only use `src/data/sources.ts` through `provider.tsx`. Sources: `demo/` (in memory), `vault/` + `drive/` + `live/` + `worker/` (real), `fake/` (pretend Drive and Worker). `choose.ts` picks one (`?source=demo|fake|real`).
- Subagent briefs: `harness/briefs/` (implementer, evaluator, reviewer).

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
