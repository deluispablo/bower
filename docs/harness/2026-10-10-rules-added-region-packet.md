# Packet: rules-added-region (rules-original-conversion, simplified; escalated: contracts and note-edit)

- **Entry:** `rules-added-region`. Worktree `/private/tmp/bower-rules-added-region`. Escalated (TL-P4-29: contracts, note-edit): Codex red, Codex implementation, Codex read-only pass, fresh Claude review. Implementation after b6a-templates and b5a-contracts hand off note-edit (shared file). `ui: false`: what the Bower screen shows is a later entry under the designer's D1/D2.
- **Ruling:** TL-P4-53 (DECISIONS): simplified to B4's pattern. The original prose is never converted. The first app-added rule byte-appends a marked "Rules added in Bower" region at the end of the person's Rules.md, and that add is the consent. No conversion action, wizard or conversion Undo. Q6–Q8 as recommended. Prep: `docs/harness/2026-10-10-rules-conversion-prep.md` (section 1 "What happens today", Q6–Q8 rows; its split is superseded by this packet).
- **Research first:** cite CommonMark headings/sections for the region boundary, and the byte-append pattern TL-P4-48 set for B4's About me.

## Contract

1. **Region.** `wordRules` (note-edit.ts:741), on a Rules.md the person owns (today `not-bower`), appends one marked region "Rules added in Bower" at the end of the file: every byte before it is unchanged (line endings kept). Later rule adds and removals edit only inside that region. A Bower-owned or legacy managed Rules.md and the exact-template repair keep their current behaviour.
2. **Consent.** The person's first app-added rule (`addRule` journal line) is the consent; nothing else (tidy-up, dismissSuggestion) creates the region.
3. **Reading (Q8).** The app's rule list and the planner's count read managed rules only from the region (or from a Bower-owned file as today); the person's prose is never imported, counted or deduped as rules. No generated summary may say zero rules are followed when the person's prose is there.
4. **Limits (Q6).** Fatal UTF-8 validation; the existing 1 MiB bound including the region; exactly one eligible root Rules.md, ambiguity refused; adding the region twice is an idempotent no-op.
5. **Model view (Q7)** is a follow-up entry (`rules-added-region-model`, runner claude.ts and corpus; a shared planner home, sequenced by the lead): original first, the region second, one 4,000-unit projection with today's marked cut.
6. Old Rules.md files, journal lines and manifests keep their meaning; compatibility rows for contracts commits.

## Reds (separate Codex session)
Through the vault API (`addRule`, a tidy-up through runner main via the corpus driver where wording happens) and note-edit's API: a plain original gets the region appended with exact original bytes kept; a second add edits only the region; a remove inside the region; prose never listed as rules; idempotent region; legacy managed file and exact-template repair unchanged (controls). New file `src/data/vault/rules-added-region.test.ts`. Made-up data only.

## Verify
The reds by exact name, `pnpm check`, the corpus tests, e2e app on demo and fake.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-rules-added-region-notes.md`, line 3 `implementer: codex`, `removed:` lines, compatibility rows).
