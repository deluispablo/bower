# Staging

> **From P3-4 ([TL-P3-06](2026-10-06-tl-p3-06-worker-staging.md), [TL-P3-08](2026-10-07-tl-p3-08-production-guard.md)), staging is the app plus the Worker on one origin.** Deploy with `scripts/deploy-staging.sh <main SHA> <staging origin>` ([TL-P3-24](2026-10-07-tl-p3-24-real-runs-and-the-rest-of-p3.md)). It refuses a dirty checkout, a SHA that is not local `main`'s tip and any config but `bower-staging` with the staging KV; then it installs, builds, scans, deploys, checks `/health` (rerun once) and waits up to 5 minutes for `/status` to answer 401 JSON (version skew, below), and builds and scans the runner bundle without running `new-instance.sh`. `BOWER_GITHUB_REPO` overrides the instance repository. The other checks below stay by hand. Fallback, by hand: on the new `main`, run `pnpm install --frozen-lockfile` and `env -u VITE_API_URL pnpm build`, then scan `dist/` as below. Then, from `api/`, run `npx wrangler deploy --var APP_ORIGIN:<staging origin> --var API_ORIGIN:<staging origin> --var APP_VERSION:<main short SHA> --var GITHUB_REPO:deluispablo/bower-home`. The output must name `bower-staging`, never `bower-api`. Check `/`, `/?source=fake`, a deep link, `/landing/`, `/health` (must name that SHA), `/me` and `/runner/runs/x/token` (401 JSON, never the app page). When `runner/` changed, run `scripts/new-instance.sh deluispablo/bower-home <staging origin>` from the same checkout, after scanning `runner/dist/runner.mjs` as for `dist/`. Secrets and KV are set once, as TL-P3-06 says.

**Version skew (TL-P3-20).** For a short while after a deploy, a Worker on the new version can still reach a person object running the old one. Cloudflare says this lasts "seconds to minutes", and asks that Worker↔Durable Object changes stay compatible both ways ([gradual deployments with Durable Objects](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/)). On 0b64dcb, a new method answered "The RPC receiver does not implement the method" for A for several minutes. So:
- the first smoke after a deploy that adds person-object methods waits for one 200 before reading results;
- a persisting failure is answered with a redeploy of the same version, which restarts the objects;
- the Worker answers that error with 503 and `Retry-After`, never 500 (entry `do-version-skew`).

Past logs need the dashboard. Wrangler's login cannot query the telemetry API, so the lead uses `wrangler tail bower-staging --format json` with no status filter: a handled 500 has the outcome "ok", which `--status error` misses. The P2 static-preview steps below are history.

## P2 static preview (history)

[TL-P2-39](2026-10-06-tl-p2-39-main-and-staging.md) defines this. It is a static preview of `main`, so the owner can try the app and give feedback. It has no Worker, no secrets and no real Drive. It runs the demo by default, and `?source=fake` gives the full simulated app. It is separate from the original production app and its Pages project, which are never touched.

**Where.** A Cloudflare Worker with static assets, named `bower-staging`, at `bower-staging.<account>.workers.dev`. Cloudflare now hosts new Pages projects on Workers. The account's subdomain (`bower-api`) is not personal or secret and appears in the staging origin in these docs (TL-P3-27); the guard is the Worker name, never the URL.

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
- 2026-10-07, `main` `0b64dcb` (P3-8: process admission with the daily quota, status revision, delete with an in-flight folder write), version `015576d8`. `/health` names `0b64dcb`; `/me` and `/status` answer 401 without a cookie.
- 2026-10-07, `main` `b83dc98` (P3-9: runner tickets, Drive adapter, dispatch, stale-run recovery, version-skew 503), version `a6ae63b9`. `/health` names `b83dc98`; `/me` and `/status` answer 401 without a cookie. No `GITHUB_TOKEN` yet, so a tidy-up press is admitted, not dispatched, and expires at 17 min.
- 2026-10-07, `main` `ca8e94e` (P3-10: admission manifest with 409 `nothing`, operation checkpoints; person schema v9), version `47e2dd74`. `/health` names `ca8e94e`; `/me` and `/status` answer 401 without a cookie.
- 2026-10-07, `main` `7a96c5e` (P3-11 and P3-12: report barrier, scripted provider, truthful endings), version `93556bd6`, then redeployed as `32dc0f74` with `GITHUB_REPO`. The same day the instance repository `bower-home` was replaced with the new runner (`ed952c4`: `tidy.yml` plus the runner bundle; the original workflows and `agent/` removed; `BOWER_API_URL` set to staging). The bundle was scanned: no addresses, no secret patterns.
- 2026-10-07, `main` `16738e1` (P3-13: `/runner/*` reaches the Worker, recovery redispatch after a dead job; person schema v10), version `e087bc91`. `/runner/runs/x/token` answers 401 JSON. `bower-home` updated with the runner of the same SHA (`edd9f46`), bundle scanned clean.
- 2026-10-07, `main` `0abbbac` (P3-14 to P3-16: dispositions, reading with total, real upload queue, real pile declarations, deploy script, runbook), version `736eb6b7`. Deployed by hand, not with `scripts/deploy-staging.sh`, until `deploy-staging-hardening` closes. `bower-home` at `dbd3f36`, bundle scanned clean.
- 2026-10-07, `main` `5a4ab04` (P3-17 and P3-18, P3-E complete: `a22f288` plus docs), version `f3e43b66`, with `scripts/deploy-staging.sh`. The script stopped at its production check with a false alarm: the staging URL contains the account subdomain `bower-api`, which matched the guard. Production `bower-api` was last deployed 2026-10-01, so it is untouched. The rest was done by hand: checks green, `bower-home` updated.
- 2026-10-07, `main` `bd7e261` (P3 frozen, code `da34905`: the security fixes, `__Host-` cookies, so everyone signs in once more), version `81a73283`. Security headers are live: HSTS, nosniff and CSP on the app; `/landing/` keeps its own CSP with `unsafe-eval` (a P4 polish item). `scripts/deploy-staging.sh` stopped again after the upload: it read "Uploaded 6 of 10 assets" as the upload line. Production was last deployed 2026-10-01, so it is untouched; the checks were done by hand and are green. `bower-home` is at `8703a4f`, with actions pinned by commit SHA (checked against the `v5` tags).
- 2026-10-07, `main` `b7d25f6` (the P3 re-freeze, code `cc28922`: the rules template fix), version `757d1b52`, deployed by `scripts/deploy-staging.sh` end to end. `bower-home` is at `8cd0532`, and production is untouched (last deployed 2026-10-01). This is the C16 target.
- 2026-10-07, `main` `aeb99a4` (the second P3 re-freeze, code `426a9fd`: the C16 fixes), version `c0ae698d`, deployed by script. `bower-home` is at `94a094a`. This is the C16 re-walk target.
- 2026-10-08, `main` `58897f5` (P4-1 and P4-2: corpus, Claude provider behind `BOWER_PROVIDER`, provider contract, runner overhead), version `8c0c1ae3`, deployed by script. `bower-home` is at `e92e772`; `BOWER_PROVIDER` is unset, so runs use the scripted provider.
- 2026-10-08, `main` `67d09cf` (P4-3: checkpoint cost, C04 incorporation with PDF text), version `053687b9`. `/health` and `/status` are green. `scripts/deploy-staging.sh` refused at the runner-bundle scan on one string, `jm@kbswfq.pkbglt`, an obfuscated literal inside the new PDF library (no real top-level domain, not personal), and the bundle has no secret patterns. The lead had chained `new-instance.sh` in the same command, so `bower-home` received that bundle (`778a014`) before the refusal was read. From now on `new-instance.sh` runs only after the script exits 0.
