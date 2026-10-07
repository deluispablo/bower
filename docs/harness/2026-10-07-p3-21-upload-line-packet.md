# Packet: deploy-staging-upload-line (P3-21)

Starting model: `bower-mechanical` (Haiku): a one-script fix with a clear failing test (TL-P3-27). The lead's deploy of bd7e261 stopped because `scripts/deploy-staging.sh` took wrangler's asset progress line `Uploaded 6 of 10 assets` as the Worker upload line.

- **Entry:** `deploy-staging-upload-line`. Checkout `/private/tmp/bower-p3-upline`, branch `claude/p3-upline`, from the commit named in your prompt. Never run `wrangler`, `gh`, a real deploy or any network call, and never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `scripts/deploy-staging.sh` (the upload-line check) and `runner/test/deploy-staging.test.ts`.
- **Real wrangler output** (shape of a `wrangler deploy` with static assets; use it verbatim in the test, replacing the account host with `example.workers.dev` except for one line kept as `bower-staging.bower-api.workers.dev`):
  ```
  🌀 Building list of assets...
  🌀 Starting asset upload...
  🌀 Found 10 new or modified static assets to upload. Proceeding with upload...
  + /index.html
  Uploaded 6 of 10 assets
  Uploaded 10 of 10 assets
  ✨ Success! Uploaded 10 files (3 already uploaded) (1.52 sec)
  Total Upload: 412.33 KiB / gzip: 98.10 KiB
  Your Worker has access to the following bindings:
  - Vars:
    - APP_ORIGIN: "https://bower-staging.bower-api.workers.dev"
  Uploaded bower-staging (4.21 sec)
  Deployed bower-staging triggers (0.31 sec)
    https://bower-staging.bower-api.workers.dev
  Current Version ID: 00000000-0000-0000-0000-000000000000
  ```
- **Acceptance contract:**
  - Recognise only a line matching `^Uploaded <name> \(`. The name must be `bower-staging`. An `Uploaded bower-api (` line fails with the production alarm sentence; any other name fails with its own sentence.
  - Asset lines (`Uploaded N of M assets`, `✨ Success! Uploaded N files`) are ignored.
  - **Named test, red first** (commit it on its own before the fix): `deploy-staging ignores asset upload lines`. It covers both the output above passing and the same output with `Uploaded bower-api (` failing with the production alarm.
  - **Files in scope:** the script and its test.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
