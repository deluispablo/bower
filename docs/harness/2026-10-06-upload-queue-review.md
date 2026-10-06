# Independent review uq-review-1: upload-queue-persistent (phase 1)

Reviewer: fresh Claude session `uq-review-1` (implementer `upload-queue-impl-1`). Target `/private/tmp/bower-p2-upload-queue`, base `f1db94f` → deps `1e84286` → tests `85591e2` → fix `de0b38f`. **Verdict: BLOCKED — 0 Critical, 3 Important, 9 Minor** (phase 1, module level; Importants reasoned from code, not reproduced).

Verified: reds genuine (stubs load, 14 assertion failures); tests 14/5/11 pass; PII grep clean (owner's GitHub provenance only); provenance in commits; dev-only `fake-indexeddb` justified; `DriveApi` unchanged. Bytes deleted only after confirmation; resume from real offset; bounded restart under the same reserved ID; lost reply settled by session status or 409 + read-back; keyed by account/folder/declaration/member/hash; one token refresh, no token or session URL logged.

## Important

1. `upload-store.ts:158-165`, `upload-queue.ts:209-213,252-258`: re-adding a member from another tab overwrites the stored record (`fileId:null`), the owner tab refreshes into it and reserves a new ID → two files. Fix: add only if absent inside one transaction; `refresh` never replaces a known `fileId`/session with null; two-tab test.
2. `upload-queue.ts:522-530,209,215-221,532-535`: discard in one tab does not stop the uploading tab (discarded member still created); waiting items that vanish are shown done (false success); `forgetAccount` does not tell other tabs. Fix: abort when the record vanishes; show removed, not done; broadcast forget.
3. `upload-store.ts:116-133`, `upload-queue.ts:243-247,295-298,429-433`: a storage failure after add is blamed on Drive, does not fall back to memory and blocks until reload; cached connection never reopened; unreadable kept uploads at start vanish silently. Fix: reopen once, else non-durable with `KEEP_OPEN_TEXT` from memory; tell the person once.

## Minor

1. Read-back checks ID/parent/size, not content (TL-P2-05 "verify the complete result"): compare `sha256Checksum`. 2. Lost wake-up across stop/start in `pump()`. 3. No Web Locks wired: compare-and-set on `fileId` would also cover I1. 4. Bearer token attached to any stored session URL: check the `https://www.googleapis.com/upload/` prefix. 5. 429/rate-limit 403/5xx become failures: phase 2 should treat as retryable. 6. Fake Drive looser than Google (256 KiB multiples, size mismatch); guard real chunk size. 7. Bytes linger if post-confirm removal fails (tidied next start). 8. Refused persistent storage not recorded; malformed records dropped silently and never cleaned. 9. Progress per 8 MiB chunk (acceptable).

Phase-2 notes: compute sha256 from bytes before `add`; expose `fileId` for non-owner done items; hook `retry()` to online and `retryPile`; Bin a discarded item that may exist after a lost reply; sign-out `stop()`, `deleteAccount` `forgetAccount` + broadcast; `beforeunload` while memory-only files remain.
