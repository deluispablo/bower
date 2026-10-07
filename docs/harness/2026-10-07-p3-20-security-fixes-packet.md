# Packet: P3 security fixes (P3-20)

Seven fix entries come from the security review: `docs/harness/2026-10-07-p3-security-review.md`, findings F1–F8 ([TL-P3-26](2026-10-07-tl-p3-26-security-review-and-freeze.md): security fixes come before the freeze). Each worker is told which entry is theirs. Read **only your section**, plus the finding it names in the review file.

**Common rules:**
- Work in the checkout and branch named in your prompt.
- Never push or deploy. Never run `wrangler`, `gh` or any live call.
- Commit the red tests on their own before the fix, so `done.sh --fixed-in` gets an assertion red. Use `expect(...)`, never a thrown `Error`.
- Gates: the entry's verify (red first), then `pnpm check` in full. Never write `harness/` records or run `done.sh`.
- A commit under `src/features/**` or `src/data/contracts/**` needs a row in `docs/harness/2026-10-07-p3-compatibility.md`.
- Reply with the implementer delivery card in `docs/harness/WORKER.md`.

## token-key-rotation-reconsent (bower-escalated; F1, Important)

- **Read:** `api/src/drive-token.ts`, `api/src/crypto.ts`, `api/src/person.ts` (`signIn`, about line 134), `api/src/auth.ts` (the callback, about line 257), `api/src/errors.ts`, `api/src/runner.ts` (its token route) and the `TOKEN_ENC_KEY` rotation section of `docs/runbook.md`.
- **Fix:**
  - A refresh token that fails to decrypt is handled like Google's `invalid_grant`: run `forgetGoogleAccess`, so the session generation rises, and answer 401 `signed-out`. Never answer 500.
  - Do this on the app's `GET /drive/token` and on the runner's token route. There, the run fails with the existing signed-out handling; say exactly what the run shows in your card.
  - `signIn` never keeps an unreadable token. The callback asks for consent (`prompt=consent`) whenever the person holds no readable refresh token.
  - Update the runbook's rotation section to match.
- **Named test:** `an unreadable refresh token signs the person out and the next sign-in asks for consent`.
- **Scope:** `api/src/**` and its tests, plus `docs/runbook.md` (the rotation section only). `cookie-host-prefix` comes after you, in the same files.

## tidy-pin-actions (bower-mechanical; F2, Important)

- **Read:** `runner/workflows/tidy.yml` and `runner/test/new-instance.test.ts`, for how runner tests read files.
- **Fix:**
  - Pin `actions/checkout` and `actions/setup-node` to the full commit SHAs that their `v5` tags point to now. Keep the tag in a trailing comment.
  - Find each SHA with `git ls-remote https://github.com/actions/checkout refs/tags/v5`, and the same for `setup-node`. That is a read-only network call, allowed for this one step. Record the SHAs and the date in your card.
- **Named test:** `every action in tidy.yml is pinned to a commit SHA`, in `runner/test/`. It requires `@<40 hex>` on every `uses:`.
- **Scope:** `runner/workflows/tidy.yml` and the new test.

## app-security-headers (bower-implementer; F3, Important)

- **Read:**
  - `api/wrangler.jsonc`, `api/src/security.ts` (lines 39–42 and the Worker's own headers) and `vite.config.ts`;
  - the landing under `public/landing/` (exported: never edit it by hand);
  - [Cloudflare static assets headers](https://developers.cloudflare.com/workers/static-assets/headers/).
- **Fix:**
  - `public/_headers` gives the app's documents (`/*`) and the landing:
    - a `Content-Security-Policy` that allows only `'self'`, Google's API and sign-in origins the app actually calls, and the Worker (the same origin);
    - `frame-ancestors 'none'`;
    - `Strict-Transport-Security` with a sensible max-age;
    - `X-Content-Type-Options: nosniff`.
  - List the origins you allow and why. If the landing needs a looser policy (fonts, for example), give it its own block.
  - Correct the `security.ts` comment.
- **Named test:** `the built app ships its security headers`, in `src/docs.test.ts`. It reads `public/_headers` (Vite copies it to `dist/`) and asserts the four headers on `/*`.
- **Extra gates:**
  - `pnpm e2e`, `pnpm e2e:fake` and `pnpm e2e:pwa` in full on private port 5196.
  - `vite preview` serves no `_headers`, so also check the CSP by loading `dist/` with the headers applied (a tiny static server in a test or script), and confirm the app and the landing log no CSP violation.
- **Scope:** `public/_headers`, `api/src/security.ts` (comment only), `src/docs.test.ts`, and a test helper if needed.

## cookie-host-prefix (bower-implementer; F4, Minor), after token-key-rotation-reconsent

- **Read:** `api/src/session.ts` (about line 317), `api/src/auth.ts` (about line 55) and their tests.
- **Fix:**
  - Rename `bower_session` to `__Host-bower_session` and `bower_oauth` to `__Host-bower_oauth`, each with `Secure`, `Path=/` and no `Domain`.
  - On the next response, expire the old names, so everyone is signed out once.
- **Named test:** `the session and sign-in cookies carry the __Host- prefix`.
- **Scope:** `api/src/session.ts`, `api/src/auth.ts` and their tests.

## log-no-folder-content (bower-implementer; F5 and F6, Minor)

- **Read:** `runner/src/effects.ts` (about line 85), `runner/src/still-as-seen.ts` (about line 61, the pattern to follow) and `src/data/spine/plan.ts` (about line 301).
- **Fix:**
  - The runner logs the operation ordinal or the file id, never a note path.
  - An unreadable journal file is logged by file id and "not valid JSON" only, never the parser's message.
- **Named tests:**
  - `a failed read-back logs no note path` (runner);
  - `an unreadable journal file logs no text` (`src/data/spine`).
  - Both capture `console` and assert that no path or file text appears.
- **Scope:** `runner/src/effects.ts`, `src/data/spine/plan.ts` and their tests.

## instance-private-check (bower-mechanical; F7, Minor)

- **Read:** `scripts/new-instance.sh` (about line 110) and `runner/test/new-instance.test.ts`.
- **Fix:** before any clone or push, refuse unless `gh repo view <repo> --json visibility -q .visibility` prints `PRIVATE`. The refusal is one sentence.
- **Named test:** `new-instance refuses a public repository`, with `gh` stubbed.
- **Scope:** the script and its test.

## deletion-allowlist-doc (bower-mechanical; F8, Minor)

- **Read:** `docs/runbook.md` (the Accounts and Deletion sections), `api/src/store.ts` (about line 14), `api/src/me.ts` (about line 40) and `src/docs.test.ts`.
- **Fix:** in Accounts and Deletion, say that "Delete my account" leaves the operator's invitation (the KV allowlist entry), and how the operator removes it by hand.
- **Named test:** `the runbook says the invitation stays after deletion`, in `src/docs.test.ts`.
- **Scope:** `docs/runbook.md` and `src/docs.test.ts`.
