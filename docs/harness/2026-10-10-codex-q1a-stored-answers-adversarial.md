Q1a stored answers — adversarial review, pass 1

**Verdict: BLOCK**  
Range: `claude/p3...95169e35`. Static review; no files edited or tests rerun.

1. **Blocking — second answers cannot resolve the subject.** `src/data/spine/scripted.ts:1903` marks exhaustion when the second asking is written, using the first asking’s answer. Scenario: answer round one, receive round two, then provide text that yields a valid placement. `:724` and `:958` discard that placement and leave the item exhausted. The reds test unresolved second answers only.

2. **Blocking — instructions runs erase inbox counters.** `src/data/spine/scripted.ts:694` filters rounds against `inbox`, which is empty for instructions scope (`:649`). `:1907` persists the emptied history. Scenario: exhaust an inbox item, answer a Current state question, then tidy again. The unchanged item can receive a third asking.

3. **Blocking — switching between pile and member bypasses the cap.** `src/data/contracts/questions.ts:69` matches exact subjects or hashes, whereas the existing identity policy treats a pile and its member as related (`src/data/spine/scripted.ts:1108`). Scenario: asking one concerns the pile; asking two concerns its remaining member. The member starts at count one, permitting asking three without a words change.

4. **Blocking — reupload loses durable exhaustion.** `src/data/spine/scripted.ts:694` queries retention using the original subject id; `src/data/contracts/questions.ts:70` requires that id still to belong to a pile. Scenario: replace an exhausted item with the same bytes under a new id, then tidy. Its hash-backed history is dropped and another asking is written. The reupload red checks the vault projection without running the planner afterward.

5. **Blocking — unavailable option destinations allow alternative filing.** `src/data/spine/scripted.ts:711` silently skips a stored action whose folder is gone or outside the allowed roots; `:716` then accepts ordinary model placement. Scenario: select Home, bin Home before continuation, and receive a valid model placement in Resources. The item moves there despite consent naming only Home’s stored id.

6. **Blocking — words-only pile options have no effect.** `src/data/spine/scripted.ts:712` installs consent only for non-context items. A words-only pile installs nothing, and `:715` leaves `d.words` unrestricted. Scenario: choose stored folder A for a words-only pile; the continuation proposes folder B. `:1791` writes its generated note into B, ignoring the selected action.

7. **Blocking — unrelated text answers lose their provenance.** `runner/src/claude.ts:592` omits subject identity when that subject is outside the admitted piles, while `:593` still forwards its words. Scenario: pile B’s answer remains pending after quota refusal; next day, answering pile A admits the existing journal. B’s text reaches A’s planner without either subject id, violating the subject-only typed-data contract.

Minor / v1 limits:

- The cache extension reuses the existing store; no second store or continuation scheduler found. First listing remains zero-read.
- Notes report passing targeted suites, but full check/e2e verification remains incomplete because sandbox listeners were refused.
