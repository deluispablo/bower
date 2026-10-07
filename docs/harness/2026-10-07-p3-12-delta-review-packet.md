# Packet: P3-11 re-review and P3-12 delta review (truth fix, scripted provider, real effects, instance set-up)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. P3-11 and P3-12 close together ([TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) addendum). This is the first runner that changes a real folder on GitHub Actions, and the script the lead runs to replace the instance repository. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff b5246fd..<HEAD in your prompt> -- src api runner scripts docs/specs`. Per change:
  - `db9bd5f`: scripted provider, real effects, `tidy.yml`, `new-instance.sh`. Its stubs and red tests are in `e0d7059`.
  - `13e3d84`: the truth fix. Its red tests are in `4d6e9e3`.
- **Contracts:**
  - TL-P3-22 with its addendum, and [TL-P3-13](2026-10-07-tl-p3-13-instance-repository.md).
  - The "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - The packets `2026-10-07-p3-12-scripted-provider-packet.md`, `2026-10-07-p3-12-truth-fix-packet.md` and `2026-10-07-p3-11-delta-review-packet.md`. The last one lists the P3-11 findings this range must close.
- **Re-review (P3-11 findings):**
  - **I1.** `saving` only with an applied outcome, after the chain commit. With none applied, the run ends with `B_FAILURE`. The same rule applies to uncaught errors. Possible-effect counts as changed: the run stays in `saving` and does not end with `B_FAILURE`. Is that true to the person in every case?
  - **I2.** Check the 409 `{ seq, phase }` body, the one resend with `seq + 1`, and the stop when the phase is done or failed. A refused `done` is never swallowed. Also check the done shortcut's read-back and chain commit. A GitHub re-run after an accepted `done` gets 401 from the retired ticket, and the job fails. Is that acceptable, and does it touch the folder before the 401?
  - **I3.** `dispositions.json` covers every manifest item, journal lines included, each with exactly one disposition. It is written before `last-run.json` and read back. A redispatch leaves it as it is.
  - The P3-11 minors: is the bundle now calling `runTidy`?
- **Look hardest at (P3-12):**
  - **Real effects.** Does every send go through the adapter's fenced write, with still-as-seen and the attempt check? Is any write possible outside the admitted set or outside the person's folder? Does a possible-effect get its evidence read before any resend? Does `Effects.apply` checking the saved link's note use the manifest's view?
  - **Scripted provider.** Is it really extracted, not copied? Is it deterministic? Does the fake keep its behaviour? The runner reads piles from the folder listing instead of the Inbox reader, so the "set aside, not tidied" flag is unseen. Can that tidy something the person set aside?
  - **tidy.yml.** Check the payload fields against the dispatch the Worker sends, and the run name against recovery's lookup. Check what `permissions: contents: read` and the sparse checkout give the job. Is the ticket read only from `GITHUB_EVENT_PATH` and masked before any output? Can a `client_payload` field inject into a shell (`${{ }}` inside `run:`)?
  - **new-instance.sh.**
    - It must never read, print or set a secret, and must leave nothing secret in the copied tree.
    - It removes `.github/workflows` and `agent/` in one commit. Can it ever touch a repository other than the one named? Can it push when nothing changed?
    - It must run under bash 3.2 with `set -euo pipefail` and clean up its temp directory.
    - Does its test truly stub `gh` and never reach the network?
- **Run:** single test files only (`pnpm exec vitest run <file>`, `pnpm -C api exec vitest run <file>` or `pnpm -C runner exec vitest run <file>`), one at a time. Never run `new-instance.sh` against a real repository and never run `gh`. Reproductions go under `/private/tmp/p3-12-review/` in your own worktree; remove it afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
