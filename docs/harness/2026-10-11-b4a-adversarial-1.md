# B4a adversarial pass 1 (Codex gpt-6-astra xhigh, read-only)

1. **Blocking: data safety** — [run-manifest.ts:756](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:756): Ledger protections depend on the declared path, not the target identity. With existing observations and tombstones, target `ledger-id` / `observations.jsonl` but declare `.bower/questions.json` and write `{"v":1,"questions":[]}`. Both manifest validation and admission accept it, allowing the evidence and tombstones to be overwritten.

2. **Blocking: data safety** — [ownership-format.ts:285](/private/tmp/bower-b4a-contract/src/data/contracts/ownership-format.ts:285): In a valid ownership/2 note, put the three About me regions inside a Markdown code fence following the existing regions. Those outside bytes should remain personal and opaque. The parser exposes writable About me spans, and `applyChanges` successfully rewrites the personal code example.

3. **Blocking: data safety** — [observations.ts:100](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:100): Store “Alex grows beans” and “Alex grows mint” as separate facts from one pile source. Append a Forget tombstone targeting only the beans fact. The reducer returns no live facts: the source-wide block also forgets mint, although it was not targeted.

4. **Blocking: data safety** — [observations.ts:104](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:104): Store an observation from run A and a replay from run B with identical source, hash and text but fresh event/fact IDs. Initially they deduplicate to A. Undo A, and `rebuildObservations` promotes B’s duplicate into live evidence, resurrecting the observation without new words.

5. **Blocking: hard rule** — [run-manifest.ts:816](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:816): Omitting `archive` bypasses consolidation checks. Starting with the supplied manifest, retain four observations, remove the archive/frontier operations and archive field, and shorten the 201-word preferences section. Validation returns `ok: true` without five facts, an archive, or a frontier. An empty ledger with omitted `factIds` also permits an unbound rewrite.

6. **Blocking: hard rule** — [ownership-format.ts:242](/private/tmp/bower-b4a-contract/src/data/contracts/ownership-format.ts:242): A note ending with `## What Bower has learned\n<!-- bower:ownership/2 begin abo\n` contains a damaged boundary. Because the fragment lacks `about-`, parsing returns `plain`; initialization succeeds and leaves two learned-section headings instead of refusing the write.

7. **Blocking: normal use** — [observations.ts:108](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:108): Store the same fact from the same source across five source versions, changing only hashes and issued IDs. All five remain live. For a 201-word preferences section, the consolidation gate returns `true`, counting reread evidence as five new observations.

8. **Blocking: normal use** — [admitted.ts:149](/private/tmp/bower-b4a-contract/runner/src/spine/admitted.ts:149): On the first consolidation, create the missing section folder and reference it through `parent.createdBy` for the archive. The correctly ordered manifest validates, but `outsideAdmitted` returns “an archive outside its section”: it resolves only existing `fileId` parents.

9. **Blocking: normal use** — [note-edit.ts:938](/private/tmp/bower-b4a-contract/src/data/contracts/note-edit.ts:938): Initialize an ordinary About me containing `Alex grows beans.` without a final newline. Appending the section directly returns `not-bower`; prefixing the addition with the necessary newline also returns `not-bower`. No byte-preserving initialization is accepted.

Second parser, writer or region mechanism: none found.

verdict: BLOCK
