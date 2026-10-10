# C05 person-notes adversarial review — pass 3

**Verdict: BLOCK**

Range: `c2108cf8...87ef51bf` (`claude/p3...HEAD`)  
Worktree: `/private/tmp/bower-c05-person-notes`

Offline and read-only. Findings below were reproduced through production code in memory. Runner reproductions used fake Drive and virtual temporary files; no disk files were changed.

## Blocking

1. **Retention permits a completed request to append again — `src/data/spine/scripted.ts:159–168,205`.**

   Complete `change-1` on Garden plot. Run twenty newer successful tidy-ups: retention removes the original run’s records. Restore the exact archived `change-1`, admit another source, and have the model propose different wording.

   Reproduced through runner `main`: all twenty newer runs succeeded, the original manifest disappeared, and replay succeeded with both lines:
   ```text
   - 2026-10-07 · The replacement water butt has arrived. · [[Water butt update.txt]]
   - 2026-10-07 · The new water butt is here now. · [[Next letter.txt]]
   ```

   The same `(requestId, targetFileId)` receives another append. TL-P4-32 requires replay to change nothing even with different model wording; addendum 2 grants no twenty-run expiry. The builder’s documented limitation therefore violates the contract.

   **Fix direction:** Preserve verified completion authority through the existing records mechanism beyond retention; text-and-source dedupe cannot replace request identity.

2. **A pending request loses its bound target after rename and can grant a replacement note — `src/data/spine/scripted.ts:213–219,232–234`.**

   File the source and force the bound append to conflict by changing personal prose after manifest persistence. Rename Garden plot to Beds before retrying.

   Reproduced: without the rename, the retry targets the original file id. After the rename, no append is planned despite the verified pending binding. Create a different personal note named Garden plot and admit another source: the same waiting `change-1` now grants that new note.

   Runner `main` reproduced the replacement write: original target `f11` remained unchanged; replacement target `f15` received the line. Settlement resolves titles afresh before consulting retry bindings, allowing the original request to acquire another target and source.

   **Fix direction:** Resolve pending requests from their persisted target/source ids before title matching; a rename must retain the original binding.

## Important

3. **The scripted request handler bypasses oldest-request settlement — `src/data/spine/scripted.ts:701`.**

   Admit two unfinished requests naming Garden plot, oldest first. `settleRequest` excludes the younger request, but journal admission admits it anyway whenever `d.request` exists. The scripted provider supplies that function.

   Reproduced through runner `main` with the scripted provider: the run succeeded, `change-1` stayed active, and `change-2` moved into the archive without any append. A production-planner reproduction with a valid oldest-request append likewise captured and archived both requests while granting only `change-1`.

   This leaves pass-2 finding 5 open on the scripted path and violates addendum 2’s requirement that younger requests remain untouched.

   **Fix direction:** Make C05 journal admission obey `settleRequest` regardless of the generic scripted request handler.

## Prior-finding follow-through

| Earlier finding | Pass-3 result |
| --- | --- |
| Pass 1 / 1; pass 2 / 1 — overflow writes owned notes or hubs | Addressed by whole-source filtering. |
| Pass 1 / 2 — pending binding lost after retention | Retry manifests recognize captured sources; completed-request retention remains broken above. |
| Pass 1 / 3 — equivalent titles evade ambiguity | Both consumers reuse `requestTargets` and `titleKey`. |
| Pass 1 / 4 — completed replay masks a new request | Completed targets are excluded while their evidence remains retained. |
| Pass 1 / 5 — already-present line lacks completion | Satisfaction binds completion to the archive operation. |
| Pass 1 / 6 — untouched state-bullet bytes change | Personal rewrite splices one bullet and checks surrounding bytes. |
| Pass 1 / 7 — plain Timeline reported missing | Plain Timeline span added; state remains excluded under narrowed v1. |
| Pass 1 / 8 — unrelated filing failure hides rows | Per-source report contributions added. |
| Pass 1 / 9; pass 2 / 2 — missing/invented completion evidence | Exact transition completion sets and originating-manifest binding checks added; inherited evidence fields refused. |
| Pass 2 / 3 — refused state skips append | State proposal refusal is independent of the append. |
| Pass 2 / 4 — refusal rows require model lines | Rows derive from resolved requests and read targets. |
| Pass 2 / 5 — another unfinished request archived | **Still open on the scripted path: finding 3.** |
| Pass 2 / 6 — retry cites stale source name | Retry resolves citation from the bound source id; target rebinding remains broken above. |
| Pass 2 / 7 — filing collision invalidates satisfaction | Satisfaction follows final citation naming. |
| Whitespace minors | Pinned-range `git diff --check` passes. |

**Second settlement path: yes.** Finding 3 shows generic request admission bypassing the required single C05 settlement home. Timeline formatting and content writing reuse their existing homes.

ModifiedTime fencing remains connected. Additive validators retain accepted older report, checkpoint and manifest shapes; `leftAsWritten` stays outside updated-note counts. No source-text-only or note-text-only target grant was found.

Unit suites and Drive-call goldens were not independently rerun under the read-only filesystem restriction. No `pnpm check`, e2e or network access was used.
