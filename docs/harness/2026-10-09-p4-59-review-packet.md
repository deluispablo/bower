# Packet: P4-59 review (c4-api-audit, dependency change)

This review is read-only and fresh. Do not install, deploy or run network commands. Read the lockfile and the notes, and run `pnpm -C api test` only through `bash harness/with-lock.sh` if you need to. Run git with `-C /private/tmp/bower-c4-audit`.

## What to review

- **Diff:** `git diff 4e974929ed67b1021af5c0b77eff7e384a98986c..c4-api-audit` (upgrade 2e29fd6c, notes ae39de9b).
- **Packet:** `docs/harness/2026-10-09-c4-api-audit-packet.md`. The ruling is TL-P4-22 addendum 19.

## Look hardest at

- **The two-week rule.** `wrangler` is now an exact 4.140.0, down from ^4.141.0. `@cloudflare/vitest-pool-workers` is an exact 0.22.0. Check each version's release date against the notes, and against the two-week rule as of 2026-10-09.
- **Overrides** in `pnpm-workspace.yaml`: undici 7.29.1 and sharp 0.35.4. The notes say pnpm 12 ignores `package.json` `pnpm.overrides`. Check:
  - that the overrides apply to the whole workspace and do not change any production (Worker bundle or app) dependency;
  - that sharp 0.35.4 is the honest choice: 0.35.5 fixes a librsvg CVE but is younger than two weeks;
  - that the remaining advisory is listed with its reason and its clear date (2026-10-11).
- **The lockfile.** 361 lines deleted. Nothing outside the api tooling tree changed unexpectedly. No new packages, and no registry other than npm.
- **Evidence.** The red (audit before) is recorded; the dry run and api tests passed (the logs are named in the notes).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
