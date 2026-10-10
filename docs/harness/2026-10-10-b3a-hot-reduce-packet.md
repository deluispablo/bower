# Packet: B3a, the pure hot reduction (TL-P4-42 Q3, Q4, Q6)

- **Entry:** `b3a-hot-reduce`. Worktree `/private/tmp/bower-b3a-hot-reduce`, branch `b3a-hot-reduce` from `claude/p3`. `ui: false` (hot is hidden content Bower writes, TL-P4-41 Q11; no owner's OK). Sequence (TL-P4-29, TL-P4-42): a Codex red session, the Codex implementation (may not change the red), a read-only Codex pass, a fresh Claude review.
- **Rulings:** TL-P4-42 (`docs/harness/2026-10-10-tl-p4-42-b23-contract.md`) Q3, Q4, Q6; TL-P4-45 (hot lives at `.bower/hot.md`; the path is B3b's, not this entry's). Prep: `docs/harness/2026-10-10-b23-prep.md` (B3a row, H2, H3).
- **Research first:** cite the standard for a deterministic, pure projection (a reducer over typed inputs, no I/O), and CommonMark for the list and heading syntax.

## Contract (one new file, `runner/src/hot.ts`; no I/O)

1. `renderHot(inputs)` takes typed, already-read inputs and returns `{ text, provenance }`, making zero model calls:
   - `today` (`YYYY-MM-DD`);
   - `openQuestions: { id, text }[]` in authoritative order;
   - `hubs: { path, lastSettledChange: string | null }[]` (Bower's project and area hubs only; the caller selects them);
   - `changes: { id, at, text }[]` (settled journal changes).
   `provenance` lists the question ids, hub paths and change ids actually shown.
2. **Text, in this order:**
   - `# Hot`, then `_Updated: <today>_`;
   - `## Open threads`, with each open question as `- <text>`, at most 10 rows, then `- and N more waiting on Home`;
   - `## Current focus`, as `- <path> (<YYYY-MM-DD>)`, for hubs whose last settled Timeline change is within the last 30 days (today included), newest first, ties by path, at most 5 rows. Never modifiedTime;
   - `## Recent changes`, as `- <YYYY-MM-DD> <text>`, the last 10 changes, newest first, ties by id.
   - All three headings always appear. An empty section has no rows and no padding.
3. **Ids and text:** de-duplicate by id (questions and changes) and by path (hubs). Any input text is collapsed to one line, so its whitespace and newlines become single spaces, and it can never add a heading or a row.
4. **300 words:** a word is a whitespace-separated run of the whole text. Over 300, cut rows in this order:
   - from the bottom of Recent changes first, then Current focus, then Open threads last;
   - each cut section ends with `- (N more)` (for Open threads, `- and N more waiting on Home` with the full count);
   - the result is at most 300 words.
5. `sameExceptDate(a, b)` is true when two hot texts differ only in the `_Updated:` line (Q5's "written only when more than its date changed"; B3b uses it).
6. `boundHot(text)` caps text read for the prompt at 4,000 characters (Q4) and never cuts inside a UTF-16 surrogate pair. A cut text ends with an explicit mark line `(hot cut at 4,000 characters)`. Empty or missing text gives `""`, with no fabricated text.
7. **Out of scope:**
   - no read or write of `.bower/hot.md`, no maintain target, no prompt position, no RUNNER_WRITES (B3b, B1a, B1d);
   - no corpus case edits (`b23-hot-evidence-only` goes with B3b, updated there to TL-P4-42 Q5 (no archive) and TL-P4-45);
   - no parser of note bytes, no tree, no pending store.

## Reds (a separate Codex session; `runner/test/b23-hot.test.ts`)

Each point needs its own red with a positive control:
- the exact order and headings;
- empty inputs giving three bare headings;
- the 10 and 5 caps with their marks;
- the 30-day window edges (day 30 in, day 31 out, null out);
- newest-first with ties;
- id and path de-duplication;
- a multi-line or `## `-bearing input text staying one row;
- the 300-word cut order and marks, at most 300 words;
- the provenance ids;
- sameExceptDate;
- boundHot at 3,999, 4,000 and 4,001 characters, and a surrogate pair at the edge.
Made-up data only; no real clock (pass `today`).

## Verify

`pnpm -C runner exec vitest run test/b23-hot.test.ts` by the reds' exact names, then `pnpm check`.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-b3a-hot-reduce-notes.md`, line 3 `implementer: codex`).
