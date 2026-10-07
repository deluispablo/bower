# Packet: declare-piles-real (P3-15)

Starting model: `bower-escalated` (Opus). Reason: what a run takes must be exactly what the person declared. Admission, the runner and the fake must agree (TL-P3-24 point 4; TL-P3-21; the P2 declaration contract, TL-P2-29/38).

- **Entry:** `declare-piles-real`. Checkout `/private/tmp/bower-p3-declare`, branch `claude/p3-declare`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and TL-P3-21 (`2026-10-07-tl-p3-21-spine-start.md`).
  - `src/data/contracts/pile-declaration.ts`.
  - `src/data/spine/plan.ts` and `src/data/spine/read.ts`.
  - `src/data/choose.ts` and `src/data/choose-declarations.test.ts`.
  - `src/data/live/index.ts`, where `declarePiles` is used, and the pile-adding path it drives.
  - `src/data/drive/drive-http.ts`.
- **Acceptance contract:**
  - **On for real.**
    - `choose.ts` passes `declarePiles: true` to the real source.
    - Add the test `the real source declares piles`.
  - **The write.** The declaration is written through the real adapter, with the same fencing (session lease, attempt) and still-as-seen as other writes. Its id, its `sha256` and the members' declared bytes are as the contract says.
  - **One reading everywhere.** `src/data/spine/plan.ts` reads the declaration through the read port, so the Worker's admission manifest, the runner and the fake read it the same way:
    - a declared pile is taken only when every member arrived with the declared bytes;
    - a disagreeing declaration waits with its sentence.
    - Say in your card whether the Worker's read now covers the pile note it previously did not read. That is a P3-10 known limit.
  - **Named tests, red first:**
    - `the real source declares piles`;
    - `a declared pile gives the same manifest on the fake and on Drive`, on `DriveHttp` over a fake fetch.
  - **Files in scope:**
    - `src/data/spine/plan.ts`, `src/data/spine/read.ts`, `src/data/contracts/pile-declaration.ts` (only if the contract needs it; say why), `src/data/live/**` (declaration write path), `src/data/choose.ts` (the `declarePiles` flag only), and their tests.
    - `api/**` only if admission needs a change; say why.
    - `upload-queue-real` runs in parallel and owns the upload paths and the `uploadQueue` flag.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e` and `pnpm e2e:fake` in full on private port 5196 (5197 belongs to the other worker, 5198 is not yours).
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
