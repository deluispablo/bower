# Packet: c3-planner-split (stage 3)

- **Entry:** `c3-planner-split`.
  - Ruling: the TL-P4-14 stage 3 row.
  - Carry-overs ([file](2026-10-09-stage3-carryover.md)): report rows by op id, and `report-misses-hub-line` (TL-P4-17 addendum 2; [diagnosis](defects/2026-10-09-report-misses-hub-line.md)).
  - Worktree `/private/tmp/bower-c3-plan`, branch `c3-planner-split` from `claude/p3`.
- **Starting model:** `bower-escalated` (planner, report, data).
- **Read first:** the coordinator map [2026-10-09-c3-planner-split-map.md](2026-10-09-c3-planner-split-map.md), with line numbers at b036afc0.
- **Live evidence:** the stage 2 smoke, c05-hub-lines run CbTN5Md_. Flat hunt got 2 Timeline lines and 1 report row.

## Contract

1. **Three steps.** `planScripted` becomes `capture` → `decide` (from the script or the model; one decisions type) → `build` (operations and report). Re-planning by recursion goes, unless a step can only express it that way; say why on the card.
2. **No demo fixture on the live path.** The runner's model path and its module load import nothing from `demo/fixture`. Fixture-driven decisions live only on the scripted or demo side. Delete the `dependency-exceptions.cjs:11` line with the import.
   - Today `wordRule`, `DISAGREEMENTS`, `PLAN_BY_NAME`, `NOT_LOOKED_UP` and `scriptedRequest` run on the model path. Each needs a non-demo home or must leave the path. If one changes what a live run does, stop and report: that is a behaviour change needing a ruling.
3. **Answers reach the model path,** checked against the ask-answer-loop wiring. Add a test through the provider.
4. **One map** from each record to the operations it needs replaces the five filters at :993-1009.
5. **Report rows** come from operation metadata (op id plus entry), one row per Timeline line written. `grounded()` keeps only a structural check: every row names an existing op, and every reportable op has a row.
   - `report.ts:58-61` and the other name and text ties go.
   - The readers of `updated.length` still count what the person sees. Update `world.test.ts:412` to the rule.
6. **Unchanged:** every other behaviour, the goldens (C04 78, 25-runs 88) and the wire shapes (compatibility rows for `src/data/contracts` and `src/features`). The card reports `removed: <lines>` and the prod net per file.

## Red

- "two moves with the same name get their own rows by op id"
- "every Timeline line a run writes has its own report row" (the smoke case: 2 lines on Flat hunt give 2 rows)
- "the live path imports no demo fixture"
- "one map from records to the operations they need"
- "answers reach the model path"

## Verify (exact, from features.json)

- The red tests above.
- "the C04 run makes the golden number of Drive calls per step".
- Real entry point: `bash scripts/e2e-both.sh e2e/capabilities.spec.ts -g "C05: a tidy-up brings a project note up to date"`.

Then `pnpm check` and the full `pnpm e2e:fake` must be green, since fixtures and the planner move.

## Checklist

- Match by id, never by name or text.
- Every Bin, move or write passes what it read.
- Commits: red, then fix (several fix commits are fine), then notes in their own commit.
- Research first: cite the functional core / imperative shell pattern, or an equivalent planner/executor split.
- If the change grows past about 600 changed production lines, stop at a green step and report, so it can be reviewed in parts.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
