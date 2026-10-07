# Packet: behavior-suites-real-adapters (P3-18)

Starting model: `bower-escalated` (Opus). Reason: these suites prove that the real adapters behave like the fake on every failure path the product promises. That is the core of C12 and WORK_PLAN P3 step 3 ([TL-P3-25](2026-10-07-tl-p3-25-pile-notes-and-the-last-p3-e-entries.md) point 4).

- **Entry:** `behavior-suites-real-adapters`. Checkout `/private/tmp/bower-p3-suites`, branch `claude/p3-suites`, from the commit named in your prompt. Never push or deploy. Never run `gh` or `wrangler`, and make no network call: every transport is replayed.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, TL-P3-25, the C12 row of `docs/P3_ACCEPTANCE.md`, and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - Suites: `src/data/contract/vault-contract.ts`, `demo.contract.test.ts` and `fake.contract.test.ts`.
  - Real adapters: `src/data/drive/drive-http.ts`, `src/data/worker/worker-http.ts`, `src/data/live/index.ts`.
  - The api app and its tests' Drive v3 fake (`api/test/drive-v3.ts`), and the runner's (`runner/test/drive-v3.ts`) with `runner/src/main.ts`.
  - The staging evidence lines in `docs/harness/ACTIVE.md` (first real run, cancel-and-recover, C14).
- **Acceptance contract:**
  - **A real-adapter world** for the vault contract. Name the file `src/data/contract/real.contract.test.ts`; its describe name contains "real adapters".
    - The app side is `makeLiveSources` with `DriveHttp` over a replayed Drive v3 transport and `WorkerHttp` over the api app run in-process (Hono's `app.request` or a fetch shim).
    - Tidy-ups run through the runner's `main` over the same transports.
    - Reuse the existing Drive v3 fakes where you can. If a fake is missing behaviour real Drive has, add it and say so.
    - Groups the real world cannot run yet stay skipped, with the reason. Say which in your card.
  - **Failure cases.** Each ends as the fake ends, and each is a named `it` under a describe containing "real adapters", in the app or runner suite as fits:
    1. browser close mid-run: the app goes away, and the runner plus the alarm finish;
    2. revoked auth: Google answers `invalid_grant`, so the person is signed out and nothing is written;
    3. duplicate dispatch: two jobs for one attempt give one set of effects;
    4. expired attempt: a superseded attempt writes nothing;
    5. lost callback: a status reply is lost, and the resend is idempotent;
    6. recovery: a dead job is redispatched and reaches `done`.
  - **Live side cited, not repeated.** Add a short table to `docs/harness/2026-10-07-p3-behavior-suites.md` that maps each case to its staging evidence (run ids and dates from ACTIVE), or to "not walked live" with the reason.
  - **Red first.** These are tests of existing behaviour, so the red is the suite failing on purpose. For each case, break the relevant guard in a scratch commit you do **not** keep, show the assertion that fails, and record it in your card. Commit only the suites and the doc.
  - **Files in scope:** new test files under `src/data/contract/` and `runner/test/`, shared transport fakes, and the doc. If a case exposes a real bug, stop and report it. Don't fix product code in this entry.
- **Gates:**
  - the verify;
  - `pnpm check` in full;
  - `pnpm e2e:fake` in full on private port 5197.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
