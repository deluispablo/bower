# Codex contract sign-off: c05-person-notes (TL-P4-28 ruling 1)

Read-only, medium effort, on the packet at 4414ab9e. Tokens: input 955024 (cached 857600), output 4689.

1. **Important — packet:17–19, 42–44: the state permission contradicts the sole admission.**  
   **Code:** `note-edit.ts:301–308, 411–442, 480`; `scripted.ts:1083–1089, 1125–1126`.  
   The packet refuses every Current state edit, then promises one after “Write it.” Existing code cannot make that exception: a personal note has no writable state section, the grant requires an existing mark, and a successful rewrite writes `bower_state`. The state proposal also replaces the whole section, without enforcing “only that bullet.”  
   **Suggested wording:** “Alongside the Timeline admission, the existing state-rewrite mechanism admits one answered, explicitly shown bullet replacement on a personal note. It preserves every other byte and writes no ownership mark. Unanswered state edits remain `not-bower`. Reds cover yes, no, changed-note re-ask, unrelated bullets and a later run.”

2. **Important — packet:7, 17, 27: request-id consent has no defined provenance or wire representation.**  
   **Code:** `claude.ts:815–817, 913–920, 1165`; `scripted.ts:829, 1150`; `run-manifest.ts:48, 69, 334–335`.  
   Intent lines carry only path, text and citation. The planner supplies empty `recordIds`, and the closed manifest has no consent field. The packet does not distinguish the admission id, pile id and journal request id, or explain how an id proves that this request named this particular note. A missing-id red cannot catch an unrelated or forged id.  
   **Suggested wording:** “Define the stable request identity for inbox words. The runner derives consent from admitted request words and the resolved target file id; the model cannot grant it. Carry that binding through Filing and the existing manifest to note-edit. Own `run-manifest.ts` and its tests. Refuse unrelated request ids, target ids and citations through runner `main`.”

3. **Important — packet:18, 27, 29: request-level idempotence is unspecified.**  
   **Code:** `note-edit.ts:246–259`; `write-once.ts:94–95, 103–112`; `claude.ts:1165`.  
   Timeline deduplication compares text and source, not request ids. Write-once recognizes a particular stamped write; it does not retain every request that appended to a note. A fresh plan after a lost answer can produce different wording, and a subsequent write can replace the landing stamp. The packet names no durable evidence connecting the request to its completed append.  
   **Suggested wording:** “Specify where the existing persisted run/operation records retain the request-to-note completion binding and how resume consults it before replanning. Replaying that request remains unchanged even with different proposed text. Add a production-runner red for a landed append, lost response and failed read-back, followed by resume and later replay.”

4. **Important — packet:16, 46: the two-choice question lacks persisted target identity and answer semantics.**  
   **Code:** `claude.ts:823–827, 939–969`; `scripted.ts:586–588, 720–726`; `contracts/types.ts:128–154`; `answer-loop.ts:34–39`.  
   An inbox ask can hold the pile, but stores no ordered candidate note ids. A `notes` ask instead means keeping two notes as one. Also, “The other one” is the boolean-no answer, which currently starts no run, although row 6 promises either choice proceeds in the next tidy-up. Parsing folder names from question text would lose the required id binding.  
   **Suggested wording:** “Use the existing inbox subject, persist both candidate file ids in displayed order, and map each boolean answer to its candidate. Define whether either choice starts a scoped run. Own the question schema/readers and answer-loop files required. Reds answer both buttons, including after a candidate is renamed or moved, and prove neither note is merged or binned.”

5. **Important — packet:15, 28: ‘named by its title’ is not a testable matching rule.**  
   **Code:** `claude.ts:362, 405–423`; preserved case’s request: “Update the garden plot from this committee letter.”  
   The index resolves paths and ids, but the packet supplies no rule for extracting a title from a sentence. Exact whole-request equality would reject the preserved case; substring matching would violate the contract. Case, word boundaries, overlapping titles and multiple explicitly named titles remain undefined. Named personal notes also compete with hubs under the 12-note context cap.  
   **Suggested wording:** “Specify the accepted title-reference grammar and normalization, including the preserved sentence, and resolve each complete reference to candidate file ids before preparing context. Define overflow behavior when requested notes cannot be shown. Reds cover case normalization, longer overlapping titles, source-text-only mentions and context-budget exhaustion.”

6. **Important — packet:21, 31: the fence red omits the promised recovery.**  
   **Code:** `scripted.ts:1674–1677`; `barrier.ts:280–284`; `claude.ts:915, 928`.  
   The note edit depends on filing the cited source, so the source may already be filed when the append clashes. The existing clash signal specifically recognizes granted state rewrites. Proving “no line was written” does not prove that the next run retains the request, source and target needed to re-ask; normal reply validation expects citations to things being filed.  
   **Suggested wording:** “Define how a refused personal-note append retains its request, target and source after filing, and how the existing retry/question mechanism revisits them. Extend the red through the next production runner call: one re-ask, no lost personal edit, and exactly one append after renewed consent.”

7. **Important — packet:7, 29, 33: the listed corpus verification cannot prove the lifecycle promises.**  
   **Code:** `runner/test/corpus-run.ts:137–154, 158–178`; `runner/test/c05-incorporation.test.ts:71–74`; `runner/src/corpus.ts:258–274, 299–309`.  
   The second corpus run creates a new generic request, rather than replaying the original identity. The standard scorer checks the final run only; substring assertions cannot prove protected sections are byte-identical, and a question count cannot prove it is the correct state question. The driver does not submit “Write it” or “Keep mine.” Its tests are outside the owned files.  
   **Suggested wording:** “Own the corpus driver and runner test files needed. Assert first-run append and typed state question separately; submit both answers through the real answer entry point; verify subsequent results and later non-adoption. Compare protected byte ranges and Drive properties directly. Distinguish original-request replay from a new tidy-up.”

8. **Important — packet:7, 20, 45–47: the new result list requires more than strings.**  
   **Code:** `contracts/types.ts:238–260`; `run-manifest.ts:378–381`; `run-checkpoint.ts:152, 160–162`; `features/tidy/RunLinks.tsx:15–23`.  
   There is no report collection for unchanged personal notes with an optional link. `setAside` has only name/why; `updated` would wrongly count the untouched note. The closed report validators reject an added collection. “Screens’ strings” does not authorize the necessary report contract, materialization and rendering changes.  
   **Suggested wording:** “Name the report representation for ‘Left as you wrote them’ and own its types, manifest/checkpoint validators, report materialization and result component. Stored older reports remain readable. Production-runner and screen reds prove row 5 has a working note link, row 7 has none, and neither increments updated-note counts.”

9. **Important — packet:17, 41: ‘the note’s own line format’ conflicts with the supplied template.**  
   **Code:** `contracts/timeline-line.ts:2–4, 8–18`; `note-edit.ts:259, 777–781`.  
   The single Timeline formatter writes ` · [[source]]`; row 1 specifies a space before `[[source]]`. With row 1’s format, the existing parser treats the link as part of the text rather than the source. “Own format” also leaves unsupported personal Timeline styles undefined; adding formatting inside note-edit would create a second home.  
   **Suggested wording:** “Use `timeline-line.ts` as the sole grammar/formatter and specify the supported personal-note formats, preserving their line endings. Correct row 1’s source separator. If additional formats are required, own that grammar and its tests; explicitly define refusal behavior for unsupported formats.”

findings: 9
