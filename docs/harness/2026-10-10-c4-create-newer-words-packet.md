# Packet: c4-create-newer-words (TL-P4-24 addendum 19; escalated, data safety; next batch)

- **Entry:** `c4-create-newer-words`. Worktree `/private/tmp/bower-c4-newer-words`, branch `c4-create-newer-words` from `claude/p3`.
- **Ruling:** TL-P4-24 addendum 19 (1). It comes from P4-68 minor 1 on c4-create-resume.
- **Starting model:** Codex, in three sessions: the red, the implementation, a read-only adversarial pass. Then a fresh Claude review.

## Contract

1. **Newer words are never dropped.** While a pile conversion is pending, a retry with different words sends the reserved create with its first intent (addendum 16; the one held intent from c4-create-resume, in `write-once.ts`).
   - Once the whole conversion has landed, the person's newer words are applied as an ordinary update, with the modifiedTime check.
   - updatePile returns success only after that update has landed.
   - Today, `drive-vault.ts` around :1068 writes the first words and returns success.
2. **One home.** There is no second write path. The update is the existing fenced note update.
3. **Item (2) of the addendum is accepted for now:** a pending conversion lives in memory only. Nothing changes there.

## Red

- `a retry with new words while the conversion is pending ends with the new words in Drive` (src/data/vault/drive-vault.test.ts): the first create's answer is lost, a refresh follows, then a retry with different words. The end state is the folder under its first name, holding the loose file and one pile note with the newer words. updatePile resolves only after they land.
- Its outside-change variant: the note is changed elsewhere between the landing and the newer-words update, and the update is refused through the existing modifiedTime check, never written over.

## Verify

- The reds, plus the drive-vault and write-once suites.
- `pnpm check` under the lock. The runner goldens stay exactly 78 and 88.

## Commits

1. The red.
2. The fix.
3. The notes (`docs/harness/2026-10-10-c4-create-newer-words-notes.md`), with `tests changed:` lines.
