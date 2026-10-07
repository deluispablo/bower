# Packet: upload-queue-real (P3-15)

Starting model: `bower-escalated` (Opus). Reason: bytes the person added must never be lost, sent twice or reported as sent before Drive confirms. That is data safety (TL-P3-24 point 4; P3_ACCEPTANCE C02; R4 evidence). This entry folds in `upload-queue-persistent` for the real source.

- **Entry:** `upload-queue-real`. Checkout `/private/tmp/bower-p3-upload`, branch `claude/p3-upload`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and the C02 row of `docs/P3_ACCEPTANCE.md`.
  - `src/data/upload-queue.ts`, `src/data/upload-store.ts`, `src/data/drive/resumable-upload.ts`, `src/data/drive/drive-http.ts`.
  - `src/data/choose.ts` and `src/data/choose-upload-queue.test.ts`.
  - `src/data/live/index.ts`, where `uploadQueue` is built.
  - The R4 evidence spec: `docs/harness/evidence/2026-10-06-r4-reserved-id-spec/spec.md`.
- **Acceptance contract:**
  - **On for real.**
    - `choose.ts` passes `uploadQueue: true` to the real source.
    - Update the test `the real source keeps sending them straight until P3` to `the real source sends pile files through the upload queue`.
  - **Resume from the server's offset.**
    - After a reload, a pending upload asks Drive for its session's committed offset (`PUT` with `Content-Range: bytes */<total>`; a 308 gives `Range`) and sends only the rest, under the same reserved file id.
    - A 404 or 410 (session expired) starts a new session with the **same** reserved id, so Drive refuses a second file.
    - A 200 or 201 on that query means the upload is already done; send nothing more.
    - Cite Google's resumable upload guide in your card.
  - **Never two files, never early "sent".** An item counts as sent only after Drive's final response, with the file's id and its `md5Checksum` matching the bytes kept.
  - **Lost bytes.** If the browser lost the stored bytes (IndexedDB cleared or evicted), that item shows "Choose the file again." The other items in the pile are untouched, and nothing is sent for it.
  - **Named tests, red first:**
    - `the real source sends pile files through the upload queue`;
    - `a reload resumes from Drive's offset and makes one file`: interrupt after each chunk in turn;
    - `an expired session restarts with the same reserved id`;
    - `lost bytes ask to choose the file again`.
    - Run them on `DriveHttp` over a fake fetch that models Drive's resumable protocol.
  - **Files in scope:**
    - `src/data/upload-queue.ts`, `src/data/upload-store.ts`, `src/data/drive/resumable-upload.ts`, `src/data/drive/drive-http.ts` (upload paths only), `src/data/choose.ts` (the `uploadQueue` flag only), and their tests;
    - the UI line for "Choose the file again." where the queue item shows.
    - `declare-piles-real` runs in parallel and also edits `choose.ts`, but only its `declarePiles` flag. Keep your `choose.ts` edit to your own flag.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e` and `pnpm e2e:fake` in full on private port 5197 (5196 belongs to the other worker, 5198 is not yours);
  - `pnpm e2e:pwa`.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
