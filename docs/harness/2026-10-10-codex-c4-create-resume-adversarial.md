# Codex adversarial pass: c4-create-resume (TL-P4-29 ruling 2, session 3)

Read-only, medium effort, scope `git diff claude/p3...c4-create-resume`. Tokens: input 254022 (cached 209664), output 1599.

**Important — [src/data/vault/drive-vault.ts:1103](/private/tmp/bower-c4-create-resume/src/data/vault/drive-vault.ts:1103): conversion intent is forgotten before the loose-file move completes.**

`Intended.make()` deletes the holder when the folder is confirmed (`write-once.ts:341`), before the move at line 1106. If that move fails, the next retry loses the original loose-file context and enters the folder-edit branch.

Concrete scenario: use the midnight red, lose the create answer and recovery read, then refresh. On the retry, recover the original `2026-10-09 Dentist papers` folder, but fail the loose-file move before it lands. Refresh and retry again. Bower selects the newer empty folder, renames it to `2026-10-10 Dentist papers`, and creates its note while leaving the loose file outside.

This violates packet contract 1 and TL-P4-24 addendum 17: preserve the first name and complete the original conversion. The existing red does not interrupt the move after create recovery.

findings: 1
