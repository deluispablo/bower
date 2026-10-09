# Packet: c3-note-sections (stage 3)

- **Entry:** `c3-note-sections`. Ruling: TL-P4-14 stage 3 row. Worktree `/private/tmp/bower-c3-sect`, branch `c3-note-sections` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet). Parsing only; no write behaviour changes. If a write path must change, stop and report.

## Today (coordinator map, claude/p3 b9c2674d)

**Five section finders:**

1. `ownership-format.ts` `parseOwnership` :116-166. Its legacy branch `legacyNote` :82-114 gives only the personal span, with no positions for Current state, Timeline or Bower's note.
2. `note-format.ts` `split()` :103-155, a second legacy parser. `parseNote` :177-190 runs it on every note. `payloadDisplay` :87-91 strips headings by string. `toggleTaskInText` :252-253 also uses it.
3. `note-edit.ts` `legacyOf` :175-202, a third copy (its comment at :171 says so). Alongside it: `linesOf` :135-146, `fenceAfter` :155-163, `frontmatterLines` :205-211, `stateSection` :323-344, and `appendLines` :246-251.
4. `src/data/spine/scripted.ts:996-999` scans the whole file for Timeline-shaped lines, not just the Timeline section.
5. `runner/src/corpus.ts:189-198` `timelineOf` finds the Timeline by its own heading regex.

**The Timeline-line regex is spelled four times:**

- `note-format.ts:162`
- `note-edit.ts:42` (`TIMELINE_LINE`)
- `scripted.ts:998`
- `corpus.ts:190`

There are two writers (`note-format.ts:237`, `note-edit.ts:226`). The field rules are in `note-edit.ts:62`.

**Old formats:**

- no frontmatter;
- unterminated frontmatter, or a lone `---`;
- legacy closed frontmatter without `bower_format`;
- missing Current state or Timeline;
- duplicate headings (the last one wins);
- CRLF and BOM.

## Contract

- **One parser.** `parseOwnership` gives every section's position (frontmatter, Current state, Timeline, Bower's note) for v2, legacy and plain notes. `note-format.ts`, `note-edit.ts`, `scripted.ts` and `runner/src/corpus.ts` read positions from it, and their own finders go.
- **One pattern.** The Timeline-line pattern exists once, in one parse function and one `lineOf` writer.
- **Same results.** Every existing note test keeps its result: round-trips, legacy ambiguity, missing sections, duplicate headings, BOM and CRLF. Model-input goldens unchanged. `removed: <lines>` goes on the card.

## Red

- "one parser gives every section position, old notes included": a fixture of each old format, with positions from `parseOwnership`.
- "the Timeline-line pattern exists once": a fixture test of the ESLint rule (`no-restricted-syntax` on the regex literal outside its home, with the shared module `scripts/eslint-syntax.mjs`). Never a repo scan inside vitest.
- "the corpus reads a note Timeline through the one parser" (runner).

## Verify (exact, from features.json)

The three red tests plus "round-trips every demo note". Then `pnpm check` must be green, plus the full `pnpm e2e:fake` (run it through `bash harness/with-lock.sh`).

## Checklist

- Match by structure, never by heading substring outside the parser.
- Commits: red, then fix, then notes in their own commit.
- Research first: cite CommonMark ATX headings and YAML front matter conventions.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
