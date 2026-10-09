# Packet: c4-api-audit (TL-P4-22 addendum 19; low priority, mechanical)

- **Entry:** `c4-api-audit`. Worktree `/private/tmp/bower-c4-audit`, branch `c4-api-audit` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 19 (main 5944ce2d);
  - DEFECT_LOG `api-dev-audit-advisories`;
  - AGENTS "reuse existing libraries" and "research the standard solution first".
- **Starting model:** `bower-mechanical`. This entry needs the network for `pnpm install`, so it is not given to Codex.

## Today

`pnpm audit` in `api/` reports 12 advisories:
- sharp below 0.35.5 (high ×2);
- undici 7.x below 7.29.1 (high ×2, moderate ×4, low ×2);
- two more.

Every path comes through `wrangler`/`miniflare` and `@cloudflare/vitest-pool-workers`, which are dev and deploy tooling, not the Worker bundle. Root `pnpm audit --prod` is clean.

## Contract

1. **Raise the tooling.** First, raise `wrangler` and `@cloudflare/vitest-pool-workers` in `api/package.json` to the newest releases that are **at least two weeks old** and clear the advisories. Check each release date on the npm registry and cite it in the notes.
2. **If no such release clears them,** add exact `pnpm.overrides` (in the root package.json, where pnpm reads them) for `undici` and `sharp`, at the lowest patched versions that are also at least two weeks old.
3. **The lockfile** is updated with `pnpm install`. No other dependency changes.
4. **Never run a real deploy.** `wrangler deploy --dry-run` only, with no Cloudflare token needed and none used. Never touch production or staging.

## Verify

- `pnpm audit` in `api/` is clean, or each remaining advisory is listed in the notes with its reason (for example, no patched release older than two weeks).
- `pnpm -C api test` is green.
- `pnpm -C api exec wrangler deploy --dry-run --outdir /tmp/c4-audit-dry` runs to the end.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The upgrade, with the lockfile.
2. The notes (`docs/harness/2026-10-09-c4-api-audit-notes.md`): versions before and after, release dates, the audit output before and after, and the dry-run result.

There is no red commit. The audit output before the change is the red: record it in the notes. The card carries `worktree:`.
