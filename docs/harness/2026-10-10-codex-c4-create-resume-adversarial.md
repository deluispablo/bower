# Codex adversarial pass: c4-create-resume (TL-P4-29 ruling 2, session 3)

Read-only, medium effort, scope `git diff claude/p3...c4-create-resume`. Tokens: input 254022 (cached 209664), output 1599.

**Important — [src/data/vault/drive-vault.ts:1103](/private/tmp/bower-c4-create-resume/src/data/vault/drive-vault.ts:1103): conversion intent is forgotten before the loose-file move completes.**

`Intended.make()` deletes the holder when the folder is confirmed (`write-once.ts:341`), before the move at line 1106. If that move fails, the next retry loses the original loose-file context and enters the folder-edit branch.

Concrete scenario: use the midnight red, lose the create answer and recovery read, then refresh. On the retry, recover the original `2026-10-09 Dentist papers` folder, but fail the loose-file move before it lands. Refresh and retry again. Bower selects the newer empty folder, renames it to `2026-10-10 Dentist papers`, and creates its note while leaving the loose file outside.

This violates packet contract 1 and TL-P4-24 addendum 17: preserve the first name and complete the original conversion. The existing red does not interrupt the move after create recovery.

findings: 1

## Round 2 pass

Read-only, medium effort. Tokens: input 261227 (cached 212864), output 1921.

**Important — [src/data/vault/drive-vault.ts:1108](/private/tmp/bower-c4-create-resume/src/data/vault/drive-vault.ts:1108): the conversion still loses its first-name protection before note creation finishes.**

Round 2 retains the folder holder through the loose-file move, fixing the reported interruption. However, it deletes that holder before creating the pile note. If that create fails, another refresh and retry enters the folder-edit branch at :1110 and recomputes the folder name.

Concrete scenario: use the midnight fixture; lose the folder-create answer and recovery read; refresh and retry. Let folder recovery and the loose-file move succeed, then lose the pile-note-create answer and recovery read. Refresh and retry again. The folder changes from `2026-10-09 Dentist papers` to `2026-10-10 Dentist papers` while the interrupted `updatePile` is still being resumed. An intervening outside rename is likewise replaced using the refreshed folder as its fence.

Contract: packet item 1 and TL-P4-24 addenda 16–17 require resumption from the original intent before folder-edit behavior, preserving the first name. The round-2 red interrupts only the move, leaving this later failure uncovered.

findings: 1
