# Packet: pile-binned-context-hold (app and runner agree on a binned pile note)

- **Entry:** `pile-binned-context-hold`. Worktree `/private/tmp/bower-pile-binned-context-hold`, branch `pile-binned-context-hold`. Non-escalated, `ui: false`: Codex red, then Codex implementation, then a fresh Claude review.
- **Defect and ruling:** DEFECT_LOG pile-binned-context-hold (Important); TL-P4-53 addendum 7 (DECISIONS). Addendum 6 (one Bin lookup for a missing context) is the app's current rule.
- **Owned files:** `src/data/pile-readiness.ts`, `src/data/spine/plan.ts`, `src/data/vault/drive-vault.ts` and their tests (`pile-readiness.test.ts`, `spine/plan.test.ts`, `vault/drive-vault.test.ts`). It starts after upload-sign-out-forget lands, because that entry also changes drive-vault.ts.

## Contract

1. One "binned counts as removed" predicate in `pile-readiness.ts`: a pile's note counts as removed when your changes hold its `trash` line (today's `contextRemoved`), or when the one Bin lookup finds it binned (addendum 6). The app's readiness (`drive-vault.ts` :756, :966, :1031) and the runner's hold (`plan.ts` :236) both call it. No second rule, and no runner-only patch.
2. Red: bin a pile's note through Drive (no journal line), with ready things left. The app and the runner give the same answer: the run files the things, or the app shows its reason. The pile is never held with no reason shown.
3. Controls kept:
   - a context that is only missing (its write never landed, not binned) stays not-arrived on both sides, as in E3's four fixtures;
   - a journal `trash` still counts;
   - the Drive-call goldens never rise. The Bin lookup is the one addendum 6 already pays for, never a second listing.
4. Research first. Reuse the existing BinnedOf lookup.

## Verify

`pnpm exec vitest run src/data/pile-readiness.test.ts src/data/spine/plan.test.ts src/data/vault/drive-vault.test.ts -t "pile-binned-context-hold"`, then `pnpm check` and the fake e2e for the Inbox.

## Commits

Red first, then the fix, then notes (`docs/harness/2026-10-11-pile-binned-context-hold-notes.md`, line 3 `implementer: codex`, one `tests changed:` line per file).
