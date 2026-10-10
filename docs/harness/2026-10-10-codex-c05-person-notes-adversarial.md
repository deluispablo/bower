# C05 person-notes adversarial review

**Verdict: BLOCK**

Range: `f40d0e45...38bff1ab`. Read-only, offline review. Tests could not run: the sandbox denied creation of `/tmp/c05-adv-runner.log`. Findings below are static reproductions.

## Blocking

1. **Overflow still writes Bower-owned notes — `src/data/spine/scripted.ts:1187`.**  
   Request updates four named notes, including a Bower-owned note. Overflow puts their ids in `blocked`, but only personal notes have their lines filtered. The owned note’s append or state rewrite proceeds while row 7 claims no note was updated.
   
   **Fix:** Apply the overflow prohibition to every affected note before planning its content changes.

## Important

2. **Pending append bindings disappear after retention — `src/data/spine/scripted.ts:145–148`.**  
   Run 1 files the source and rejects the append with a conflict. Subsequent retries also conflict; those manifests capture the already-filed source as a place, with no source move. History therefore ignores their rejected appends because `sourceLanded` is false. After twenty newer runs bin the original run, no pending binding survives. The waiting request cannot retry its now-filed citation.
   
   **Fix:** Preserve and recognize verified pending bindings across retry manifests and retention, including sources captured as places.

3. **Equivalent titles bypass ambiguity protection — `src/data/spine/scripted.ts:463`, `runner/src/claude.ts:407`.**  
   Personal notes named `Garden plot.md` and `The Garden plot.md` both match “Update garden plot…” because `namedNotes` strips articles. Ambiguity grouping compares their untrimmed titles, considers them different groups, and grants both targets. Both notes can receive a line instead of being left alone.
   
   **Fix:** Return the normalized title key from the single title-matching mechanism and reuse it for ambiguity grouping and context suppression.

4. **A completed replay consumes the choice for a new request — `src/data/spine/scripted.ts:484–485`.**  
   Admit completed request R1 again alongside new request R2, both naming the same personal note, with a newly filed source for R2. `find` selects R1 first; its completion makes `consentFor` return immediately. R2 receives no consent even though it is eligible. Its source is filed and its request can be reported completed without the requested append.
   
   **Fix:** Resolve eligible request bindings individually; a completed request must not mask another request for the same target.

5. **An already-present append records no completion — `src/data/spine/scripted.ts:1275`.**  
   A fresh request proposes a line whose text and source already exist in the Timeline. The author returns `unchanged`, the request settles, but no bound edit operation or completion is persisted. Replay that request with another admitted source and different wording: the runner grants consent again and appends a line.
   
   **Fix:** Persist completion when the bound request is satisfied by an existing line, using the existing checkpoint mechanism.

6. **A granted state update changes untouched bullet bytes — `src/data/contracts/note-edit.ts:440–447`.**  
   Use a supported personal note with CRLF front matter and LF Current state bullets. Answer “Write it” for one changed bullet. The rewrite rebuilds every bullet with `eolOf(text)`, converting the untouched bullets’ LF endings to CRLF. The personal invariant at line 485 compares trimmed contents and accepts this.
   
   **Fix:** Splice only the changed bullet’s original byte span and check unchanged bullet spans byte-for-byte.

7. **A valid plain-note Timeline is reported missing — `src/data/contracts/note-edit.ts:235–238`.**  
   A personal Markdown note without YAML front matter contains `## Timeline` followed by valid `timeline-line.ts` lines. Ownership parsing returns the plain layout without section spans, so the bound append returns `no-timeline`. The note is left unchanged with the false claim that it has no Timeline.
   
   **Fix:** Extend the existing section-layout mechanism to recognize supported plain-note Timelines; retain one parser home.

8. **An unrelated filing failure hides refusal rows — `src/data/spine/scripted.ts:1798–1800`.**  
   File source A for a note with no Timeline and unrelated source B in the same run. A’s move succeeds; B’s move fails. Every `leftAsWritten` row requires *all* filing moves, so A’s promised explanatory row disappears despite A being filed.
   
   **Fix:** Bind each refusal row to its relevant source filing rather than every filing in the run.

9. **Completion guards accept missing or invented evidence — `src/data/contracts/run-checkpoint.ts:337`, `src/data/contracts/run-manifest.ts:416`.**  
   A correctly hashed checkpoint chain can advance a bound operation from `possible-effect` to `applied` while leaving `completedAppends` empty: the guard checks only retained and newly added completions. Separately, a manifest can introduce an arbitrary inherited completion; its first checkpoint copies it, and `RunRecords`’ equality check accepts it. History then treats that tuple as completed.
   
   **Fix:** Require the exact inherited-plus-applied completion set and verify the provenance of inherited manifest completions.

## Minor

- `runner/test/c05-person-notes.test.ts:359` and the two new corpus text fixtures have extra blank lines at EOF; the pinned-range `git diff --check` fails. **Fix:** Remove the extra EOF blank lines.

The diff reuses the content-write path and Timeline formatter. Title equivalence has inconsistent definitions, identified in finding 3. I found no source- or note-text-only grant to an unrelated target. The existing modifiedTime fencing remains wired; runtime recovery and Drive-call goldens were not independently verified here.
