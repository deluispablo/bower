# Packet: C16 walk on the frozen build (P3-G)

Starting model: `bower-evaluator` (Sonnet). Reason: P3_ACCEPTANCE C16 asks for the C01–C12 and C14 journeys against staging, on phone and desktop, by keyboard, with no unexplained console errors, on a fresh origin with the bundle checked ([TL-P3-26](2026-10-07-tl-p3-26-security-review-and-freeze.md) point 3). The walk runs last, on the frozen SHA as deployed.

- **Where:**
  - Use the staging origin given in your prompt, in the built-in pane only. Use a **fresh origin state**: the coordinator clears the site data before you start, and the owner signs in as test account A by hand.
  - Open every tab with `?source=real`.
  - Phone: `resize_window` preset `mobile` (reload after switching). Desktop: preset `desktop`.
  - Never sign in or out yourself, and never act on Google's pages. **Never use "Delete my account".**
- **Presses.** Each "Tidy up", "Try again" or confirm press is done by the coordinator or the owner at your request; the permission system refuses an evaluator's press. When a journey needs one, stop at that point, write `PRESS: <which button> for <journey>` in your notes, and reply. You are resumed after the press. Never press one yourself.
- **Record first:** the bundle name, the `/health` version (must be the frozen SHA), the response headers of `/` (CSP, HSTS, nosniff) and of `/landing/` (its own CSP), and the time (UTC).
- **Journeys.** For each one, on phone and on desktop, by keyboard where the step is an interaction, record expected vs actual, with times, network answers and console errors.
  1. **C01, sign-in and folder.** `/me` has A's name; the folder opens; a reload keeps it.
     - The owner's revocation step comes **last**, after C14. The owner removes Bower's access at Google, then uses the app. Expected: the app answers signed out, with no error page.
  2. **C02, uploads.** Add a pile with one small file. Reload during the upload: it resumes or reports honestly, and Drive holds one file.
  3. **C03, browse and edit.** Browse, search, rename, move, put something in the Bin and restore it, all inside the probe folder only. Outside changes show on focus.
  4. **C04–C11, scripted journeys** with the scripted provider on real Actions.
     - Use the made-up inbox inputs listed in your prompt (the coordinator prepares them), one run each, with a press per run.
     - For each run, check the app's result against the expected outcome in your prompt, and check that `last-run.json`, the run's `dispositions.json` and the filed notes in Drive match it.
  5. **C12, the runner.** Covered by the runs above: ordered phases with `reading` and `total`, revisions that only rise, and the run name `tidy <run_id> <attempt>`. Cite the earlier cancel-and-recover evidence; don't repeat it.
  6. **C14, session lease.** Repeat C14 steps 1–5 from `2026-10-07-p3-10-session-lease-real-packet.md`, on desktop only.
  7. **Keyboard.** Every journey's interactions can be reached and used by keyboard. Focus stays visible, and no focus is lost after a sheet closes.
- **Console:** any error or CSP violation not explained by an older bundle is a finding.
- **Never:**
  - write outside A's Bower folder and the probe folder;
  - press a run button yourself;
  - cancel or re-run Actions;
  - delete anything.
- **Reply:** the evaluation card in `docs/harness/WORKER.md`. Its cells are the journeys × {phone, desktop}. Notes go to `/private/tmp/p3-c16/notes.md`.
