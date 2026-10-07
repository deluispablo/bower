# Packet: runbook-p3 (P3-F)

Starting model: `bower-implementer` (Sonnet). Reason: operations documentation that the owner follows, with one docs test (TL-P3-24 point 2; P3_ACCEPTANCE setup step 4 and the `runbook-p3` line).

- **Entry:** `runbook-p3`. Checkout `/private/tmp/bower-p3-runbook`, branch `claude/p3-runbook`, from the commit named in your prompt. Never push or deploy, and never run `wrangler`, `gh` or any script against a real service.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and `docs/P3_ACCEPTANCE.md` (owner setup and the closing criteria).
  - Here: `api/src/env.ts` (the binding contract), `docs/harness/STAGING.md`, `docs/harness/BACKUP.md`, `scripts/deploy-staging.sh`, `scripts/new-instance.sh`, `runner/workflows/tidy.yml`, and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - The original's runbook, `/Users/deluisp/Projects/bower/docs/runbook.md`, read only, for structure. Read nothing else under `/Users/deluisp/Projects/` outside your checkout.
  - `src/docs.test.ts`, for how docs are tested.
- **Acceptance contract:**
  - **`docs/runbook.md`** for the new app, in plain English, sentence case, with short sections. Adapt it from the original; don't copy it.
    - **Accounts.**
    - **The Google OAuth client:** redirect on the staging origin, and the scopes the app asks for.
    - **The staging Worker on one origin:** its KV, and every variable and secret in `env.ts`, with how each is set (`--var` or `wrangler secret put`).
    - **The instance repository:** set up with `new-instance.sh`, its `BOWER_API_URL` variable, and the Worker's `GITHUB_TOKEN`.
    - **Deploys:** `deploy-staging.sh` first, the manual STAGING.md line as the fallback, and the version-skew wait.
    - **Rotation:** `SESSION_SECRET` with `SESSION_SECRET_PREVIOUS`, `TOKEN_ENC_KEY` (what rotating it does to stored refresh tokens), and `GITHUB_TOKEN`.
    - **Deletion:** what "Delete my account" removes and what stays in the person's Drive.
    - **Recovery:** a stale run and how the alarm redispatches it, version skew, a lost dispatch, a failed `saving`, and restoring the code from the backup (BACKUP.md).
    - The P4 items are named as later: the Claude credential, the production Worker name, and rate limits.
    - No real values: use `<staging origin>`, `FOLDER_ID`, `you@example.com`. The only GitHub names allowed are the owner's (AGENTS rule).
  - **Named tests, red first** (add them to `src/docs.test.ts` and commit them on their own before the runbook exists):
    - `the runbook names every Worker secret and variable`: read the required and optional names from `api/src/env.ts`, not from a typed list;
    - `the runbook holds no real values`: no secret patterns (`ghp_`, `github_pat_`, `sk-ant`, `AIza`, `ya29.`, private key headers), no `workers.dev` host, and no address except `you@example.com`.
  - **Files in scope:** `docs/runbook.md` and `src/docs.test.ts`.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - No e2e is needed.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
