# Packet: P4-19 delta check (keep one note, C05 corpus with scripted proposals)

Starting model: `bower-escalated` (Opus), fresh and read-only. TL-P2-46 fallback until Codex is back on 2026-10-12. Read only this packet, the rulings named here and the diffs, never workers' deliveries.

- **Diff:** `git diff 84072d9..<SHA in your prompt> -- runner src harness/corpus docs/harness/2026-10-08-p4-method-rubric-changes.md`.
  - `c05-incorporation`: red `4729002`, `ad7f8d2`, grounded hub line `437229a`.
  - `keep-one-note-merge`: red `350fabf`, code `a3a1e8a`, row `529fc60`.
- **Contracts:** TL-P4-08 addendum 7 in DECISIONS.md (the intent names the kept note and the other; facts and Timeline carry over with sources; the other goes to the Bin; links rewritten; all undoable). TL-P4-10 and addenda (a person's Current state is never rewritten). TL-P4-08 addendum 5 (numbers grounded). AGENTS.md: never hard-delete, stillAsSeen, modifiedTime, errors never swallowed.
- **Look hardest at:**
  - **The merge's data safety.** Can the kept note lose a person's words? Can the other note be binned when its facts did not land (a refused write, a kill between steps, a resume)? Is the order safe (write kept, rewrite links, then bin)? Is undo complete from the manifest (other note's bytes and place, the kept note's text, every link)?
  - **The intent.** Can the model name the wrong notes (outside the folder, the same note twice, a note it was not shown, a person's own note) and get through validation? One retry, then C12?
  - **Expectations changed.** The grounded line replaced "7 out of 10" in c05-hub-lines, c05-line-not-repeated, c06 and c07 expectations. Each change must follow a ruling, not bend the corpus to the code.
  - **Compatibility.** `beforeText` and the new change kind: older bundles refuse; deploy together, as the row says?
- **Run:** single test files only, one at a time. Use a detached worktree under `/private/tmp/p4-19-review/` and remove it afterwards. No `gh`, `wrangler`, `claude` or network.
- **Reply:** the review card in `docs/harness/WORKER.md`, every line under 120 characters. Details go in `/private/tmp/p4-19-review-notes.md`.
