# c3-note-sections: delivery notes

Standard solution: a note is YAML front matter between `---` fences plus Markdown whose sections are ATX headings
(CommonMark 0.31 "ATX headings"; Jekyll and Obsidian front matter). One parser (`parseOwnership`) now frames them.

## What changed (parsing only; no write path changed)

- `parseOwnership` returns `layout` for v2, legacy and plain: `front`, `frontEnd`, `current`, `timeline`, `bowerNote` (byte
  spans of the file as read; a legacy section runs heading to next heading; last duplicate heading wins; plain: none).
- `note-format.ts`: `split()` and the legacy string scans are gone; `parseNote` and `toggleTaskInText` read the layout and
  `ownership.tasks` for every status. `timelineBullets` is the one Timeline reader for scripted and the runner corpus.
- `note-edit.ts`: `legacyOf`, `rawIndex`, its `fenceAfter` copy and its fence finder are gone; `sectionsOf` only converts
  the parser's byte offsets to text indices. `frontmatterLines` and `stateSection` read the layout.
- `scripted.ts` reads Timeline lines from the Timeline section only (was: any line of the file in Timeline shape).
- `runner/src/corpus.ts` `timelineOf` reads through `timelineBullets` (last Timeline wins; plain notes have none).
- One Timeline-line pattern and writer: `contracts/timeline-line.ts` (`parseTimelineLine`, `timelineLine`). ESLint rule
  `scripts/eslint-timeline-line.mjs` (joined in `eslint-syntax.mjs`) flags a regex with ` · ` or a ` · [[` template elsewhere.

## Behaviour notes

- Existing test edit: `runner/test/corpus.test.ts` "names every kind of unmet expectation" had a frontmatter-less note with a
  Timeline; a plain note has no sections, so its fixture now has `by: bower` frontmatter.
- Legacy empty Bower's note heading still gives an empty note; v2 gives none (as before).
- Unpaired surrogates in a non-v2 note are now replaced when a task is toggled (v2 already refused them); Drive text is UTF-8.

## Left out

- `stateSection` keeps one probe for a `## Current state` heading with no line ending (the parser reads it as no section);
  it only refuses a second section. ARCHITECTURE mechanism-map row (not mine to edit).
- `harness/duplication-baseline.json` ratcheted 20 to 19 clones (the gate demands it when the count drops).
