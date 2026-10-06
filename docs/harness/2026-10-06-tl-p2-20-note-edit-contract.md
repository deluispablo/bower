# Technical-lead decision TL-P2-2026-10-06-20: the note-edit contract (B.2), revision 2

Lead: Claude `Planificador`. This is a **contract proposal**, not yet ratified. Revision 2 answers independent review `b2-contract-review-1`: 2 Critical, 12 Important and 8 Minor findings, each listed by ID at the end. Adopted revision stays `2026-10-05-contracts-2`.

Contract B's records and rules are unchanged except where extended here. This proposal adds one effect to TL-P2-06's list of B effects. Ownership/2 (TL-P2-03 and the final grammar) governs every byte range named below.

## Format

- **One new effect, `edit-text`.** It is the only new effect. Each one carries an ordered list of changes to one file.
- **Manifest `v: 2`** is v1 plus `edit-text`.
  - The runner writes `v: 1` whenever a plan has no `edit-text`, and a v2 manifest without one is refused.
  - A v1 parser refuses `edit-text`. A build that cannot read v2 leaves the run in `saving` and logs a `BowerError`; the person sees "This tidy-up needs a newer Bower." It never skips the edit.
  - Operation identities are computed exactly as in v1, over the canonical effect, so v1 identities do not change.
- **Unchanged:** `Checkpoint`, `ReportRecord`, `Disposition`, `EffectEvidence` and `Outcome`.

```ts
| { kind: 'edit-text'; before: SeenFile; path: Text; beforeContent: VerifiedContent;
    changes: Change[];                // 1+, applied in this order
    text: Text; content: Content }    // the whole file after all changes

type Change =
  | { kind: 'timeline-append'; recordIds: Text[]; entries: { date: Text; text: Text; source: Text | null }[] }
  | { kind: 'link-rewrite'; recordIds: Text[]; renames: { from: Text; to: Text }[] }   // display names
  | { kind: 'rules-wording'; add: { recordId: Text; text: Text; yourWords: Text; since: Time }[];
      remove: { recordId: Text; text: Text }[] };
```

`recordIds` name the journal records each change comes from (C2). A change made by the run itself with no journal record, such as a merge's Timeline line, carries `[]`.

## Rules shared by every `edit-text`

1. **One pure author: `applyChanges(beforeBytes, changes)`.** It returns the after-bytes or a refusal, and it is shared by the planner, the guard tests and the adapter.
   - **When it refuses,** nothing is planned for that file.
   - **The adapter checks** (I1). It re-reads the file and recomputes `applyChanges`. The result must equal `text`, and `content` must match `text` exactly in size, sha256 and UTF-8 encoding. Otherwise the outcome is `rejected` with `conflict`.
2. **Target.** `path` is the file's verified path. The target is recorded in `capture.places` with its `SeenFile` (I2). It must be a `.md` file inside the Bower folder. It must not be:
   - under `.bower/`;
   - in Inbox;
   - a captured member or child;
   - the `before` of a move (other than an in-place mark move) or of a Bin in the same run;
   - a folder.

   Only `Rules.md` at the root may take `rules-wording`.
3. **One edit per file per run** (I3). All of a file's changes go into one effect, in order. An edit `dependsOn` the moves and creates it needs. An edited note gets an in-place `move` with `properties: { bowerNew: '1' }` that `dependsOn` the edit, and that note gets no mark-clearing move in the same run. This extends TL-P2-10's in-place move to setting the mark (I10).
4. **Precondition** (M1, M2):
   - One read gives the bytes and their modifiedTime.
   - The bytes must hash to `beforeContent.sha256`, and `stillAsSeen` must hold.
   - The write carries that modifiedTime.

   Bower never knowingly overwrites a person's edit. Within R1's accepted window between that read and the write, a concurrent external edit can still be lost, and that limitation is documented.
5. **Read-back after a lost reply** (I5, M3). The adapter reads the file: same id, name and parents, not trashed.
   - Bytes equal to `text` mean `applied`.
   - Bytes equal to `beforeContent` stay `possible-effect`. The edit is sent again only under a trusted no-effect proof (TL-P2-16 §1, fake only).
   - Anything else stays unresolved.

   A change whose result would equal `beforeContent` is never planned, so these cases cannot be confused.
6. **Bytes** (I11). The file must be valid UTF-8, decoded fatally, or the edit is refused. An initial BOM is kept as a prefix, never added or removed.
   - **Evidence provenance** is `fake-stored` only. Real activation needs the reserved raw-byte adapter (TL-P2-03), so B.2 is fake-only until then.
   - **Size limit** (M4). Files larger than 1 MiB are not edited, and a v2 manifest's total size is capped at 8 MiB. A note that is too big keeps its journal record (rule 7).
7. **Journal records and edits move together** (C2). A journal record's archive `move` `dependsOn` every edit that names its `recordId`.
   - **An edit is rejected at run time:** the archive is rejected too (TL-P2-16 §4). The record stays, and the next run tries again.
   - **An edit is refused at plan time** (damaged or unsupported format, too big, invalid encoding, not Bower's note): that record's archive is not planned.

   Either way, the record and the app's former-name resolution keep links working, and nothing is lost silently (M7). Until B.2's consumers land, `b-path-journal` keeps runs with rule, rename or move records on the legacy path; the coordinator has already applied this.

## `timeline-append`

**Which notes** (I7). Only Bower's notes:

- valid ownership/2 notes;
- legacy notes whose frontmatter has `by: bower`.

These are refused: a person's own note (no frontmatter, or frontmatter without `by: bower`), an `OwnershipFailure`, and invalid encoding. A merge therefore only targets a Bower note. The planner does not plan a merge into a person's note, and files the item normally instead.

**Where the lines go** (I6):

- **Ownership/2.** The lines are inserted just before the `timeline` end marker, inside the payload, as the grammar requires.
- **Legacy.** The Timeline section is the one the legacy grammar recognises: the last `\n## Timeline\n` before `## Bower's note`, running to that heading or to the end of the file. The lines are inserted after its last non-blank line, keeping the blank lines that follow.
- **Legacy without a Timeline section.** The planner inserts `## Timeline`, the lines and one blank line before `## Bower's note`, or else at the end of the file. A blank line separates the new section from the line before it.

**Line endings.** A new line copies the ending of the line just before it. Failing that, it copies the ending of the begin marker or heading line. Failing that, `\n`.

**Entries.**

- **Line format.** Each entry is `- <date> · <text>` plus ` · [[<source>]]` when there is a source.
- **`date`.** The UTC calendar date of `requestedAt`, written `YYYY-MM-DD`, the same as Rules. The screen may show it in a friendlier way.
- **`text` and `date` contents.** They are one line with no control characters, and contain neither ` · `, `[[` nor `]]`.
- **`source`.** A display name with no `]`, `|`, `#`, `^` or line break.
- **Refusal and skipping.** An entry that breaks these rules is refused. An entry whose exact line is already in the region is dropped at plan time.

The pure splice adapts `history.ts:42–64` from the original app.

## `link-rewrite`

**What counts as a link** (I8). It matches exactly what the app's resolver (`resolverFor`, `linkTarget`) follows:

- **Token.** A `[[…]]` token, optionally preceded by `!` for an embed, with no `]` and no line break inside.
- **Target.** The token's target is the text before the first `|`, cut at its first `#` or `^`, trimmed and lowercased. It matches a rename's `from`, compared as a lowercased display name.
- **The new name.** The target is replaced by `to`'s display name as written. `#heading`, `^block`, `|alias`, `!` and every other byte stay identical.
- **What does not match.** Path forms and `.md` forms are not resolved by the app, so they are not rewritten. Markdown links `[text](…)` are never touched.
- **One pass.** All renames are applied in a single, simultaneous pass, as `formerNames` resolves them, chains and `taken` exclusions included. A target is never rewritten twice.
- **Code.** Inside fenced code, using ownership/2's fence definition, and inside inline code spans (a run of backticks up to the next run of the same length on the same line), nothing is a link.

**Where** (C1):

| Note | Rewritable ranges |
| --- | --- |
| Valid ownership/2 | The four payloads (`current`, `personal`, `timeline`, `bower-note`), plus frontmatter value lines other than `bower_format`. Marker lines, separators and the BOM never change. |
| Legacy (frontmatter, any `by`) | The whole file except the frontmatter delimiters and keys. Values such as `key: [[X]]`, `original` and `bower_source` are links. |
| Plain (no frontmatter) | The whole file. This is the person's note, and the Worker contract has always kept its links working. |
| Invalid, unsupported or invalid encoding | Refused. Its records are not archived (rule 7). |

The person's prose never changes: only the target text inside a matching token does.

## `rules-wording`

This applies only to the root `Rules.md`, and only when its frontmatter has `by: bower` (I9). Otherwise the change is refused, and the rules stay pending in the journal (rule 7).

- **Section.** `## Rules`, as `rules-format.ts` parses it. If the heading is missing, the section is added at the end of the file.
- **`add`.**
  - **Duplicates.** An add is skipped when `ruleLike` finds a rule with the same wording or the same "You wrote" words. The `ruleKey` normalisation does this, and it is text, not an `Id`.
  - **Placement.** New rules go at the top of the list, newest first, as `- <text> <!-- since YYYY-MM-DD -->` followed by `  *You wrote: "<yourWords>"*`.
  - **What a skipped add means.** Its journal record still counts as satisfied, and is archived.
- **`remove`.** The rule whose exact text matches is removed, together with its "You wrote" line.
- **Summary line.** A frontmatter `summary:` line that matches the generated pattern is updated to the new count. Every other byte stays identical.
- **Missing `Rules.md`.** It is made with `create-text` (`purpose: 'generated'`, the single place exception to TL-P2-17) with `by: bower`, `bowerNew: 1` and `bowerItem` = `createKey` (M6).

## Features that need no new effect

- **Merge** (I4). The `timeline-append` on the target note runs **first**. The item's B `move` then `dependsOn` it.
  - **Grounding.** The `filed` row's `note` is the path of that applied append.
  - **Retries converge.** A failed move retries next time, and the Timeline line is skipped as already present.
- **A saved link filed as a note** (M5). This is a `create-text` for the generated note (TL-P2-17), plus a B `move` of the original link file to the same destination folder.
  - The original link file is never rewritten.
  - The `filed` row's fields are: `name` = the original item name, `title` = the note title, `kind: 'link'`, `to` = the destination, and `note` = the generated note path. It requires both effects.
- **The journal.** Archiving is a B `move`, and `requests.json` is a `write-runner-json`. Rule 7 adds the dependencies.

## Report grounding added (I10)

- **`updated: { path, what }`** may name the path of an applied `edit-text` that contains a `timeline-append`.
- **Link rewrites and rule removals** add no rows.
- **`rulesWorded`** counts `add` entries actually written: by an applied `rules-wording` edit, or by an applied `create-text` of `Rules.md`. A skipped duplicate does not count.

## The contract unit to register

One unit, `note-edit-contract`, consumed afterwards by the o5 and `b-path-merges` entries. It contains:

- the v2 guard: `edit-text` shape and target exclusions, one edit per file, v2 refused without `edit-text`, v1 identities unchanged;
- `applyChanges` with the per-change guards above.

Its fixtures, each byte-exact:

- **v1/v2 compatibility:** a v1 manifest still parses, v2 is refused by v1, and a v2 manifest without `edit-text` is refused.
- **`timeline-append`:**
  - ownership/2, with LF, CRLF and an empty payload;
  - legacy with a Timeline section, without one, and with `## Bower's note`;
  - refusals: a person's note, a plain note, an `OwnershipFailure`, invalid UTF-8;
  - a BOM;
  - an entry already present.
- **`link-rewrite`:**
  - each note kind in the table above, including frontmatter values;
  - fences, inline code, embeds, `#`, `^`, `|`;
  - a Markdown link left untouched;
  - a chain, `taken`, and case.
- **`rules-wording`:** add, a duplicate by `ruleLike`, remove with its "You wrote" line, a missing section, the summary line, and `Rules.md` without `by: bower`.
- **Recovery:** read-back as applied, as before, and as other.
- **Dependencies:** a rejected edit keeps its journal record.

Then: delta review, ratification, consumers.

## Findings answered

C1 → Where table. C2 → shared rule 7. I1 → rule 1. I2 → rule 2 and `path`. I3 → rule 3 and `changes[]`. I4 → Merge. I5 → rule 5. I6 → `timeline-append`. I7 → Bower's notes only. I8 → `link-rewrite`. I9 → `rules-wording`. I10 → rule 3 mark and grounding. I11 → rule 6. I12 → Format. M1, M2 → rule 4. M3 → rule 5. M4 → rule 6. M5 → saved link. M6 → `Rules.md` marks. M7 → rule 7. M8 → Format; TL-P2-06's effect list gains `edit-text`.
