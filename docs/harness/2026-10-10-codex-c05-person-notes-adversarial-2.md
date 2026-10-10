# C05 person-notes adversarial review — pass 2

**Verdict: BLOCK**

range: `8af69d7d...383b9c06`
worktree: /private/tmp/bower-c05-person-notes

Offline, read-only review. Findings reproduced with in-memory calls to the production planner, author, manifest guard and engine. No files changed. Vitest and runner `main` were not rerun because the filesystem profile prohibits writable logs and scratch files.

## Blocking

1. **Overflow still updates an unnamed owned note — `src/data/spine/scripted.ts:475,1206`.**

   Request names four personal notes. The model proposes their lines plus a sourced line on the owned `Areas/Home/Home.md` hub. Only the four named targets enter `blocked`; the hub receives an edit while row 7 says no note was updated. Reproduced: the manifest contains the hub edit and the overflow refusal row.

   **Fix:** Apply the overflow prohibition to every content update attributable to that request, including hub updates.

## Important

2. **Inherited evidence can still invent a completion — `src/data/contracts/run-manifest.ts:477–487`.**

   Take the stored recovery fixture’s checkpoint chain for a **move**, add bindings for `(never-admitted, never-targeted)`, add the corresponding applied completion, and recompute predecessor hashes. Put this prefix in another manifest’s `appendEvidence`, with that tuple in `completedAppends`. `parseRunManifestV2` accepts it.

   Expectations come from the supplied checkpoints; their bindings are never checked against the originating manifest. A later request can therefore be suppressed as completed without an append ever occurring. Pass-1 finding 9 remains open.

   **Fix:** Verify each prefix against its originating manifest and expected initial checkpoint through the existing record verifier.

3. **Rejecting a state proposal skips the valid Timeline append — `src/data/spine/scripted.ts:1263`.**

   Use the corpus personal note and its valid bound append, but propose two Current state bullets where it currently has one. The `continue` exits the entire note loop. Reproduced: zero edits, source filed, request archived, no completion.

   The same happens for a plain Markdown note with supported Current state and Timeline sections: `note-edit.ts:317` requires front matter, so `now` is null and the valid append is skipped.

   **Fix:** Refuse the state proposal independently of the append, and support plain-note state spans through the existing layout mechanism.

4. **Ambiguity and overflow rows depend on model-proposed lines — `src/data/spine/scripted.ts:466–474,1825–1829`.**

   Two personal `Garden plot.md` notes match. Have the model file the source without proposing a Timeline line—the natural response when neither target is shown. `sourcesFor` returns no ids, so neither promised refusal row reaches the report. Reproduced: source and request moves exist; `leftAsWritten` is empty. Overflow has the same dependency.

   **Fix:** Derive refusal-row filing dependencies from the admitted request and source binding, independently of model lines.

5. **Another active request is archived without its completion — `src/data/spine/scripted.ts:500,584`.**

   Admit two unfinished requests naming the same personal note. One proposed sourced line selects the first request through `find`. Both requests nevertheless enter `journal` and receive archive moves; only the selected request receives an append binding and completion. Replaying the second request with new wording and an admitted source can append again despite its earlier settlement.

   **Fix:** Settle requests individually; an unbound request must remain waiting or receive independently verified satisfaction evidence.

6. **A retry can append a broken citation after the source is renamed — `src/data/spine/scripted.ts:1038–1043`.**

   File the source, force the append to conflict, then rename the filed source to `Renamed letter.txt`. Retry the waiting request. The planner captures the current source by id but copies the old entry’s `source` unchanged. Reproduced: the retry still appends `[[Water butt update.txt]]`.

   The admission also checks only that citation text is non-null, rather than matching it to the bound source.

   **Fix:** Resolve and validate the retry’s citation through the bound source id and existing filing/name mechanism.

7. **A filing-name collision invalidates an already-present completion — `src/data/spine/scripted.ts:1298–1299,1810`.**

   Put the requested news line citing `Water butt update.txt` in the personal Timeline. Keep an older, different file with that name in the destination, and admit a new inbox source with the same name. Preflight records a satisfied append. Filing chooses a free name and mutates the shared entry’s citation, making that entry absent from the captured text.

   Reproduced: manifest admission fails with `shape`; the whole tidy-up stops before filing anything.

   **Fix:** Determine satisfaction after final citation naming, or re-author it then and plan an append when necessary.

## Minor

- **`docs/harness/2026-10-10-codex-c05-person-notes-adversarial.md:9` and subsequent findings:** trailing whitespace makes the pinned-range `git diff --check` fail. **Fix:** Remove it.

## Pass-1 follow-through

| Finding | Result |
| --- | --- |
| 1 — owned-target overflow | Original case addressed; broader overflow failure remains above. |
| 2 — pending retention | Verified through 22 conflicts, then removal of the first run; binding survives. |
| 3 — equivalent titles | Both consumers now reuse `titleKey`. |
| 4 — completed replay masks new request | Completed requests are excluded; multiple unfinished requests remain broken above. |
| 5 — already-present completion | Durable satisfaction added; filing collision breaks it above. |
| 6 — untouched state bytes | Replacement now splices one bullet’s span. |
| 7 — plain Timeline | Existing layout now exposes its span; plain state handling remains incomplete. |
| 8 — unrelated filing failure hides rows | Per-source dependencies added; omitted model lines still hide rows above. |
| 9 — completion guards | Missing transition completions are checked; inherited provenance remains forgeable. |
| EOF whitespace minor | Original test/corpus EOF issue removed. |

**Second home: yes.** `appendProvenance` admits historical checkpoint bindings separately from `RunRecords.walk`, omitting its originating-manifest comparison. Title matching and Timeline formatting otherwise reuse their named homes.

ModifiedTime fencing remains wired. Older stored shapes remain admitted by the additive validators. I found no source-text-only or note-text-only grant to an unrelated target. Drive-call goldens and the runner-main lost-answer recovery were not independently re-executed.
