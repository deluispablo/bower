# Codex adversarial pass: c4-undo-compensate (TL-P4-29 ruling 2, session 3)

Read-only, medium effort, scope `git diff claude/p3...c4-undo-compensate`. Tokens: {"input_tokens":1449580,"cached_input_tokens":1350784,"output_tokens":7558}.

1. **Important — [journal.ts:411](/private/tmp/bower-c4-compensate/src/data/vault/journal.ts:411): a dropped line can still reach Drive.** Reproduced: tab B queues an unreserved line offline; tab A flushes while storage writes fail and Drive remains offline. A retains the reserved line in memory, while storage still holds its bare version. Once storage recovers, B’s `retract()` returns `dropped`; A’s next flush sends it. The reservation’s failed `keep()` is ignored. Breaks TL-P4-27 addenda 2(2) and 4(3): a dropped line must never be sent.

2. **Important — [drive-vault.ts:1358](/private/tmp/bower-c4-compensate/src/data/vault/drive-vault.ts:1358): Undo of a kept suggestion fails after a tidy-up.** Reproduced with “Recipes go to Resources / Cooking”: keep it, tidy up, then invoke Undo and tidy up again. Undo resolves, but the rule remains. Its inverse removes the original title; Rules.md contains the worded title ending in a full stop, and removal matches exactly. Breaks addendum 2’s requirement that the inverse apply whenever it arrives.

3. **Important — [note-edit.ts:638](/private/tmp/bower-c4-compensate/src/data/contracts/note-edit.ts:638): equal-time rules apply out of line order.** Reproduced through two vaults with the same clock value: remove a worded rule in A, then add it in B, with IDs ordering removal before addition. `rules()` still omits it because the merged sequence places every add before every removal at equal `since`. Breaks packet Addenda 4 and 5 §1 / TL-P4-27 addendum 4(1), requiring stable line order.

4. **Important — [scripted.ts:1854](/private/tmp/bower-c4-compensate/src/data/spine/scripted.ts:1854): a later rule inverse has no report row.** Reproduced: add a rule, complete its tidy-up, then send its inverse removal and run another tidy-up. The rule is removed, but the second report contains only empty row arrays. The unpaired removal contributes zero changes and no row. Breaks packet “What the person sees” and addendum 3: a later inverse must appear alone with its ordinary wording.

findings: 4

## Round 2 pass (reds 0e6fde89, fix c9811c7e)

Read-only, medium effort. Tokens: input 983128 (cached 892032), output 6767.

1. **Important — [journal.ts:304](/private/tmp/bower-c4-compensate/src/data/vault/journal.ts:304): an inverse reaches Drive after its original is refused.** Reproduced: queue a reserved original offline; `retract()` returns `sent`; recording its inverse flushes the original, which is permanently refused and enters the failed list. The inverse then sends successfully. Breaks packet §5 / TL-P4-27 addendum 4(5): no inverse may be sent for an original on the failed list.

2. **Important — [journal.ts:274](/private/tmp/bower-c4-compensate/src/data/vault/journal.ts:274): the unlocked fast-path decision bypasses FIFO across tabs.** Reproduced: tab B starts an earlier record but waits for its owner; tab A sees an empty outbox and pauses resolving the changes folder. B resumes, fails reservation offline, and stores its waiting line. A resumes and sends its later line without checking again. Drive contains only the later line while the earlier one waits. Breaks packet §5 / addendum 4(5), requiring per-folder FIFO.

3. **Important — [scripted.ts:1859](/private/tmp/bower-c4-compensate/src/data/spine/scripted.ts:1859): a later move inverse still has no report row.** Reproduced: send a move, complete its tidy-up, send the move back with `undoes`, then tidy up again. The second report has `yourChanges: 1`, but every row array is empty. Round 2 added a row only for rule inverses. Breaks addendum 3 and the packet’s later-inverse contract: the inverse must appear alone with its ordinary wording.

4. **Important — [note-edit.ts:644](/private/tmp/bower-c4-compensate/src/data/contracts/note-edit.ts:644): an old manifest without `since` changes meaning.** Reproduced with a stored rule “Keep PDFs whole.” whose “You wrote” text is “dont split pdfs”, and a legacy removal targeting “dont split pdfs”. The baseline leaves Rules.md unchanged; HEAD removes the rule through `ruleLike`. Legacy ordering survives, but legacy exact-match removal does not. Breaks packet §1 / addendum 4(1), requiring old manifests without `since` to behave as before.

findings: 4
