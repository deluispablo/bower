# B1b ports — adversarial review, pass 2

**Verdict: BLOCK**

Range: `b6b14ea6a7cb...48201c604089`  
Worktree: `/private/tmp/bower-b1b-ports`

### Important

1. **Native fake changes report character counts as byte sizes.**  
   `src/data/drive/fake-drive.ts:511` records metadata whose string sizes come from `content.length` at line 554 and `text.length` at line 655.

   **Failing scenario:** capture `getStartPageToken()`, create a note containing `é🙂`, then drain `listChanges(token)`. The fake returns `change.file.size === 3`; its actual media contains **6 bytes**, and `DriveHttp` returns **6** from the equivalent recorded wire response. Updating an existing note to that text reproduces the same mismatch. Drive defines size in bytes ([file resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)).

   The new feed violates fake/HTTP parity. Existing feed fixtures use ASCII; Unicode prefix fixtures restore an already-correct byte size, concealing this case.

   **Fix direction:** compute UTF-8 byte sizes in the existing fake create/write metadata mechanism; add native-feed parity tests for Unicode creation and updates.

### Prior findings

- **Fixed:** inherited Bin status now rejects fake prefix reads and appears in child changes.
- **Fixed:** Workspace change files use the HTTP public shape without leaking `mimeType`.

### Checks and limits

- Read-only probes passed for 200/206/416, empty bodies, Workspace exclusion, UTF-8 splits, preserved Range during auth refresh and rate-limit retries.
- Feed probes passed for pagination, token precedence, repeated changes, removed stubs, loop rejection, terminal-token guards and retry continuity.
- Ancestry probes passed for cycles, deleted parents, moved-out files, deep chains, Bin ancestry and the >50 fallback.
- Prefix/full cache separation holds. No second transport or persisted cursor/state was introduced.
- Red-owner byte comparisons, My Drive assertions, live-wrapper forwarding and factory injection weaken no checked behavior. Existing golden assertions are unchanged.
- Vitest was not rerun: `tmp-logs/` is absent and the filesystem is read-only. No files were edited; no network, `pnpm check` or e2e ran.

No separate Blocking or Minor findings.
