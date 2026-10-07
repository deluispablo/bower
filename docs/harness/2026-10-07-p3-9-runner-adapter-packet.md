# Packet: runner-drive-adapter (P3-9)

Starting model: `bower-escalated` (Opus). Reason: the fenced mutation boundary for the runner's writes to a person's Drive ([TL-P3-18](2026-10-07-tl-p3-18-runner-wire.md), [TL-P3-19](DECISIONS.md)).

- **Entry:** `runner-drive-adapter`. Checkout `/private/tmp/bower-p3-adapter`, branch `claude/p3-adapter`. Never push or deploy.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, the TL-P3-19 line in `docs/harness/DECISIONS.md` and its doc, the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`, and `docs/ARCHITECTURE.md` lines 20–60.
  - The fake's boundary: `src/data/drive/fake-drive.ts` (`fenced`, `FencedDrive`, `FencedCall`, `FaultHook`, `PeekedFile`).
  - The client to build on: `src/data/drive/drive-http.ts`.
  - The wiring patterns: `pnpm-workspace.yaml`, `api/package.json`, `api/tsconfig.json`, `api/vitest.config.*`, and root `package.json` scripts (`check`).
- **Stub first:** commit the package skeleton and a stub `FencedDrive` on its own, before any behaviour, so `done.sh` sees assertion failures.
- **Acceptance contract:**
  - **Package.** `runner/` is a pnpm workspace package beside `api/` (add it to `pnpm-workspace.yaml`): TypeScript strict, `"engines"` on the current Node LTS, vitest, and a build to one ESM file (esbuild, already allowed) under `runner/dist/` (git-ignored). `pnpm check` runs its lint, typecheck and tests, as it does for `api/`. It imports `src/data/contracts` and `src/data/drive/drive-http.ts` by relative path. Nothing is published.
  - **Drive client.** Build on `DriveHttp` with Node's `fetch` and a token provider that calls `GET /runner/runs/:id/token` with the ticket and caches the token until shortly before `expiresAt`. If `drive-http.ts` has any browser-only line, move it behind an injected dependency with no change to app behaviour: the app's own tests and e2e stay green.
  - **`FencedDrive`.** The fake's interface: `createFolder`, `createText`, `update`, `trash`, `writeText`.
    - Before each write, re-read the target (or the parent, for creates): `modifiedTime`, `name`, `parents`, `trashed`. Compare with what the caller saw, and refuse with a `conflict` error when it moved.
    - Once per write batch, check the attempt: the token route's `attempt` must equal the runner's. Otherwise refuse with a stale-attempt error.
    - Document both in the module header as a precheck that leaves a window, **not** compare-and-swap (ARCHITECTURE line 57).
    - Faults come through a fetch hook with the fake's `FaultAction` (`refuse`, `lose-reply`).
  - **Evidence reads.** `get`, `list(parent)` (paged), `readText`, and `md5` of a file's content, the reads the spine's report barrier needs.
  - **Named tests, red first,** in `runner/test/`:
    - `the adapter refuses a write when the file moved since it was read`;
    - `the adapter refuses a write after a newer attempt took over`;
    - `the adapter and the fake agree on the fenced scenario`: one scenario (create a folder, create a note, update, write text, trash, one refused write, one lost reply) runs against the fake's `fenced()` and against the adapter on a fake fetch that replays Drive v3 response shapes. Both end in the same visible state and errors.
  - **No real Drive or network in tests.**
  - **Files in scope:** `runner/**` (new), `pnpm-workspace.yaml`, root `package.json` (the `check` script only), `.gitignore`, `src/data/drive/drive-http.ts` (dependency injection only, if needed) and its test.
- **Out of scope:** the workflow, the bower-home replacement, the run's steps (spine entries), and dispatch.
- **Gates:** the verify (red first on assertions), `pnpm check` in full, and `pnpm e2e:fake` for `e2e/app.spec.ts` on private ports 5195–5198 if `drive-http.ts` changed. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
