# Packet: C16 re-walk on the second re-freeze (TL-P3-28)

Starting model: `bower-evaluator` (Sonnet). Only the rows that failed or were partial on `b7d25f6` are walked again, on `aeb99a4` (code `426a9fd`) ([TL-P3-28](2026-10-07-tl-p3-28-c16-findings.md)). The rules of `2026-10-07-p3-c16-walk-packet.md` still hold (where, presses, never), except that you don't clear site data, and you walk desktop only unless a row says phone. Inputs: `/private/tmp/p3-c16/inputs.md`; earlier notes: `/private/tmp/p3-c16/notes.md`.

- **Record first:**
  - the bundle name, which must not be `index-BaeBKEwe.js` (the coordinator closed the old tab so the new service worker took over);
  - the `/health` version, which must be `aeb99a4`;
  - the time (UTC).
- **Rows:**
  1. **C02, uploads (desktop and phone).**
     - Add a pile with one small file, then reload during the upload. Expected: an honest report ("choose the file again" or "not arrived yet"), never a duplicate in Drive. Automatic resume is a recorded P3 limitation, not a fail.
     - Add a second pile normally. Expected: it saves, and a save never sits on "Saving…" without an outcome.
     - The orphan piles still counted in "Tidy up N things" are P4. Note their count only.
  2. **C04, a full run ends cleanly.** One full tidy-up (one press) with one new pile. Use a made-up file from `/private/tmp/p3-c16/files/` that has not been filed yet, or a words-only pile. Expected:
     - the run reaches `done` within a few minutes and the pile is filed once;
     - `last-run.json` matches.
     - Ask the coordinator for the Actions job's conclusion; it must be success for a run that ended `done`.
     - A network reset can't be forced on staging, so the retry is covered by tests. Cite them, don't repeat them.
  3. **C11, the rule.**
     - Before the press, record `Rules.md`'s first lines and app properties (by page script, reading only).
     - The dentist rule kept earlier is still pending. After the press in row 2 (or one instructions press, if the full run does not word rules), expect:
       - `Rules.md` carries `by: bower` and holds the worded rule "Letters, reminders and invoices from the dentist go to Areas / Health; add the appointment date to Health.";
       - `/bower` shows it worded, with `You wrote: "anything from the dentist goes in health"`;
       - `last-run.json` has `rulesWorded`.
  4. **Keyboard (desktop, and phone where it applies).**
     - After any finished run, the first press of "Tidy up N things" opens the confirm sheet, never the previous run's result.
     - Closing the palette with Escape returns focus to what opened it.
     - Answering a Home question by keyboard leaves focus on an element, never `body`. Add a words-only pile whose line contains "saltmere" in row 2's press so a question exists.
     - When the Undo toast closes (Bin one note inside the probe folder, then Undo), focus never ends on `body`.
- **Never:** clear site data, sign in or out, press a run button or "Use here" yourself, cancel or re-run Actions, write outside A's Bower folder and the probe folder, delete anything, or use "Delete my account".
- **Reply:** the evaluation card in `docs/harness/WORKER.md`, every line under 120 characters (TL-P3-29). Its cells are rows 1–4 × {phone, desktop}. Append notes to `/private/tmp/p3-c16/notes.md` under "Re-walk".
