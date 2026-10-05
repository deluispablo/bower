Google setup v4, 2026-10-05-contracts-2/P2 O2 R1/R2/R4. Actual v4 Google OAuth/Drive cases remain NOT RUN.

Authoritative handoff: /private/tmp/bower-google-probe-setup-v4.md. Fixed existing callback remains http://localhost:8788/auth/callback. Only a valid landing GET / without query receives Referrer-Policy same-origin, so a native same-origin form POST can retain the exact Origin. Every other response retains no-referrer. Original v1/v2/v3 preserved. No Google client/audience/scope/redirect configuration change.

```sh
node --test self-check.test.mjs review-regressions.test.mjs callback-reuse.test.mjs csp-policy.test.mjs origin-policy.test.mjs
node --check oauth-local.mjs
node --check adapter.mjs
node --check inspect.mjs
```

Actual local tests: 36 pass, 0 fail/skip; eight syntax modules pass. Tests bind ephemeral IPv4 loopback, use synthetic clients and mock token/Drive responses, and never follow a Google redirect. Public packet contains no real credential/config/session/client/project/subject/folder ID. Example files are deliberately unusable placeholders.

After independent review and a current root-owned bounded execution packet, the root listener defaults to 127.0.0.1:8788 and must be opened as http://localhost:8788/. The 127.0.0.1 browser alias remains refused. Root already validated the privately supplied existing-client correspondence; that does not prove secret validity or grant. Actual interactive designated-account login/consent remains pending. Account A has a live dependency: never revoke its project grant or rotate/delete the client. Stop only the owned listener/tab. Already issued I/O is neither cancelled nor rolled back.

This adapter transport permits bounded read-only GETs only. No bootstrap write, upload, revocation, P3 Worker/session implementation or provider acceptance is included. Dedicated synthetic resources and current budgets remain required for any later individually reviewed real probe.
