# P2 staging preview

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
