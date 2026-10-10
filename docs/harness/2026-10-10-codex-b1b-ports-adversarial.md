# B1b ports adversarial review

**Verdict: BLOCK**

range: `7371bc078049...f39276861419`  
worktree: `/private/tmp/bower-b1b-ports`

### Important

1. **Fake prefix reads expose children of binned folders.**  
   `src/data/drive/fake-drive.ts:209` checks only the file’s explicit Bin flag.  
   **Reproduction:** create Bower → Projects → Plan.md, then `trash(Projects)`. Fake `readPrefix(Plan.md)` still returns its text. Drive marks descendants `trashed: true`, so `DriveHttp.readPrefix` rejects with `not-found`. After `touch(Plan.md)`, the fake feed also emits the child without `trashed`. This divergence was reproduced with read-only probes; inherited trash semantics are documented in the [Drive file resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).  
   **Fix direction:** derive inherited Bin status in the existing fake metadata mechanism and add prefix/feed parity cases.

2. **Fake changes return a different normalized file shape.**  
   `src/data/drive/fake-drive.ts:240` copies all stored metadata, including the newly supported private `mimeType`.  
   **Reproduction:** restore a Workspace document with `meta.mimeType`, capture a token, then `touch(id)` and drain. Fake `change.file` includes `mimeType`; the equivalent HTTP response loses it through `toFile`. Exact parity fails. Both results were inspected in a read-only probe. Current feed fixtures omit Workspace MIME metadata, concealing this difference.  
   **Fix direction:** normalize fake change files to the same public shape as HTTP while retaining MIME information internally.

### Checks and limits

- Probes passed for 200/206 prefixes, split UTF-8, 416, preserved Range during auth refresh and rate-limit retries.
- Feed probes passed for token precedence, removed stubs, loop rejection and missing terminal tokens.
- Scope probes passed for cycles, deleted parents, moved-out files, 100-level ancestry and the 51-id fallback.
- Prefix/full cache separation holds; no second transport or persisted cursor/state was introduced.
- Red-owner byte comparisons, My Drive assertion and live wrapper changes weaken no checked behavior.
- Existing golden assertions are unchanged. Vitest was not rerun: the filesystem is read-only and `tmp-logs/` is absent.

No separate Blocking or Minor findings.
