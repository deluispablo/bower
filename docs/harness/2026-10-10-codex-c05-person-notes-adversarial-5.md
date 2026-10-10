C05 person notes — scoped adversarial review, pass 5

verdict: PASS  
range: 74ee65ac..a05cb4a6  
worktree: /private/tmp/bower-c05-person-notes

Blocking findings: none in normal use.

Round 5 retains one settlement and binding home (`scripted.ts:242`) and the existing archive path (`scripted.ts:2225`).

The a00b7167 repairs follow addendum 6. First-run settlement, younger-request preservation and later-run no-second-effect assertions remain. The `already-active` outcome still has explicit coverage at `runner/test/c05-person-notes.test.ts:993`.

v1 limits:

- `runner/test/corpus-driver.test.ts:247`: the dedicated one-record replay check now covers `restored`; the surviving `already-active` scenario lacks that exact count assertion.

Validation: static review and `git diff --check`; Vitest was not run because the filesystem is read-only.
