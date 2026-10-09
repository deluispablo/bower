# Packet: c3-pair-ask (stage 3)

- **Entry:** `c3-pair-ask`. Worktree `/private/tmp/bower-c3-pair`, branch `c3-pair-ask` from `claude/p3`.
- **Ruling sweep (TL-P4-19 addendum 7):**
  - TL-P4-16 addendum, keep-one-not-asked → option (b) ([doc](2026-10-08-tl-p4-16-baseline-defects.md); DECISIONS:125). Option (c) is rejected as a second way to decide fit. The live proof is the real path.
  - TL-P4-14 stage 3 row.
  - TL-P4-14 addendum 3: the safety-polish carry-over row 3 (P4-19b, "KEEP_CHANGED says 'both notes stay' after a move or Bin").
  - DEFECT_LOG `keep-one-not-asked`.
- **Starting model:** `bower-escalated` (merge and Bin).
- **Live evidence (keep-one-not-asked):** Projects/Flat hunt held "Flat 3, 12 Larkspur Lane.md" and "Flat 3 (second).md". News in a pile's own words became a third note, and Bower never asked to keep one.

## Today (coordinator map, claude/p3)

- **Asks** can only name a `fileId` or a `pileId`: `AskShape` in `runner/src/claude.ts:796-800`, rules :900-917. `plain()` :842 bans `[[links]]`, and the prompt repeats the ban at :251-253 and :236.
- **Merges** come only from text: `mergesOf` :490-502 builds pairs from a yes whose text matches `KEEP_ONE` (:426) with two `[[links]]`. The app's `src/data/answer-loop.ts:31,41-42` recognises a pair by that same regex.
- **Subject** (`src/data/contracts/questions.ts:25-28`) has no pair kind.
- **The merge:** `KeepOne` is at `scripted.ts:153-157`. The gate is at :376-387; a missing or moved note only logs, and the report says nothing. Carry :872-874, hold :1079-1087, Bin and report :1529-1541. `KEEP_CHANGED` (`note-edit.ts:100`) is pushed only when the Bin is refused because the note changed.
- **Words-only piles** always become a new note (`WordsShape` :785-788; `scripted.ts:612-615`). `lineCites` :880 and `stateCites` :889 accept only filed things, and `noNote` :937-946 never looks at piles.

## Contract

1. **A typed pair ask.** The reply can ask about two notes by their ids (a typed pair, no links in the text). `Subject` gains a `pair` kind (two file ids). The app's answer loop and the runner's merge read the typed subject. The `KEEP_ONE` regex and link parsing go, but old questions in the text form still read (tolerant reader) and settle the same way.
2. **Words-only piles can be cited.** A Timeline line (and a state) may cite a words-only pile, so news in a pile's words updates the existing note under the value gate instead of becoming a new note.
3. **A yes merges** through the existing keep-one-note-merge path: carry, hold, then Bin with what it read. No second merge.
4. **P4-19b.** When the other note was moved or binned by the person, the report says what happened, never "both notes stay". The new sentence is backed by a test.

Behaviour is otherwise unchanged. Goldens 78/88. Compatibility rows for any `src/data/contracts` or `src/features` commit. `removed: <lines>` on the card.

## Red

- "two notes for one thing are asked as a pair"
- "a pair question has a typed two-note subject"
- "a words-only pile can become a Timeline line"
- "keep-one says what happened when the other note moved or was binned"
- "a yes to a pair ask merges through keep-one-note-merge"

## Verify (exact, from features.json)

- The red tests above.
- Real entry point: `bash scripts/e2e-both.sh e2e/capabilities.spec.ts -g "C11: a kept rule and a merge answer are applied"`. Run it through `bash harness/with-lock.sh`, and update the e2e if the question's shape changes.

Then `pnpm check` and the full `pnpm e2e:fake` must be green.

## Checklist

- Every Bin, move or write passes what it read.
- Match by id, never by name or links in text.
- Every sentence is backed by a test.
- Commits: red, then fix, then notes in their own commit.
- Research first: cite discriminated unions and the tolerant reader.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
