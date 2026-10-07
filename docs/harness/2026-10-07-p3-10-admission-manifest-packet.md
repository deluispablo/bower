# Packet: spine-admission-manifest (P3-10)

Starting model: `bower-escalated` (Opus). Reason: the run's input set is data safety, and the work extracts shared code across three runtimes ([TL-P3-21](2026-10-07-tl-p3-21-spine-start.md)).

- **Entry:** `spine-admission-manifest`. Checkout `/private/tmp/bower-p3-manifest`, branch `claude/p3-manifest`. Never push or deploy.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, TL-P3-21, the `/process` row and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`, and `docs/ARCHITECTURE.md` lines 15–30 ("Reusable deterministic core").
  - App: `src/data/fake/fake-runner.ts` (`planRun` and its capture helpers, lines 1–330, plus what they call), `src/data/contracts/run-manifest.ts`, `src/data/fake/fake-worker.ts` (`process`, the 409 `nothing` causes), `src/data/drive/drive-http.ts`.
  - Api: `api/src/process.ts`, `api/src/person.ts` (`admit`, the run row, `runnerAccess`), `api/src/drive-token.ts`, `api/src/runner.ts`.
  - Runner: `runner/src/drive.ts`, `runner/src/still-as-seen.ts`, `runner/src/token.ts`.
- **Stub first:** commit the new modules as stubs on their own before behaviour.
- **Acceptance contract:**
  - **Extract, don't port.**
    - `planRun`'s capture and planning move into `src/data/spine/plan.ts` (pure under `src/data/` rules, with no browser globals). It runs over a small read interface: list children, get metadata, read bytes or text, read the declarations. It also takes a clock and an id source.
    - `fake-runner.ts` calls it, and its behaviour is unchanged: its tests and `pnpm e2e:fake` stay green.
    - Extract only what planning needs. Leave the operation and report steps where they are.
  - **The Worker builds the manifest.**
    - `POST /process` first asks the person object cheaply whether this press would admit a new run (not a repeat and no active run). Only then, before the synchronous section, it reads the inbox and the pile declarations with the person's Drive token through `DriveHttp` and the shared plan. That's metadata and Bower's control files only, never note content.
    - **Empty:** 409 `nothing` with the contract's sentence for its cause ("Nothing is waiting in the inbox." / "There is nothing new for Bower to read." / "Nothing in the inbox is ready yet."), before any quota count.
    - **Otherwise:** `admit` receives the manifest, re-checks repeat and active inside its section, and stores the manifest in the run row (schema v9 with a tested v8→v9 migration).
    - Drive failures while building answer as the contract's codes with no cause.
  - **Token route:** `GET /runner/runs/:id/token` adds `manifest` to its answer.
  - **Runner takes exactly that set.** Add `runner/src/spine/admitted.ts`. Given the manifest and the adapter, it keeps each item still as seen (same id, version or modifiedTime, parents) and defers the rest: they are listed in the result as `deferred` and are never a failure.
  - **Named tests, red first:**
    - app: `the shared plan gives the same manifest on the fake and on Drive` (the same synthetic folder planned through `FakeDrive` and through `DriveHttp` on a fake fetch replaying Drive v3 shapes);
    - api: `an empty manifest answers nothing before the quota`, `the run row keeps its manifest and the token route returns it`;
    - runner: `an item changed since admission waits for the next run`.
  - **Files in scope:**
    - app: `src/data/spine/**` (new), `src/data/fake/fake-runner.ts`, and their tests;
    - api: `api/src/process.ts`, `api/src/person.ts`, `api/src/person-schema.ts`, `api/src/runner.ts`, and their tests;
    - runner: `runner/src/spine/**` (new) and its tests.
    - Another entry, `spine-operations-checkpoints`, follows this one and extracts the operation steps. Leave those alone.
- **Gates:** the verify (red first on assertions), `pnpm check` in full, and `pnpm e2e:fake` in full on private ports 5195–5198, because `fake-runner.ts` changed. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
