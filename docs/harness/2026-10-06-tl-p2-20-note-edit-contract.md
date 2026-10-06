# Technical-lead decision TL-P2-2026-10-06-20: the note-edit contract (B.2)

Lead: Claude `Planificador`. The coordinator asked for operation contracts for the effects that ratified contract B leaves out, before O5. Adopted revision stays `2026-10-05-contracts-2`.

This document is a **contract proposal**. It needs an independent review, which the coordinator assigns, and the lead's ratification before any consumer depends on it. B's records, rules and grounding are unchanged except where this document extends them explicitly.

## Format: one new effect, a new manifest version

- **One new effect, `edit-text`,** with a closed `change` union. This is better than one effect per feature: the precondition, the evidence and the replay rules are the same for all of them, and only the pure transformation differs.
- **`Manifest` gains `v: 2`,** which is v1 plus `edit-text`. A v1 parser refuses `edit-text`, so it fails closed.
- **The runner writes `v: 1`** whenever a plan has no `edit-text`, so every existing v1 fixture and test stays valid. Readers accept both versions.
- **Unchanged:** `Checkpoint`, `ReportRecord`, `Disposition`, `EffectEvidence` and `Outcome`.

```ts
| { kind: 'edit-text'; before: SeenFile; beforeContent: VerifiedContent;
    change: Change; text: Text; content: Content }   // text/content = the whole file after the edit

type Change =
  | { kind: 'timeline-append'; entries: { date: Text; text: Text; source: Text | null }[] }   // 1+ entries
  | { kind: 'link-rewrite'; renames: { from: Text; to: Text }[] }                              // 1+ renames
  | { kind: 'rules-wording'; add: { ruleKey: Id; text: Text; yourWords: Text; since: Time }[]; remove: Text[] };
```

## Rules shared by every `edit-text`

1. **A pure, shared function decides the result.** `applyChange(beforeBytes, change)` returns the after-bytes or a refusal, and it is the only author of `text`. The plan stores its result. The guard checks that `content` matches `text` (size and sha256, UTF-8).

   Every test proves the same thing: the bytes outside the region the change may touch are byte-identical before and after. A refusal means the edit is not planned, and the item gets a visible `setAside` reason or no operation at all, never a weaker edit.
2. **Precondition: the content hash, not only modifiedTime.**
   - Before it dispatches, the adapter reads the file. Its bytes must still hash to `beforeContent.sha256`, and the file must still be where it was seen (`stillAsSeen`). Otherwise the outcome is `rejected` with `conflict`.
   - The next run plans again from the new bytes. A person's edit is never overwritten.
   - The write itself carries the modifiedTime it read. R1's accepted limitation applies to the moment between that read and the write.
3. **Evidence is the existing `EffectEvidence`,** with `content` set to the after-bytes read back. A lost reply reconciles by reading the file:
   - bytes equal to `text` mean the edit applied;
   - bytes equal to `beforeContent` mean it was not applied;
   - anything else stays unresolved and is never written blindly.
4. **Idempotence is decided at plan time.** A change that would leave the bytes unchanged is not planned. If the run is replayed, an applied edit is never sent again; this is B's rule.
5. **Order.** Edits depend on the moves and renames of the same run (`dependsOn`). A link rewrite therefore uses the final names, and a Timeline entry targets a note whose place is settled.
6. **Scope.** An edit applies only to `.md` files inside the person's Bower folder, never under `.bower/`, and never to a file that is a captured Inbox member this run.

## The three changes

### `timeline-append`

This edits only the Timeline, which belongs to Bower.

- **An ownership/2 note:** the new lines are spliced at the end of the `timeline` payload span from `parseOwnership`. Every other byte stays put.
- **A note in the current frontmatter format:** the lines are appended to the end of `## Timeline`. If that section is missing, it is created where `serializeNote` would put it: before `## Bower's note`, or else at the end.
- **A note without frontmatter** is all the person's. Refused.
- **A damaged or unsupported ownership note** (an `OwnershipFailure`). Refused.

**Entries.**

- Each entry is serialized as `- <date> · <text>[ · [[<source>]]]`, the same line `serializeNote` writes.
- `date` is formatted by code from the run's `requestedAt`. It is never a literal like "Today"; the current fake runner's "Today" must go.
- An entry whose exact line is already in the Timeline is skipped (skip if present).

Adapt `history.ts:42–64` from the original app.

### `link-rewrite`

This is the one change that may touch the person's own text, because the Worker contract has always promised it. It only ever changes the **target inside a `[[…]]` token**.

**What gets rewritten.**

- Renames come from the journal through the existing `formerNames`.
- A token matches when its target equals `from`, written as a name, a stem without `.md`, or a path. These are the literal forms of the original app's `sheet_relink`.
- The target is replaced by `to`, written in the same form.
- An alias after `|` and a heading after `#` stay byte-identical.

**What never changes.**

- Tokens inside fenced code blocks and inline code are not links, and stay untouched.
- Every byte outside the rewritten targets stays identical, so the person's prose never changes.

**Where it applies.** Any `.md` note in the folder, including a plain note without frontmatter, and only where at least one token matches. This follows Obsidian's own rename behaviour (`[[New]]`, alias kept), which we reuse rather than invent.

### `rules-wording`

This applies only to `Rules.md` at the root of the Bower folder, and only inside `## Rules` as `rules-format.ts` parses and serializes it. Bytes outside that section stay identical.

- **`add`** worded rules, deduplicated by `ruleKey`: a key that is already present is skipped.
- **`remove`** a rule by its exact worded text, from a journal `removes` line.
- **A missing `Rules.md`** is created with `create-text` (`purpose: 'generated'`) at the root. This is the single place exception to TL-P2-17.

## Features that need no new effect

- **Merge** (an item joins an existing note) is a B `move`, renaming and moving the item next to that note, plus a `timeline-append` on the note. Both go in the same `requires` set. The report's `filed` row, with `note` set to that note, requires both to apply.
- **A saved link filed as a note** is a `create-text` for a generated note (TL-P2-17 rule) plus a B `move` of the original link file. The original link file is never rewritten into a note. This replaces today's in-place rewrite, because originals stay immutable.
- **The journal** needs nothing new. Archiving records is a B `move` into `.bower/changes/archive/`, and `requests.json` is a `write-runner-json`. B already grounds `requests` and `yourChanges`.

## Report grounding added

- **`updated: { path, what }`** may name the path of an applied `timeline-append`. `what` is the authored wording.
- **Link rewrites** add no report row, because they are mechanical. Their evidence stays in the checkpoint.
- **`rulesWorded`** is the number of `add` entries in applied `rules-wording` edits. This replaces B's "absent until adopted".

## Assignment

Before any O5 consumer, register one contract unit. It covers:

- the v2 manifest guard;
- `applyChange` with its byte-preservation tests: ownership/2, legacy, plain-note refusal, link forms, fences, aliases and headings, rules dedupe and removal;
- v1/v2 compatibility fixtures.

Then the unit gets an independent review. After the lead ratifies it, the o5 entries consume it. `b-path-journal` and `o5-saved-link-note` can go ahead now on B's existing effects.
