# Packet: first real run on Actions (staging journey, P3-13)

Starting model: `bower-evaluator` (Sonnet). Reason: the first tidy-up that runs end to end on GitHub Actions with the scripted provider, judged as a person sees it (P3_ACCEPTANCE C12; [TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) and [TL-P3-23](2026-10-07-tl-p3-23-recovery-and-ordered-status.md); the lead's go once `GITHUB_TOKEN` is set).

- **Where:**
  - Use the staging origin from your prompt, with the real source, in the **built-in browser pane** only, as test account A, who is already signed in. Open every tab with `?source=real`.
  - Don't clear site data, sign in or sign out. On a 401 from `/me`, stop. Never act on Google's pages. **Never use "Delete my account".**
- **Folder:** A's Bower folder is the probe folder whose id is in your prompt.
  - If the app shows a different folder, stop and report it.
  - Write only inside that folder.
- **Record first:** the bundle name, the `/health` version and the time (UTC).
- **Journey.** For each step, give expected vs actual, with the times and the network answers.
  1. **One synthetic pile.** In the app, add one short made-up thing to the inbox. Use a plain sentence about Alex's houseplants and no real names. Confirm it shows in the inbox.
  2. **Press "Tidy up"**, with web lookups off. Record the `/process` answer: run id, phase `queued`, revision. One press only.
  3. **Status.** Watch the app until the run ends, up to 30 minutes. Record each phase it shows (`queued` → `reading` → `writing` → `saving` → `done`) with its time and the `/status` revision. The revision must never fall, and the phase must never move back.
  4. **Actions.** Read only, with `gh run list -R deluispablo/bower-home --workflow tidy.yml` and `gh run view <id>` (no cancel, re-run or any other write). Record the run name (`tidy <run_id> 1`), its URL, its conclusion, its duration, and the time from the press to its creation (the dispatch) and from there to `done` in the app. Confirm the log shows no ticket (it is masked).
  5. **Result in the app.** The thing left the inbox and shows where it was filed, and the run's summary shows. Reload once and confirm both stay.
  6. **Result in Drive.** Use page script with `GET /drive/token`, read only, inside the folder. Check that:
     - `.bower/last-run.json` exists, with this run id and `done`;
     - `.bower/runs/<run_id>/` holds the manifest, the checkpoints and `dispositions.json`, with one line for the thing;
     - nothing outside the folder changed.
     Print names, ids as fingerprints, and dates, never note content beyond the made-up sentence.
- **Console:** any error that isn't from an older bundle is a finding.
- **Never:** press "Tidy up" more than once, cancel or re-run an Actions run, write outside the folder, delete anything, or touch any repository but the read-only `gh` calls above.
- **Reply:** the evaluation card in `docs/harness/WORKER.md`. The cells are steps 1–6. Notes go to `/private/tmp/p3-13-first-run/notes.md`.
