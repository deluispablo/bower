**Diagnosis: `c05-person-timeline-format`**

Read-only inspection of checkout HEAD `1839b292`; no network or file edits. Runner tests were not executed because their driver writes temporary files. The supplied lead design is the diagnosis contract; its named ruling was not found in this checkout’s `DECISIONS.md`.

**Root cause**

The refusal is in [note-edit.ts:213](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:213). `timelineRefusal` requires every nonblank line after the Timeline heading to pass `parseTimelineLine`.

That parser accepts only `- <date> · <text>` with an optional source link ([timeline-line.ts:8](/Users/deluisp/Projects/bower-app/src/data/contracts/timeline-line.ts:8)). `- 1 Oct: Alex dug the first bed.` fails because it has no ` · ` separator. Dates themselves are not validated by this reader. `* ` bullets also fail.

Ownership parsing does **not** reject the person’s wording. It finds the last exact `## Timeline` heading, normalizes CRLF for locating it, and maps positions back to original bytes ([ownership-format.ts:124](/Users/deluisp/Projects/bower-app/src/data/contracts/ownership-format.ts:124), [ownership-format.ts:153](/Users/deluisp/Projects/bower-app/src/data/contracts/ownership-format.ts:153)).

The same admission check runs without a proposed line: `personalTimelineRefusal` calls `timelineRefusal`; the planner then calls `settlement.refuse`, clears proposed lines and state, and produces the “can’t read” row ([note-edit.ts:224](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:224), [scripted.ts:1410](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1410)). Thus the scripted evidence is explained: the format refusal takes precedence over `settleRequest.unsettled`’s “nothing found” row ([scripted.ts:375](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:375)).

**Other readers and idempotence**

- Current state handling does **not** parse Timeline entries. Ownership frames its leading `- ` bullets; note-edit strips that prefix and keeps their content opaque. A dated-colon Timeline cannot break it. `* ` Current state bullets and plain notes without frontmatter remain separate existing limitations ([ownership-format.ts:165](/Users/deluisp/Projects/bower-app/src/data/contracts/ownership-format.ts:165), [note-edit.ts:336](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:336)).
- The display/invariant reader does read person Timeline bullets. It retains an unrecognized `- ` line as undated text, but filters out `* ` lines. Plain notes display their whole body instead; `timelineEntries` still reads their Timeline for the append invariant ([note-format.ts:166](/Users/deluisp/Projects/bower-app/src/data/contracts/note-format.ts:166)).
- Durable C05 completion uses request record id and target file id, verified operation outcomes and checkpoints; it does **not** parse person Timeline wording ([records.ts:86](/Users/deluisp/Projects/bower-app/src/data/spine/records.ts:86), [scripted.ts:243](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:243)). Preserve this mechanism.
- “Already has this line” is a separate content check: note-edit parses existing lines and compares **text plus source, ignoring date** ([note-edit.ts:281](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:281)). Arbitrary dated-colon person entries should stay opaque; they cannot prove a recorded request was completed. However, newly written Bower lines using `* ` must parse, or this check will miss them.
- The planner’s text-only `said` check also parses Timeline bullets, but applies only to lines without a record or source; it is not C05’s bound sourced append check ([scripted.ts:1491](/Users/deluisp/Projects/bower-app/src/data/spine/scripted.ts:1491)).
- Manifest verification proves an already-present append by calling the same `applyChanges` and requiring `unchanged`; marker support must work there too ([run-manifest.ts:470](/Users/deluisp/Projects/bower-app/src/data/contracts/run-manifest.ts:470)).

**Fix shape**

Replace content-format admission with **one structural appendability predicate in note-edit**. Both `personalTimelineRefusal` and `appendLines` call it. It should return the refusal or the append position and top-level marker; it should never interpret the person’s dates or prose.

Keep `timeline-line.ts` as the sole grammar and writer for Bower’s added line, supporting the chosen `- ` or `* ` marker. Update note-format’s bullet extraction to retain both markers and use that reader for Bower-shaped entries. Otherwise the re-parse invariant will reject a successful-looking star append: it requires parsed after-entries to equal previous entries plus the addition ([note-edit.ts:840](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:840)). Add no colon-date parser.

Preserve consent, one sourced line, modifiedTime checks and record-id completion.

**Placement risks**

- CRLF: use original offsets and the existing byte splice; never normalize stored text. `linesOf` already excludes CRLF from content offsets ([note-edit.ts:163](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:163)).
- Markers: keep top-level `* `; for mixed markers, pin a deterministic rule such as the last top-level marker.
- Nested bullets: append after the final item’s complete subtree, at top level; do not copy a child’s indentation or marker.
- Trailing blanks: insert before them and preserve every original byte and final-newline state. Existing placement already splices at the last nonblank line’s content end ([note-edit.ts:265](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.ts:265)).
- Following heading: current plain framing reaches EOF; legacy framing stops only at Bower’s note. A later `## Links` therefore currently triggers refusal. Bound the personal list append before the following section; do not append into that section or globally change established Bower-note placement ([note-edit.test.ts:520](/Users/deluisp/Projects/bower-app/src/data/contracts/note-edit.test.ts:520)).

**Required reds and controls through runner `main`**

Use the existing driver, which calls real `main` ([corpus-run.ts:261](/Users/deluisp/Projects/bower-app/runner/test/corpus-run.ts:261)), with made-up `Allotment diary.md` and a request naming it.

1. **Dated-colon list:** exact evidence bullet; scripted/no offered line must yield “nothing found,” unchanged bytes and zero append completions. Current code yields “can’t read.”
2. **Plain list:** `- Alex dug the first bed.`; a recorded model reply offering one sourced line must append exactly once, report updated, archive the request and record completion. Repeat without frontmatter.
3. **Prose section:** `Alex dug the first bed.` without a bullet must retain “can’t read,” unchanged bytes and zero append completions—even when a line is offered.
4. Pair refusal cases with an appendable person-note control and the existing Bower-owned positive control ([c05-person-notes.test.ts:59](/Users/deluisp/Projects/bower-app/runner/test/c05-person-notes.test.ts:59)).
5. Cover CRLF, `* `, nested children, trailing blanks and a following heading with exact-byte assertions. Preseed a Bower-shaped star line: require no duplicate, durable completion and unchanged bytes on replay.
6. Replace the existing “unparseable Timeline” fixture `* September: planted garlic.` with actual prose; under the supplied ruling that fixture is appendable ([c05-person-notes.test.ts:218](/Users/deluisp/Projects/bower-app/runner/test/c05-person-notes.test.ts:218)).

These are proposed assertion reds and controls, not executed results.
