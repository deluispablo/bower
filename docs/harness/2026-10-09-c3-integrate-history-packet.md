# Packet: c3-integrate-history (stage 3)

- **Entry:** `c3-integrate-history` (harness). Ruling: TL-P4-17 addendum 8 (DECISIONS). Worktree `/private/tmp/bower-c3-hist`, branch `c3-integrate-history` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:** DEFECT_LOG `integrate-misses-branch-commits`.
  - `integrate.sh c3-test-time` passed its `pnpm check` on the uncommitted merge.
  - `done.sh` then failed `src/docs.test.ts` "every change since the P2 freeze is listed" for 62bb8258, which had no compatibility row.
  - `src/docs.test.ts:128` reads `git log 00ec9a5..HEAD`, and HEAD does not move during a `--no-commit` merge.

## Contract

- **One helper** in `scripts/harness-git.mjs` returns the tips to judge: HEAD, plus MERGE_HEAD while a merge is uncommitted (`git rev-parse -q --verify MERGE_HEAD`). Cite the git-merge docs on MERGE_HEAD.
- **Every reader uses it.** `src/docs.test.ts:128` and every other history reader under `src/*.test.ts` and `scripts/*.mjs` that walks `..HEAD` use the helper (`git log <base> <tips…>`, or `^base`). List each reader you changed on the card. A reader that must stay on HEAD alone gets a one-line reason.
- **`harness/integrate.sh` is unchanged:** no commit-then-reset.

## Red

A fixture repo, made by the test in a temp dir and never the real repos:
- a base commit with a compatibility list;
- a branch commit under `src/features` with no row;
- `git merge --no-ff --no-commit branch`.

The check must report that commit. It passes wrongly today.

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness-git.test.ts src/docs.test.ts -t` with:
- "a branch commit with no compatibility row fails the check under a no-commit merge"
- "every history reader takes its tips from the one helper"

Then `pnpm check` must be green.

## Checklist

- Tests use fixtures only, and none runs over 1000 ms alone.
- Every printed message is backed by a test.
- The card names the exact tests, the readers changed and `removed: <lines>`.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
