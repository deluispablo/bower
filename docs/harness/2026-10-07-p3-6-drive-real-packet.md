# Packet: drive-real-behavior-suite (P3-B, owner session)

Starting model: `bower-evaluator` (Sonnet). Reason: a guided probe of real Drive behaviour through the staging app ([TL-P3-10](2026-10-07-tl-p3-10-r2-result.md); acceptance C03 in `docs/P3_ACCEPTANCE.md`).

- **Target:** the staging origin (given in your prompt only), real source, in the **built-in browser pane** only. Test account A is already signed in there. Do not clear site data and never sign in or out. If `/me` answers 401, stop and report. Record the served bundle name first.
- **Data:** synthetic only, inside A's Bower folder, in one new folder named `Probe 2026-10-07` (and its notes `Probe alpha`, `Probe beta`, …). Never touch other files, `index.md`, `hot.md`, `log.md` or Bower's sections. Never hard-delete: anything removed goes to the Bin. Redact ids as `FOLDER_A` and `NOTE_1`, … or 4-character fingerprints.
- **How:** use the app as a person would for each journey. Page script with `GET /drive/token` acts as "someone else on another device" (Drive v3 REST: `files.create`, `files.update`, `files.list`, `files.get`) to make the outside change each check needs.
- **Checks (each: expected vs actual):**
  1. **Browse:** the probe folder and its notes show in the app after a refresh.
  2. **Pagination (Drive's side):** with 5 probe notes, `files.list` by script with `pageSize=2` follows `nextPageToken` to all 5, each once. The app shows all 5.
  3. **Search:** a note whose text holds a made-up word (`zorbleflux`) is found by the app's search. Record the delay if Drive's index lags; give up after 3 minutes.
  4. **Changed version:** open a note in the app and start an edit. Change the same note by script. Then save in the app. Expected: the app says it changed elsewhere and loses neither text. Record Drive's `modifiedTime` and `version` before and after.
  5. **Name conflict:** in the app, rename a note to the name of another probe note. Then rename one that the script renamed meanwhile. Expected: an honest message, no silent duplicate or overwrite.
  6. **Parent conflict:** move a note in the app after the script moved it to another probe subfolder. Expected: the app notices it is not where it read it (`stillAsSeen`) and does not move it blindly.
  7. **Lost reply:** by page script, wrap `fetch` so the reply to the app's next Drive write (an edit, then a move) is dropped after the request is sent (throw `TypeError`). Then remove the wrap and reload. Expected: Drive holds the change once, with no duplicate file, and the app is truthful about it.
  8. **Bin and restore:** Bin a probe note in the app. Drive shows `trashed: true` (not deleted). Restore it: `trashed: false`, same parent.
- **Console:** `GET /status` 404 errors are known (TL-P3-10, route not built yet); any other console error is a finding.
- **Never:** delete for good, write outside the probe folder, read or act on Google's pages.
- **Return under 25 lines:** bundle, a table of checks with pass, FAIL or NOT RUN, findings (each with step, expected vs actual, redacted), and the screenshots taken (under `/private/tmp/p3-drive/`, staging origin only).

## Rerun of check 4 only ([TL-P3-11](2026-10-07-tl-p3-11-drive-suite-findings.md) F1)

C03's "edit" is the note screen's task checkbox. As A, in the probe folder:
1. By script, create a synthetic note `Probe tasks` whose text has one task line (`- [ ] Water the probe plant`). Open it in the app.
2. By script, change the note's text through the Drive API, adding a line `Changed elsewhere`.
3. Toggle the task in the app. Expected: "changed somewhere else" (or the app's equivalent), no overwrite. Drive's text still has the outside line, with the task unticked. After a reload, the app shows the outside change. Record `modifiedTime` and `version` before and after (redacted fingerprints are fine).

**Never read or list outside the probe folder or A's Bower folder** (TL-P3-11): every `files.list` names the probe folder as parent.

## Rerun of check 7 only, after `lost-reply-reconcile` (staging at `7bd77ce`)

The same recipe as check 7 above, on the new bundle (check its name first). Use one probe note for a rename and another for a move, and drop each write's reply after the request is sent. Expected:
- the app treats each as saved (no error, the new name or place shows without a reload);
- Drive holds each change once;
- after the fetch wrap is removed and the app reloaded, it agrees with Drive.

Also confirm that no "Bower couldn't find that." banner shows on any screen visited, and that no `/status` 404 appears in the console.
