# capabilities-210-flaky

Diagnosis by Codex, read-only (TL-P4-29 ruling 3), on claude/p3, 2026-10-10. Tokens: {"input_tokens":657373,"cached_input_tokens":567552,"output_tokens":4431}.

Diagnosis: strongest evidence points to reload before answer-run admission, not “Write it” before fake readiness. The precise cutoff is inferred; the logs contain no admission timestamps.

1. **Why is the answered row absent?**  
   `NoteScreen.tsx:235` displays it only from the latest completed run’s report. Saving an answer alone cannot produce it. The planner produces the expected sentence at `src/data/spine/scripted.ts:1108`.

2. **Why might that run never become the latest run?**  
   `e2e/capabilities.spec.ts:253` waits for the question to disappear, then `:254` performs a full navigation. That can destroy the browser’s pending admission work.

3. **Why can the question disappear before admission?**  
   `src/data/vault/drive-vault.ts:1432` records the answer and `:1436` notifies subscribers; `:1410` filters answered questions out. Only afterward does `src/data/answer-loop.ts:74` hash the request ID and `:77` call `runs.start`. Run startup also awaits journal flushing (`src/data/live/runs.ts:115`).

4. **Why does it fail only sometimes, despite `time=instant`?**  
   Playwright’s observation and navigation race against hashing, planning, persistence and admission. “Instant” removes phase delays, not asynchronous work: `src/data/fake/fake-run-service.ts:401` still awaits its pacing function, implemented with `setTimeout` at `:122`. If admission wins, its persisted run recovers after reload (`:240`, `:249`); if navigation wins first, there is no newly admitted run to recover.

5. **Why does the test permit that race?**  
   It treats “answer recorded” as “run accepted.” Its title promises writing, re-asking and an answered row; it does not specify interruption before acceptance. Playwright waits for actionability and the asserted DOM condition, not completion of an application’s asynchronous handler. [Official guidance](https://playwright.dev/docs/actionability).

**Contract verdict:** the test’s synchronization is wrong for this journey. The report assertion remains correct. Accepted runs must survive reload; the code explicitly persists admission before acknowledging it. The supplied evidence does not establish that an acknowledged run was lost. `DEFECT_LOG.md:84` records the same failure on both branches and labels it undiagnosed; it does not establish a readiness cause.

**Readiness and toast alternatives:**  
The supplied `/tmp/newer-e2e.log` readiness stacks point to note-screen `markSeen` and resumable upload work, including during passing tests. `src/data/session.ts:448` rejects verification before lease startup exists; `src/features/note/NoteScreen.tsx:86` calls `markSeen`. These are separate startup symptoms, not evidence that the final answer failed readiness. Fake uses the live session mechanism (`src/data/choose.ts:165`). The missing sentence is a report row in `main`, not a toast; toast replacement cannot explain it.

**Owning mechanism:**  
Journey synchronization belongs to `e2e/capabilities.spec.ts`. Answer-to-admission sequencing belongs to `src/data/answer-loop.ts`; admitted-run persistence/recovery belongs to `src/data/fake/fake-run-service.ts` and its paired Saver in `src/data/fake/pretend.ts:89`. Do not add another scheduler or persistence path.

**(a) Fix inside the owner — XS, low risk:**  
Replace the final `page.goto` with existing in-app navigation to Car. Keep the exact answered-row assertion and its current timeout. This preserves the active handler while verifying the promised result. If reload coverage is intended, first observe that exact completed result, then reload and assert it again.

**(b) Refactor first — M, medium/high risk:**  
Only if the lead extends the contract to automatic execution after closure between answer saving and admission: make the answer-run intent durable and discoverable within the existing answer/admission mechanism, across fake and real sources. Verify interruption with controlled barriers before admission and after acknowledgement. That broader product change is unnecessary for the named journey.

**Same class elsewhere:**  
`e2e/capabilities.spec.ts:237` and `:246` also use question disappearance before subsequent work, but retain the SPA lifetime. `:84` follows disappearance with another tidy-up press. These are early signals, not run-completion barriers. The independent startup-write class appears at `src/features/note/NoteScreen.tsx:86` against `src/data/session.ts:448`.

No retry, sleep, or increased bound is warranted.
