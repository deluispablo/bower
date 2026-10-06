# Independent review R-prose-1: protected-current-prose

Reviewer: Claude subagent `prose-review-1` (read-only; implementer Codex). Target `/private/tmp/bower-p2-protected-prose`, base `6770d8f` → test `1015265` → fixture correction `ca594e1` → fix `ed7d919dfb99`. Contracts-2 / main `10ca886`, C03/C14, TL-P2-03.

**Verdict: BLOCKED — 0 Critical, 1 Important, 2 Minor.** The note-format change itself is correct; the block is a reproduced consumer regression.

Evidence: verify run by reviewer 20 passed; reds reproduced on original `note-format.ts` with final test bytes, 18 genuine AssertionErrors / 2 legacy guards passing; log hashes match; fixture correction legitimate, no assertion weakened; existing tests unchanged. Legacy/no-frontmatter unchanged, My notes not reserved; v2 display from payload spans; toggles via shared `togglePersonalTask`, one byte, LF/CRLF/mixed/BOM, protected task unreachable; damaged/unsupported refuse with BowerError; no grammar re-implementation; no v2 producer.

## Important

1. `note-format.ts:58`, `:156`: `parseNote` now throws for any invalid ownership note (other `bower_format` value, duplicated key, ownership/2 without markers). Unguarded callers reject the whole operation: `drive-vault.ts:375-379` (search), `:178-181` (backlinks), `:407` (Inbox piles). Reproduced on FakeDrive + seed: adding `Odd.md` with `bower_format: obsidian-thing` makes search reject and `note('Resources/Target.md')` reject (Odd links to it); on `6770d8f` both succeed. Opening the bad note fails outright where the grammar asks for a readable warning/read-only preview. Violates grammar "Other notes continue working" (`bower-protected-ownership-final.md:66`). Fix: isolate per-note failures in consumers (search/backlinks skip and log; Inbox shows unreadable; `note()` readable refusal).

## Minor

2. `fake-runner.ts:219-220` + `note-format.ts:167`: fake Timeline append parse→serialize downgrades valid ownership/2 to legacy (drops markers). Destructive before the fix too; fake-only, already a stated limit. Later Timeline splice entry.
3. `note-format.ts:55`: decoded string cannot detect invalid UTF-8 from Drive (U+FFFD). Stated limit; needs raw-byte adapter.

Set aside: rich protected Markdown rendering, recovery UI, Drive write safety, full check rerun.

## Delta review (rework `ed7d919` → test `b3fcd07` → fix `5d521f1`)

**Verdict: CLEAN — 0 Critical, 0 Important, 2 Minor. The Important finding is resolved.** Only `drive-vault.ts` and its test changed (widened scope). Reviewer re-ran the `Odd.md` probe: search returns readable notes and skips the unreadable one; `note('Resources/Target.md')` opens; opening or toggling `Odd.md` itself still rejects with the short BowerError. Named verify 20, new block 11, whole `drive-vault.test.ts` 73 passed on target. Reds reproduced on `ed7d919` code + final tests: 6 genuine AssertionErrors, 5 guard passes. The `try` wraps only `parseNote`; only BowerError parse refusals are skipped and logged; Drive/session read failures and non-BowerError errors propagate (three tests prove it). Null return does not populate the `notes` cache.

Minor: (1) `drive-vault.ts:409-411` an unreadable pile note hides that whole pile from the Inbox (`Pile` has no unreadable state; only reachable if a person types such frontmatter literally; nothing lost, logged). Follow-up: show the pile's files with an unreadable-note state. (2) Collection reads re-parse and re-log the unreadable note on each refresh; log noise only.
