Google setup v3, contracts-2/P2 R1/R2/R4. Actual Google OAuth/Drive cases remain NOT RUN.

Authoritative instructions: /private/tmp/bower-google-probe-setup-v3.md. Reuses the already registered fixed http://localhost:8788/auth/callback. Adds only https://accounts.google.com to form-action, following the coordinator's actual native two-origin CSP red/control. No external OAuth configuration changed.

```sh
node --test self-check.test.mjs review-regressions.test.mjs callback-reuse.test.mjs csp-policy.test.mjs
node --check oauth-local.mjs
node --check adapter.mjs
node --check inspect.mjs
```

Tests bind ephemeral IPv4 loopback only and never follow the Google redirect. V2 and original preserved. Current actual local result:30pass/0fail/0skip; seven syntax modules pass. Public packets contain no private config, credential, session, actual project/client/subject/folder IDs.

After review/configuration and real owner interactive consent, the CLI listener defaults to127.0.0.1:8788 but must be opened as http://localhost:8788/. Host/origin validation deliberately refuses the127.0.0.1 alias. Private original existing client credentials are required; no secret rotation/new secret/client is authorized. Account A has live dependency, so its project grant must never be revoked by these probes or cleanup.

A direct script execution flag is not permission by itself. Exact scope/resource/budget execution packet must be current at every new remote dispatch; already issued I/O is neither cancelled nor rolled back. Current transport is GET only; remote writes/uploads/revocation are absent and require separately reviewed bounded cases.
