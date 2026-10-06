# Technical-lead decision TL-P3-2026-10-07-07: staging's default source, and sign-in callback failures

**Coordinator questions, 2026-10-07,** from the `worker-google-oidc` delivery.

1. **Staging stays demo by default during P3; the real source is `?source=real`.** The real source cannot yet create a folder or get a Drive token, so making it the default now would greet anyone who opens staging with a half-working app. No build flag is added now. When P3-E (`compatibility-accepted-app`) passes, one entry adds a build-time default (`VITE_SOURCE=real` for the staging Worker build). Demo and fake stay reachable through `?source=`.
2. **A failed sign-in callback redirects back to the app, never a JSON page.** The callback is a browser navigation, so a JSON 401 or 400 would leave the person on a raw error page. That includes a person cancelling Google's consent, which OAuth reports as an `error` parameter on the redirect ([RFC 6749 §4.1.2.1](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1)).
   - The Worker redirects to the app's sign-in with `?signin=cancelled` (the person declined) or `?signin=failed` (state, PKCE or token checks failed, or the account is not on the allowlist).
   - The sign-in screen shows one sentence: "Sign-in was cancelled." or "Bower couldn't sign you in. Try again."
   - Details go to the Worker log only. The redirect never says why it failed beyond those two words.
   - The JSON codes of TL-P3-05 stay for `fetch` calls.
   - The [Worker contract](../specs/2026-10-04-worker-contract.md) row for `GET /auth/login` says this.

   This is a fix item for the OIDC review round, with a test for each of the two redirects.
3. **Noted from the delivery, accepted:**
   - the person schema step 2 (account table), with its tested migration;
   - one re-prompt for consent when Google returns no refresh token (`prompt=consent`, the standard way to obtain one again).
