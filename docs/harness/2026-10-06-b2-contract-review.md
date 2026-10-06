# Independent review b2-contract-review-1: note-edit contract proposal B.2 (TL-P2-20)

Reviewer: fresh Claude session `b2-contract-review-1` (author: technical lead). Read from `main:docs/harness/2026-10-06-tl-p2-20-note-edit-contract.md` against contract B, run-manifest/run-checkpoint, ownership-format, note-format, rules-format/rules, links/resolve, fake-runner/service/records, TL-P2-03/06/10/16/17, old `history.ts:42-64` and `run.sh` `sheet_relink`. **Verdict: NOT READY FOR RATIFICATION — 2 Critical, 12 Important, 8 Minor.** Direction sound (one `edit-text` effect, closed `change` union, fail-closed v2, content-hash + stillAsSeen under R1, no real-Drive atomicity claim); findings are about exactness.

## Critical
- C1 link-rewrite breaks adopted ownership/2: must call `parseOwnership`; refuse invalid; on v2 list exactly which payload spans are rewritable (and frontmatter yes/no); state legacy/plain frontmatter scope (`key: [[X]]` properties are links).
- C2 journal archive not tied to derived edits: rule/rename/move record archive `move` must `dependsOn` every derived edit; `b-path-journal` must keep runs with rule or rename/move records on legacy until B.2 consumers land.

## Important
- I1 enforce `applyChange` as sole author: adapter recomputes on fresh bytes and requires equality with `text`.
- I2 add `path` to `edit-text` bound to captured places; refuse `.bower/`, Inbox, captured members/childFileIds/move/bin befores, folders, non-`.md`; Rules.md at root only.
- I3 at most one `edit-text` per fileId (or ordered `Change[]`); no edit on a file moved/binned in the same run; explicit dependsOn edges.
- I4 merge order: timeline-append first, move dependsOn it; extend grounding so `filed.note` may be an applied timeline-append path.
- I5 read-back equal to before stays `possible-effect` (resend only under trusted no-effect proof); refuse `content == beforeContent`.
- I6 timeline-append determinism: line endings, legacy section end per legacy grammar, placement/separators, oneLine and control-char constraints, date format and timezone, skip-if-present removed at plan time.
- I7 creating a Timeline section in the person's own frontmatter notes needs an explicit decision (limit to Bower's notes or accept).
- I8 link-rewrite matching precisely defined (paths, token grammar incl. embeds/^block/alias+heading, forms and case consistent with resolver, single-pass simultaneous replacement, `taken` exclusion, code exclusion rules, Markdown links never touched).
- I9 rules-wording: drop `ruleKey` typing as Id; dedupe with `ruleLike`; add recordId; insertion order; removal of the You wrote line; missing section; frontmatter summary policy.
- I10 grounding gaps: rulesWorded via both paths; where deduped/remove records count; `bowerNew` mark on updated notes.
- I11 raw bytes: fake-only `fake-stored` until the raw-byte adapter; utf8 only; BOM and invalid UTF-8 rules.
- I12 v2 canonical encoding: refuse v2 without edit-text; enumerate per-change guards; v1 identities unchanged.

## Minor
M1 soften "never overwritten" (R1 window); M2 modifiedTime from the same read; M3 lookalike outcome equivalence documented with id/name/parents/trashed; M4 manifest size; M5 saved-link original placement and filed row; M6 marks for created Rules.md; M7 rejected rewrite visibility; M8 older builds refuse v2 visibly; amend TL-P2-06 effect list.

Required fixtures (v1/v2 compatibility, v2 and legacy timeline-append, link-rewrite, rules-wording, recovery, dependencies) are listed in the reviewer's full report (session output).

## Delta review of revision 2 (main `f4d3052`)

**Verdict: NOT READY FOR RATIFICATION — 0 Critical, 4 Important, 9 Minor.** C1, C2 (for edits), I1–I3, I5, I7–I12 and M1–M8 resolved; I8 and I9 checked against `linkTarget`/`formerNames`/`resolverFor` and `serializeRules`.

- N1 merge/saved-link mixed outcomes and retries: skip-if-present compares the UTC date so a retry on another day appends again; merge append must carry the answer's recordId and the answer's archive dependsOn the item move; define the rejected-move setAside contribution; saved link order and retry (second generated note) undefined.
- N2 missing Rules.md `create-text` path not covered by rule 7 (rule records archived even if the create is rejected) and its `rulesWorded` count ungrounded.
- N3 byte-preservation invariant dropped; the legacy "blank line before the new section" rule can change the person's span on re-parse (`body\n## Bower's note`).
- N4 fixture list misses guard refusals, timeline-append edge cases, link-rewrite edge cases, rules-wording cases and recovery/dependency cases (enumerated by the reviewer).
- Minor m1–m9: resolver subset (no line breaks in tokens, spaces kept), YAML list values, which changes add the bowerNew mark, canonical order of `changes[]`, guard-enforced invariants, rules top-of-list/line endings/absent removals, deterministic 8 MiB deferral, `YYYY-MM-DD` beside "2 Oct" display, "needs a newer Bower" only in builds that know v2.

## Delta review of revision 3 (main `948e7e0`)

**Verdict: NOT READY — 0 Critical, 2 Important, 7 Minor.** N2, N3 (every R3-2 placement traced through the legacy parser), N4 and m1–m9 resolved; N1 (a) and (c) resolved (each outcome combination yields exactly one filed or setAside row).

- P1 merge cannot be re-planned once its question is gone: the answer record holds only questionId and yes/no; the runner removes answered questions from questions.json in the same run, so after a rejected move the next run files the item normally while the note's Timeline claims it joined. Keep the question until its answer is archived, or make the questions.json write dependsOn the derived operations.
- P2 reused saved-link note: no create-text that run, so `filed.note` is ungrounded; add a grounding rule for a note in `capture.places` with the stable bowerItem, re-checked at dispatch.
- Minor: m-a exact eol rule and empty-section placement fixture; m-b guard that existing Timeline lines are unchanged (insertions only, ordered re-parse); m-c define member operations excluding the target's bowerNew move, and the setAside wording when the person already moved the item; m-d identical-line repeat on a later day is dropped (accept or limit to retries); m-e guard-checked archive dependsOn, `path: Path`, `since > 0`; m-f exact digest input and reuse fixture; m-g fixture for a re-parse invariant refusal.

## Delta review of revision 4 (main `9c58a5b`)

**Verdict: READY FOR RATIFICATION — 0 Critical, 0 Important, 6 Minor.** P1 resolved (R4-1: questions.json removal write dependsOn every operation derived from the answer; re-planned merge converges; `DriveVault.questions()` already hides a question with a pending answer). P2 resolved (R4-2 grounding via capture.places + stable key + re-check; one row per outcome). m-a…m-g resolved.

Minor to fold in at ratification or in the unit: (1) R4-1 wording — the app hides a question with a pending answer (`drive-vault.ts:899-903`), it does not show the answer; test asserts hidden; (2) every answer's archive dependsOn the questions.json write that removes its question (one rejected answer rejects the shared write); (3) "new questions are not lost" holds only for questions the next run can derive again; (4) state the v2 line-ending rule (neighbour line vs m-a); (5) path check reuses B's full rule (no backslash or controls, as `run-manifest.ts` `path()`); (6) R4-2: validator recomputes the stable key from the move's `before.fileId`, the note's folder must be a captured place, and in the fake the re-check runs inside the same serialized boundary step as the move.
