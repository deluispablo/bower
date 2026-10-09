# Packet: P4-46 review (stage 3: c3-pair-ask)

Read-only and fresh. Unit, runner and contract tests only; never start a server, run e2e or call the claude CLI. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-pair`.

- **Diff:** `git diff c904970e..8d1d4632 -- src runner api scripts` (red `bcfdaacf`; fix `88f44107`, `9326faad`; compatibility `787353e3`; notes `8d1d4632`). Not merged. Worker notes: `docs/harness/2026-10-09-c3-pair-ask-notes.md`.
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-pair-ask-packet.md`, including its ruling sweep;
  - TL-P4-16 addendum (keep-one-not-asked, option b);
  - TL-P4-14 addendum 3, carry-over row 3 (P4-19b);
  - TL-P4-13 (every Bin and merge passes what it read; match by id).
- **The fixed question:** second way? Your card must say "second way? no" or name it. Check merges, question subjects and readers of question kinds.
- **Look hardest at:**
  - The worker typed the pair through the question id (`q-pair-<a>.<b>`, no new field). Is that a typed two-note subject, or a parse of a string prefix, which the ruling and TL-P4-13 forbid as "by name or substring"? Say which, with lines.
  - Old text-form keep-one questions still read and settle (tolerant reader).
  - A yes merges only through keep-one-note-merge.
  - `KEEP_MOVED`/`KEEP_BINNED`: honest sentences, each backed by a test.
  - Words-only cites stay under the value gate.
  - The model-input goldens were rebuilt. Confirm only prompt lines changed, and that the change is the ruled pair ask.
  - Drive-call goldens hold: C04 78, 25-runs 88.
  - Compatibility rows exist.
- **Left out by the worker:** a pair binned before the answer run (the yes waits); a "no" can be asked again; a refused words-line edit is not reported. Rate each.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-46-review-notes.md`.
