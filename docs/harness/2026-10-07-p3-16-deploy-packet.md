# Packet: deploy-and-migrations (P3-F)

Starting model: `bower-escalated` (Opus). Reason: a deploy script with production guards. One wrong name replaces the original app's production Worker ([TL-P3-08](2026-10-07-tl-p3-08-production-guard.md)). This entry is TL-P3-24 point 2.

- **Entry:** `deploy-and-migrations`. Checkout `/private/tmp/bower-p3-deploy`, branch `claude/p3-deploy`, from the commit named in your prompt.
  - **Never run `wrangler`, `gh`, a real deploy or any network call.** Never push.
  - Your tests stub every external command on `PATH`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and TL-P3-08.
  - `docs/harness/STAGING.md`: its first paragraphs, the deploy line and the version-skew section. Skip the P2 history.
  - `api/wrangler.jsonc`, the production sensor in `src/docs.test.ts`, and `api/src/person-schema.ts`.
  - `scripts/new-instance.sh` and its test `runner/test/new-instance.test.ts`, for the style: bash 3.2, `set -euo pipefail`, stubbed `gh`.
- **Acceptance contract:**
  - **`scripts/deploy-staging.sh <sha> <staging origin>`** does, in order:
    1. Refuse unless the tree is clean, `HEAD` is `<sha>`, and `<sha>` is the tip of local `main`.
    2. Refuse unless `api/wrangler.jsonc` names `bower-staging` and keeps the single-page fallback, and its KV id is the staging one the sensor pins. It always refuses `bower-api`.
    3. Run `pnpm install --frozen-lockfile`, then `env -u VITE_API_URL pnpm build`.
    4. Scan `dist/` as STAGING.md says: no address but `you@example.com`, and no secret patterns (`ghp_`, `github_pat_`, `sk-ant`, `AIza`, `ya29.`, private key headers). Any hit refuses.
    5. From `api/`, run `npx wrangler deploy --var APP_ORIGIN:<origin> --var API_ORIGIN:<origin> --var APP_VERSION:<short sha> --var GITHUB_REPO:<repo>`. Take `<repo>` from an environment variable, default `deluispablo/bower-home`. The output must name `bower-staging`, or the script fails loudly.
    6. Check that `/health` names the short SHA. Rerun once if the first check disagrees (STAGING.md).
    7. Version skew (TL-P3-20): wait, with a bounded number of tries, until `/status` without a cookie answers 401 JSON rather than 500. Give up after 5 minutes and say so.
    8. Run `pnpm -C runner build` and print where the bundle is for `new-instance.sh`. It does not run `new-instance.sh`.
    - Every refusal is one plain sentence on stderr with a non-zero exit. The script never prints, sets or reads a secret value.
  - **Schema steps are append-only.** A test, `shipped person schema steps never change`, hashes each step in `person-schema.ts` for versions 1 to `SCHEMA_VERSION` against a pinned list in the test. Changing a shipped step fails it. Appending one requires adding its hash.
  - **Named tests, red first** (commit them on their own before the script exists, with a stub script that exits 1):
    - `deploy-staging refuses production and dirty checkouts`: cover `bower-api`, a production KV id, a dirty tree, a SHA not on `main`, and a scan hit;
    - `deploy-staging deploys a clean main SHA and checks health`: with stubbed `wrangler`, `curl`, `pnpm` and `git`, assert the exact `wrangler deploy` arguments and the `/health` check;
    - `shipped person schema steps never change`.
    - Put them in `api/test/` (or `runner/test/` if the script tests fit there; say which).
  - **STAGING.md** says to deploy with the script, and keeps the manual line as its fallback.
  - **Files in scope:** `scripts/deploy-staging.sh`, its test, the schema test, and `docs/harness/STAGING.md` (deploy paragraph only).
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - No e2e is needed.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
