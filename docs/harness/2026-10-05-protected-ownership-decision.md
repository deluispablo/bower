# Technical-lead decision proposal: protected Current state ownership

Status: **Proposal only; protected-current-prose implementation is blocked on the ownership-format decision.** No contract adoption, source edits, tests, builds, browser use or delegation by this reviewer. The block concerns this dependent parser repair, not unrelated P2 work. Do not mark the defect/capability complete by refusing legitimate personal notes.

- Author: independent Codex `/root/o1_audit`, prerequisite clarification requested by integration coordinator.
- Exact inspected baseline: `786948933fcc24a69d09981dbaa670088b266080` (`7869489`). Planning `2026-10-05-contracts-2`, P2, C03/C05/C14 and protected-current-prose foundation.
- Baseline production matches O1 `143ae2b` except the closed journal acknowledgement fix; note-format/type/UI behavior is unchanged.
- Technical lead owns architecture/contract decisions; coordinator owns eventual entry assignment/proof. This document recommends a decision; neither role's authority is silently reassigned.

## Decision required

Define an explicit ownership boundary for rich Bower-maintained sections, the supported legacy grammar and the policy for ambiguous externally edited files. The current bytes cannot always distinguish Bower-owned prose from supported personal body. Do not infer a universal boundary from blank lines, the next heading, task syntax or the phrase My notes.

## Current representation and counterexample

`src/data/vault/note-format.ts:177–178` writes contiguous Current state bullets, a blank line, then the person's unheaded body verbatim. `src/data/types.ts` exposes `Note.currentState: string[]`; `src/features/note/NoteScreen.tsx` renders this as a read-only list. The parser at `note-format.ts:83–91` ends Current state after the first run of `- ` lines. Task writing at `:185–205` uses that body span.

The following is a valid canonical serialized legacy note when the personal body is a paragraph plus a task:

```markdown
---
summary: Synthetic example
by: bower
---

## Current state
- Summary from Bower.

A personal paragraph.
- [ ] Follow up personally

## Timeline
- 5 Oct · Synthetic history.
```

Exactly the same bytes could be intended as a richer Current state containing the paragraph and protected task. Neither the words nor formatting prove who owns them.

- Protecting until the next heading absorbs the canonical personal paragraph/task.
- Stopping at a blank/non-bullet line permits a task in rich protected prose to be written.
- Protecting until My notes is not globally safe: that heading is not currently reserved and personal prose may legitimately precede it.
- Treating every noncanonical section as read-only does not satisfy the requirement if it disables otherwise supported personal notes/tasks.

The reproduced defect used paragraph-first Current state, a blank line/protected task and an explicit `## My notes` body heading. That example provides a candidate delimiter, but the existing contract does not establish My notes as an ownership marker across all notes. A narrow repair must specify its exact recognized format rather than generalizing silently.

A separate representation issue exists: arbitrary Markdown rich state cannot be round-tripped losslessly through `string[]` plus serializer-generated `- ` prefixes and newline flattening. The fake runner `src/data/fake/fake-runner.ts:215–219` parses and serializes a whole note to append Timeline. Merely stopping task edits is insufficient if another path destroys or reclassifies rich state or personal bytes.

## Recommended decision direction

1. **Preserve the legacy contract.** Existing canonical contiguous state bullets followed by unheaded personal body retain exactly their current ownership, personal task indexing and readable behavior. Notes without frontmatter remain wholly personal. Existing personal headings are not retroactively reserved.
2. **Introduce a versioned explicit boundary for newly supported rich state.** Choose validated markers or equivalent explicit metadata identifying start/end of the owned range and personal body; do not rely on a heuristic first heading. Marker examples, if chosen, are merely illustrative: paired Markdown HTML comments can leave ordinary Markdown readable outside Bower. The lead must choose actual syntax/version and authority; this proposal does not adopt a marker or field.
3. **Use raw ownership spans for safe mutation.** A supported personal-task toggle changes only its checkbox bytes, preserving owned ranges and all unrelated source bytes. Keep display representation separate from source preservation. Define whether an optional rich-state field/raw block is needed, and review every parse→serialize producer before claiming rich-state support.
4. **Serialize compatibility work before production writers.** Commit old/new valid fixtures, malformed/unknown-version fixtures and reader behavior before new producers. The current old parser does not understand rich marker sections; adding markers alone is not a safe additive rollout. Specify minimum compatible reader, negotiation/migration window and rollback behavior. Do not mass rewrite existing personal bodies to manufacture an apparent boundary.
5. **Resolve legacy ambiguous external edits explicitly.** Declare the supported legacy grammar and how a person can establish an explicit boundary without losing data, changing ownership silently or forfeiting supported editing. A bounded recovery/confirmation flow may be needed for truly ambiguous externally edited rich notes; separately specify it before implementation. Canonical personal notes must continue working. A restriction/recovery route for ambiguous inputs is not equivalent to completing rich-state acceptance.

The smallest bounded fix for the reproduced example would recognize a specifically adopted explicit body boundary, shield the preceding rich Current state from personal task counting/writing, and retain its raw bytes. It must not apply protect-until-next-heading to canonical unheaded personal bodies. Since My notes is currently ordinary personal Markdown and rich-state serialization is unresolved, that conditional grammar still requires a lead decision and compatibility fixtures.

## Proposed compatibility and safety evidence

Existing test names to preserve:

- `src/data/vault/note-format.test.ts`: `round-trips every demo note`; `a note with no frontmatter is all body`; `toggleTaskInText flips only the n-th body task and returns its label`; `toggleTaskInText ignores tasks in Current state and Timeline`; `ticks a task in a numbered list, as the screen counts it`.
- `src/data/contract/vault-contract.ts`: `toggleTask flips the n-th body task only`; `toggleTask never touches Current state or Timeline`.

Additional tests must be designed/assigned, not counted as existing green evidence:

| Fixture/scenario | Required result |
| --- | --- |
| Canonical legacy bullets followed by unheaded personal paragraph/tasks | Personal text remains body; task counts match screen; ordinary toggles work; protected bytes unchanged. |
| Legacy personal body with My notes later, arbitrary headings, nested lists and numbered tasks | No personal content is silently absorbed into protected ownership; task indexes stable. |
| No-frontmatter plain personal note containing ownership-looking headings/text | Existing wholly personal behavior preserved unless an explicit separately authorized conversion occurs. |
| Rich protected paragraph, blank lines and protected tasks followed by explicit supported body boundary | Protected content never appears in editable task count; actual personal tasks remain actionable. |
| Owned state immediately followed by Timeline/Bower's note, with no personal body | No protected task accidentally becomes writable. |
| Marker/heading-like text inside fenced code or examples | No false boundary, invented editable span or ownership reassignment. |
| Missing/reversed/duplicate boundaries and unsupported versions | Preserve source; show accurate recovery; no silent guessed write or producer overwrite. |
| Parse→serialize/Timeline append against rich and legacy fixtures | All supported personal/protected bytes preserved according to the specified mutation contract; no flattening, added bullets or lost paragraphs. |
| Old/new reader/producer compatibility and rollback | Accepted old app behavior retained or explicit tested migration prevents misreading durable data; version refusal is visible, not silent data loss. |
| Two-client task toggle with changed modifiedTime | Existing conflict behavior preserved; no stale protected/body write. |

## Handoff

Lead should return the chosen exact legacy/new grammar, version/compatibility policy, rich-state display/source-preservation representation and ambiguous-input recovery rule. Coordinator can then issue one bounded entry with real named assertions and reserved parser/type/UI/runner paths as needed. No schema/type/UI expansion is authorized merely by this proposal.

The coordinator separately reports stale clear-context reproduction on the unchanged baseline: remote context was removed from the pile but retained in Bin. It is a distinct concurrency defect, being registered separately; it does not determine this note ownership decision. The pile name/place entry closed at `afb4b36` after its independent review and proof. These later coordination facts do not change the inspected `7869489` parser baseline.
