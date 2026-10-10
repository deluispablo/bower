p4-rate-limits adversarial review

Verdict: BLOCK

- **Blocking — api/src/security.ts:167**
  `GET /auth/login` without `CF-Connecting-IP`, rotating `X-Forwarded-For` → unlimited 302 responses.
  The caller selects fresh buckets instead of sharing the missing-address bucket; request 21 escapes 429.
  Missing red: absent CF header with spoofed forwarding headers.

- **Blocking — api/src/auth.ts:293**
  Twenty same-origin `POST /auth/logout` requests without a valid session → 204 and twenty quota hits.
  The next legitimate `GET /auth/login` → 429 although those logout requests retired nothing.
  Counting precedes authentication at line 297, violating the checks-before-counting contract.
  `api/test/rate-limits.test.ts:121` expects quota enforcement without a session, weakening that contract.

- **Blocking — api/src/security.ts:193**
  Production environment missing a binding and the new optional flag → unrestricted login 302 instead of 500.
  No real configuration sets `RATE_LIMIT_REQUIRED`; fail-closed behavior depends on an unwired opt-in.
  `api/test/rate-limits.test.ts:125` fabricates the flag, so its red does not establish production behavior.
  `api/test/no-rate-limit-bindings.ts:9` removes bindings globally, allowing other suites through that fallback.

Minor:

- `api/src/auth.ts:235`: a valid OAuth callback with a missing or throwing binding → 302, hiding its internal error.
- Notes retain obsolete “blocked before implementation” statements alongside completed implementation claims.
- No second rate-limit mechanism remains; baselines only shrink; `/process` and production config are unchanged.
- Static review only; API tests were not run, as requested.
