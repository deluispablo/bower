# Packet: deploy-staging-hardening (P3-17)

Starting model: `bower-implementer` (Sonnet), per TL-P3-25 point 1. The P3-14..16 delta review found three gaps in `scripts/deploy-staging.sh`:
- Its clean-tree check ignores ignored `.env*` files. Vite still reads `VITE_API_URL` from `.env.local` or `.env.production` after `env -u`, so a staging app could point at another API.
- Its check that the output names `bower-staging` passes on the echoed `--var` values.
- Its skew wait can last about 10 minutes, while its message says 5.

- **Entry:** `deploy-staging-hardening`. Checkout `/private/tmp/bower-p3-hardening`, branch `claude/p3-hardening`, from the commit named in your prompt. Never run `wrangler`, `gh`, a real deploy or any network call, and never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `scripts/deploy-staging.sh` and `runner/test/deploy-staging.test.ts`. Also read Vite's env file rules ([vite.dev/guide/env-and-mode](https://vite.dev/guide/env-and-mode)) and cite them in your card.
- **Acceptance contract:**
  - **Env files.** Refuse, with one sentence, when any file Vite would load for a production build exists in the app root or `api/`, ignored or not: `.env`, `.env.local`, `.env.production`, `.env.production.local`. Also refuse on `api/.dev.vars`.
  - **Upload line.** Confirm the deploy by wrangler's upload line for `bower-staging`, not by any mention of the name. Keep the config check before the deploy and the `/health` check after it.
  - **Skew wait.** The message states the real bound. Keep the count of tries; a clock is fine if simpler.
  - **Named tests, red first** (commit them on their own before the fix):
    - `deploy-staging refuses an env file Vite would read`;
    - `deploy-staging confirms the upload line`: a stubbed wrangler that echoes the vars but uploads another name must fail;
    - `deploy-staging gives up on the skew wait and says so`.
    - Also cover a failed `/health` first check that passes on its rerun, and a scanned file whose name has a space.
  - **Files in scope:** `scripts/deploy-staging.sh` and `runner/test/deploy-staging.test.ts`.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - No e2e is needed.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
