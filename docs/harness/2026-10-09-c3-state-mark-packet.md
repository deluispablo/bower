# Packet: c3-state-mark (stage 3, last entry)

- **Entry:** `c3-state-mark`, `ui: true`. Worktree `/private/tmp/bower-c3-state`, branch `c3-state-mark` from `claude/p3`.
- **Ruling sweep (TL-P4-19 addendum 7):**
  - TL-P4-14 stage 3 row (state mark).
  - TL-P4-16 addendum 2 (write-it-silent) and TL-P4-19 addendum 7: it folds in here, both reds must be green, and it uses write-once's stamp+checksum comparison with no new helper.
  - DEFECT_LOG `write-it-silent` and `packet-dropped-ruling`; [defect doc](defects/2026-10-08-write-it-again.md), whose line numbers are stale.
  - TL-P4-18 addenda 2-3: UI copy goes through the designer, and the entry closes after "verified".
- **Starting model:** `bower-escalated` (it writes).
- **Live evidence (write-it-silent):** a fresh q-state from hub run gpHq3SsL. "Write it" started scoped run aao9URR2 at once. The model proposed no update that time, so nothing was written and the question closed silently.

## Today (coordinator map, claude/p3)

- **The 2^12 search.** `withoutSaid` (`src/data/contracts/note-edit.ts:352-361`) walks every subset of the proposed lines, up to 12, for one whose FNV `stateMark` (:253-265) equals `bower_state`. Its only caller is `stateNewsLine` (:367), called from `scripted.ts:984`.
- **What the manifest has.** Its `state-rewrite` change (`run-manifest.ts:66`) records `previous` and `lines`, but no reader uses an earlier manifest's `lines` as Bower's last-written state.
- **q-state.** Its id is `q-state-<fileId>` (`questions.ts:37`), and it stores only the mark (`types.ts:140-144`). It is asked at `scripted.ts:1069-1073`, re-asked at :957-959, and copied on a race at :928-929.
- **A yes today** (`answer-loop.ts:38-39,80`) starts a scoped run. Grants come from `scripted.ts:762-788`, and the write at :960-965 needs the model's `w.state`, so no model update means nothing is written (the defect).
- **The fence.** The engine (`engine.ts:458-470`) re-reads, checks sha256 against `beforeContent` and runs `recheckEdit`, which calls `rewriteState` (with its `previous` and `granted.mark` checks). Write-once has `STAMP`, `stampOf`, `confirms`, `holds` and `updateByStamp` (`write-once.ts:19-94`).

## Contract

1. **The state mark.** Bower's last-written Current state comes from the previous state change (the manifest's `lines`), or each line is marked. `withoutSaid` and its subset search go, and the result for `stateNewsLine` is unchanged on today's tests. Old notes and manifests still read (lenient read). If the previous change is unavailable, say what happens, and test it.
2. **write-it-silent.**
   - The q-state question stores the text Bower showed, with its evidence.
   - A yes applies that stored text through the usual fence, with no model call and no scoped model run.
   - If the section changed since it was shown (write-once's stamp+checksum comparison, no new helper), the question is asked again with the reason.
   - The stored text is optional on the question: old questions without it keep today's path. Compatibility rows for `src/data/contracts` and `src/features` commits.
3. **UI.** Any new or changed sentence (the shown text on the question, the reason on a re-ask) is a named constant. Send its wording to the coordinator on your card, so the designer can check it before close.

The goldens never rise. `removed: <lines>` goes on the card.

## Red

- "Bower's last state is read from the previous state change, not searched"
- "a yes to write it applies the shown text with no model call"
- "write it re-asks when the section changed since it was shown"

## Verify (exact, from features.json)

The three red tests. Real entry point (TL-P4-17): drive the answer through the app's answer loop and the runner. If no e2e covers "Write it", add one through `bash harness/with-lock.sh` and name it on the card.

Then `pnpm check` and the full `pnpm e2e:fake` must be green.

## Checklist

- Every write passes what it read.
- Match by id.
- Every sentence is backed by a test.
- Commits: red, then fix, then notes in their own commit.
- Research first: cite optimistic concurrency (ETag / If-Match) for the shown-text check.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
