# Packet: P3-14, P3-15 and P3-16 delta review (dispositions, reading total, real upload queue, real declarations, deploy script)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. The scope covers truthful outcomes, bytes never lost or sent twice, declared piles taken exactly, and a deploy script that must never reach production. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff 16738e1..<HEAD in your prompt> -- src api runner scripts docs/harness/STAGING.md`. Per change:
  - `5699b61`: reading with total (red `6bfab57`).
  - `03bf8f6`: dispositions (red `cc06dcf`). The coordinator then added `reading` to one test sequence after the merge.
  - `0b05ec4`: real upload queue (red `41f6356`).
  - `1d695b8`: real declarations (red `02fa32e`). The coordinator resolved a merge in `src/data/choose.ts` so the real source has both `declarePiles` and `uploadQueue`.
  - `30fc4d5`: `scripts/deploy-staging.sh`, pinned schema steps, STAGING.md (red `b64a416`).
- **Contracts:**
  - [TL-P3-24](2026-10-07-tl-p3-24-real-runs-and-the-rest-of-p3.md), [TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) with its addendum, and [TL-P3-08](2026-10-07-tl-p3-08-production-guard.md).
  - The C02 row of `docs/P3_ACCEPTANCE.md`.
  - The "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - The packets `2026-10-07-p3-14-*`, `2026-10-07-p3-15-*` and `2026-10-07-p3-16-deploy-packet.md`.
- **Look hardest at:**
  - **Dispositions.**
    - Can a disposition still contradict the report: a pile partly filed, a pile whose Bin was refused, journal lines, or a waiting item?
    - On a contradiction, the run stops before any report write. What does the runner report after effects, and is that true?
  - **Reading total.**
    - Does `total` (the admitted count, now including your changes) mean what the app shows?
    - Does a resumed attempt avoid posting `reading` again?
    - Is `seq` still rising?
  - **Upload queue.**
    - Can a reload, an expired session, lost bytes, or a lost final reply ever make two files, lose bytes, or show "sent" before Drive confirms?
    - "Sent" is judged by `sha256Checksum` (not md5). Is that sound for every file type Drive returns it for, and what happens when Drive does not return it?
    - When stored bytes are missing, the queue checks the reserved id first. Is that read fenced to the right folder and account?
  - **Declarations.**
    - Is the declaration create fenced by the lease, like other writes?
    - Do admission, the runner and the fake read a declaration the same way?
    - The Worker still reads no pile note. Can that admit a pile the runner then refuses, and what does the person then see?
  - **Deploy script.**
    - Can any path deploy something other than `bower-staging`, use a production KV id, deploy a dirty tree or a SHA that is not `main`'s tip, or print or set a secret?
    - Is the dist scan at least as strong as STAGING.md's?
    - Are the bounded skew wait and the `/health` check real?
    - Does the schema-step hash test catch an edited shipped step?
- **Run:** single test files only, one at a time. Never run `scripts/deploy-staging.sh` outside its stubbed test, and never run `wrangler`, `gh` or any network call. If you need reproductions, make your own worktree under `/private/tmp/p3-16-review/` and remove it afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
