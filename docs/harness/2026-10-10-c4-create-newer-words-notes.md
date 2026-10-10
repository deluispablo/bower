# c4-create-newer-words implementation

Status: done. TL-P4-24 addendum 19 (1). The coordinator owns the separate fix and notes commits.

## Fix

- `src/data/vault/drive-vault.ts:1089`: retain the current pile path separately from the loose-file entry so a completed conversion can continue through the ordinary edit branch.
- `src/data/vault/drive-vault.ts:1104`: resume the existing `Intended.convert` operation. Its held first intent, reserved ids and landed steps in `src/data/spine/write-once.ts` remain unchanged; the reserved note create still sends the first words.
- `src/data/vault/drive-vault.ts:1114`: return immediately only when conversion already saved the requested words. A retry with newer words instead uses the completed folder and note in the index and continues to the existing note update.
- `src/data/vault/drive-vault.ts:1126` and `:1143`: skip the ordinary folder rename for that conversion retry, preserving its first folder name without computing another name.
- `src/data/vault/drive-vault.ts:1141` and `:1152`: the existing note fence and awaited `once`/`writeText` update use the landed note's modifiedTime. An outside change between conversion landing and the update is refused by the existing check. Success is returned only after the newer words land.

One home: conversion still belongs to `Intended.convert`; content updates still use the existing fenced note update and `once`/`updateByStamp`. No new write path or reservation mechanism.

## Research

Offline research used the existing references and implementation comments in `src/data/spine/write-once.ts:1`, `src/data/vault/drive-vault.ts:1074` and `src/data/contracts/still-as-seen.ts:1`. No network was used.

- [RFC 9110 section 13.1.1, If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1): preserve the version the write started from and reject a changed version to prevent a lost update. Bower already implements this through its modifiedTime fence and write check; the fix reuses them.
- [Stripe idempotent requests](https://stripe.com/docs/api/idempotent_requests): retry the same intended operation with its original parameters. Bower's existing held conversion does this; newer words become an ordinary update only after the conversion settles.

tests changed: `src/data/vault/drive-vault.test.ts:4005`: the separate red session added the pending-conversion fixture and the two reds at `:4026` and `:4044`, committed at HEAD `e81f025d`. This implementation session changed no tests.

removed: the unconditional success return after a resumed conversion with different requested words. No files, tests, helpers or mechanisms were removed.

## Verification and logs

- Both reds reproduced at HEAD: the successful retry kept `Dentist papers` instead of the newer words; the outside-change variant resolved instead of rejecting. `pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'a retry with new words'`: expected failure, `/tmp/newer-reds.log`. The first red alone also failed in `/tmp/newer-red.log`.
- `pnpm exec vitest run src/data/vault/drive-vault.test.ts src/data/spine/write-once.test.ts`: pass, `/tmp/newer-targeted.log`. Both reds pass unchanged.
- `pnpm exec tsc -p tsconfig.app.json > /tmp/newer-tsc2.log 2>&1`: pass on the final source. An initial TS2322 caused by the mutable file variable's closure narrowing was resolved with an immutable loose-file capture.
- `pnpm exec vitest run src/data > /tmp/newer-unit.log 2>&1`: pass on rerun alone. The first run during concurrent verification hit two 5000 ms timeouts in `undo-compensate.property.test.ts` random batches 1 and 2, with 3831 other tests passing; its log is preserved at `/tmp/newer-unit-first.log`. No test or timeout was changed.
- `pnpm -C runner exec vitest run > /tmp/newer-runner.log 2>&1`: pass. The unchanged `runner/test/drive-calls-golden.test.ts:21` and `:69` assertions remain exactly 78 and 88.
- `git diff --check`: pass. Only the implementation and this notes file are changed.

Per the assignment, no `pnpm check`, e2e, network calls or writing git commands were run. The accepted memory-only pending conversion remains as it was (addendum 19 (2)).
