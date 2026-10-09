# Packet: P4-43 review (stage 3: c3-subject)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-subj`.

- **Diff:** `git diff e48bd296..d12e3c5f -- src runner api` (red `856cde1e`, fix `dc49bbd3`, notes `d12e3c5f`; not merged). Worker notes: `docs/harness/2026-10-09-c3-subject-notes.md`.
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-subject-packet.md`;
  - the TL-P4-14 stage 3 row;
  - carry-overs P4-17 and P4-15b;
  - TL-P4-13 (every Bin passes what it read; match by id or subject, never by name or prefix);
  - TL-P4-17 (the real entry point).
- **The fixed question:** second way? Your card must say "second way? no" or name it. Count the copies of subject, key and open-questions logic left after the change.
- **Look hardest at:**
  - the questions write now waits on the saved copy's Bin: is a refused Bin the only thing that keeps a question open, and does an accepted Bin still close it in the same run;
  - an answer settles by `q.subject`, with no id prefix left;
  - old `questions.json` (p2 `q1` and older `q-ask-<id>`) still reads and stays open;
  - report rows keep their fields and order;
  - the reader (`DriveVault.questions()`) and the planner agree on what is open for the same inputs;
  - the goldens are unchanged;
  - the new rule test "one key and one open-questions function…" fails on behaviour or structure, not on a spelling only.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-43-review-notes.md`.
