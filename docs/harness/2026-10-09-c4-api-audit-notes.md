# c4-api-audit notes (TL-P4-22 addendum 19)

Cutoff: two weeks before 2026-10-09 is 2026-09-25T19:22Z.

## Versions and release dates (npm registry)
- wrangler: before ^4.141.0 (resolved 4.141.0, 2026-09-25T19:24Z, too new by 2 min); after 4.140.0 (2026-09-25T05:54Z). Newer 4.142.0+ are inside two weeks.
- @cloudflare/vitest-pool-workers: before ^0.22.0 (0.22.0, 2026-08-18); after 0.22.0. 0.23.0 (2026-10-07) is too new.
- undici: override 7.29.1 (2026-09-04). Patches all undici advisories (>=7.29.1). 7.29.0 is the previous line.
- sharp: override 0.35.4 (2026-08-26). 0.35.5 (2026-09-27) is too new until 2026-10-11.

## Mechanism
- pnpm 12 ignored pnpm.overrides in root package.json for this workspace; the lockfile only changed with overrides in pnpm-workspace.yaml. Overrides live there.

## Audit before (api/, pnpm audit)
```
12 vulnerabilities found
Severity: 3 low | 5 moderate | 4 high
```

## Audit after
```
1 vulnerabilities found
Severity: 1 high
```
Remaining: 1 high, sharp librsvg CVE-2026-96889 (patched only in sharp 0.35.5, released 2026-09-27, not yet two weeks old). Path: api>@cloudflare/vitest-pool-workers>miniflare>sharp. Dev tooling only. Re-check after 2026-10-11 and set sharp to 0.35.5 then.

## Verify
- pnpm -C api test: exit 0 (/private/tmp/c4-api-test.log)
- wrangler deploy --dry-run --outdir /tmp/c4-audit-dry: exit 0, after pnpm build (/private/tmp/c4-dry.log, /private/tmp/c4-build.log)
- bash harness/with-lock.sh pnpm check: exit 0 (/private/tmp/c4-check.log)
- No real deploy, no token, no staging or production touched.

tests changed: none
