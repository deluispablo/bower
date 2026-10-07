# Staging

> **From P3-4 ([TL-P3-06](2026-10-06-tl-p3-06-worker-staging.md), [TL-P3-08](2026-10-07-tl-p3-08-production-guard.md)), staging is the app plus the Worker on one origin.** Deploy: on the new `main`, run `pnpm install --frozen-lockfile` and `env -u VITE_API_URL pnpm build`, then scan `dist/` as below. Then, from `api/`, run `npx wrangler deploy --var APP_ORIGIN:<staging origin> --var API_ORIGIN:<staging origin> --var APP_VERSION:<main short SHA>`. The output must name `bower-staging`, never `bower-api`. Check `/`, `/?source=fake`, a deep link, `/landing/`, `/health` (must name that SHA) and `/me`. Secrets and KV are set once, as TL-P3-06 says. The P2 static-preview steps below are history.

## P2 static preview (history)

[TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) defines this. It is a static preview of `main`, so the owner can try the app and give feedback. It has no Worker, no secrets and no real Drive. It runs the demo by default, and `?source=fake` gives the full simulated app. It is separate from the original production app and its Pages project, which are never touched.

**Where.** A Cloudflare Worker with static assets, named `bower-staging`, at `bower-staging.<account>.workers.dev`. Cloudflare now hosts new Pages projects on Workers. The account's subdomain is kept out of this repository.

**Deploy.** The lead does it after each `main` update, from its documentation checkout:

1. Check out the new `main` SHA. Run `pnpm install --frozen-lockfile --offline`. Then run `pnpm build` with `VITE_API_URL` unset.
2. Scan `dist/` for personal data. The only address allowed is `you@example.com`.
3. Deploy from a directory outside the repository that holds a copy of `dist/` and this `wrangler.jsonc`, with the wrangler login the owner made:

```jsonc
{
  "name": "bower-staging",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
}
```

```bash
wrangler deploy
```

`not_found_handling` serves `index.html` for deep links before the service worker installs ([Workers static assets: single-page applications](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).

4. Check `/`, `/?source=fake`, a deep link and `/landing/`. Give the owner the address and the SHA.

P3 replaces this preview with the real staging environment: Worker plus real services, as in P3_DRAFT.

**Deployments:**

- 2026-10-06, `main` `457b7d3` (P2 batch 1), version `987a46aa`.
- 2026-10-06, `main` `2d92e96` (P2 batch 2), version `458b556c`.
- 2026-10-06, `main` `a1b9ec0` (P2 batch 3), version `b3e83d1b`.
- 2026-10-06, `main` `3939760` (P2 batch 4), version `0bea1818`.
- 2026-10-06, `main` `4d7ab08` (P2 batch 5), version `826a00ad`.
- 2026-10-06, `main` `cc54d83` (P2 closed, dossier `3e6e7da`), version `0996fb05`.
- 2026-10-06, `main` `605bbaa` (P2 re-closed, dossier `00ec9a5`), version `ec070ce8`.
- 2026-10-07, `main` `d5e4a74` (P3-4, first app plus Worker deploy), version `082fbde9`. `/health` and `/me` answer 500 `internal` until the owner sets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- 2026-10-07, `main` `1bd434c` (P3-5: Drive token, Bower folder, /me pointer), version `7c93f7e6`. All Worker checks are green.
- 2026-10-07, `main` `11825b5` (sign-in always shows Google's account chooser), version `6134569a`.
- 2026-10-07, `main` `7bd77ce` (P3-6: client retry policy, lost-reply reconcile, Worker logs and version, `GET /status`), version `b3ad5f8f`. `/health` names `7bd77ce`; `/status` and `/me` answer 401 `signed-out` without a cookie. The first check right after the deploy still saw the previous version, so a check that disagrees is rerun once before it counts.
- 2026-10-07, `main` `50108ab` (P3-7: one active session on the real source, delete with the generation floor, status re-arm), version `af168bbd`. `/health` names `50108ab`; `/me` and `/status` answer 401 without a cookie.
