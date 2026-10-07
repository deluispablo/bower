# Technical-lead decision TL-P3-2026-10-07-23: recovery without the browser, ordered status, and the instance replacement

**Coordinator question, 2026-10-07:** the scope of the last two P3-D entries.

## `spine-recovery-without-browser` (`bower-escalated`)

A redispatched attempt finishes the run as if it had never been interrupted (ARCHITECTURE invariants 2, 3 and 6; C12):
- **Resume from the checkpoint chain.** Operations already applied are skipped. An operation that was in flight when the attempt died is reconciled by reading it back, as `lost-reply-reconcile` does: landed, not landed, or unreadable. It is never blindly redone. Journal lines are archived once, and dispositions stay consistent.
- **The old attempt cannot write after a takeover.** Its next attempt check or report is refused (TL-P3-18). A test wakes the old attempt after the takeover and shows it changes nothing.
- **Tests: a fault at every step.** For each checkpoint kind, kill the attempt right after it, then resume as attempt 2. The final Drive state and report must equal those of an uninterrupted run of the same plan, on the fake and on the real adapter's contract test.
- **No app call is needed.** The Worker's alarm, the redispatch and the runner alone complete the run.

**Live evidence** on staging, once `GITHUB_TOKEN` is set, is an evaluator journey rather than part of this entry. Start a real tidy-up as A, cancel its first Actions run with `gh run cancel`, close the pane, then confirm the run ends `done` through recovery with the expected changes. It belongs to `behavior-suites-real-adapters` and the C16 walk.

## `spine-ordered-status` (`bower-implementer`)

- **The person-visible phase never moves backward,** even across attempts. A new attempt's `seq` starts again, but a report that would move the run's phase earlier (attempt 2 posting `writing` after attempt 1 reported `saving`) is recorded without changing the phase. The revision rises only when the visible run changes. This takes in the polish item.
- **Contract tests on the Worker and the fake** cover out-of-order and duplicate reports, within and across attempts. The app's revision rule (TL-P3-15) already drops older answers.

## The instance replacement

Inputs: the bundle from `pnpm -C runner build`, and `runner/workflows/tidy.yml` (`contents: read`, no secret). The lead runs `scripts/new-instance.sh deluispablo/bower-home <staging origin>` from a clean checkout of the closing SHA. Before pushing, the lead checks the bundle for personal data and secrets, as the `dist/` scan does. The workflow's actions are pinned by version tag. Pinning them by commit SHA, as the original did ([GitHub, security hardening: pin actions to a full-length commit SHA](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions)), goes into `security-review`.
