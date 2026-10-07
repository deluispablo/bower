# Packet: cancel and recover without the browser (staging journey, P3-13)

Starting model: `bower-evaluator` (Sonnet), observation only. Reason: recovery without the browser on real Actions, judged end to end. This is the live evidence for [TL-P3-23](2026-10-07-tl-p3-23-recovery-and-ordered-status.md) and C12. The lead asked for it in the same session as the first real run.

- **Who does what:**
  - The coordinator adds one made-up note to A's inbox, presses "Tidy up" once (the owner allowed the press), cancels attempt 1's Actions run with `gh run cancel` once it has started, and then moves the app tab to `about:blank`. From then on, no app page is open on staging.
  - The evaluator observes only. You never press anything in the app and never run a `gh` write.
- **Where:** the staging origin from your prompt. Use the built-in pane only for the final check, and page script only through `fetch` calls with the existing cookie (`/status`, `GET /drive/token`). Never open the app's UI before step 4.
- **Expected path** (`api/src/recovery.ts`):
  1. The cancelled job ends without a report. The run sits at the last phase it reported.
  2. At its stale deadline (17 min from `requestedAt` if still `queued`, else 30 min from `phaseAt`), the person object's alarm looks up `tidy <run_id> 1` and finds no live job. It redispatches once as attempt 2, with a new ticket.
  3. A run `tidy <run_id> 2` appears on Actions, resumes from the checkpoint chain, and the run ends `done`.
- **Journey.** For each step, record expected vs actual with times (UTC).
  1. **Cancel seen.** With read-only `gh run list -R deluispablo/bower-home --workflow tidy.yml` and `gh run view`, record the URL of attempt 1's run, its conclusion `cancelled`, and its start and end times.
  2. **Waiting.** Poll `/status` by `fetch` every 2–5 minutes. The phase never moves back, the revision never falls, and no failure appears before the deadline.
  3. **Redispatch.** Record the URL of attempt 2's run (`tidy <run_id> 2`), its creation time against the deadline, its conclusion and duration.
  4. **Done.** `/status` reaches `done`. Then open the app once with `?source=real`: the note left the inbox and the summary shows.
  5. **Drive, read only.** Check:
     - `.bower/last-run.json` holds this run id with `done`;
     - `.bower/runs/<run_id>/` holds the checkpoints of both attempts and `dispositions.json` with one line for the note;
     - no operation was applied twice: no duplicate file or folder, and each changed item holds one revision per change;
     - nothing outside the folder changed.
- **Console:** any error that isn't from an older bundle is a finding.
- **Never:** press anything in the app, cancel or re-run a run, write to Drive, or wait past attempt 2's run plus 30 minutes. If that time passes without `done`, stop and report.
- **Reply:** the evaluation card in `docs/harness/WORKER.md`. The cells are steps 1–5. Notes go to `/private/tmp/p3-13-cancel/notes.md`.
