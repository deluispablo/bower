# Questions for the lead (coordinator → Planificador)

Used when a message to the lead fails or sends are paused. One line per question: `- <date> <id> | <question> | <what runs meanwhile>`. The lead answers through DECISIONS on main.


## 2026-10-09 c3-planner-split line ordinal (sent by message too)

Addendum 4 ordinal: the New mark cannot find an op's lines (no per-line op in the note, no file metadata on Note). Options: 1 op tail per appended line; 2 mark only while the note is as the op left it (stamp + md5, last k lines); 3 count from the Timeline start; 4 keep from-the-end as a known minor. Worker notes in /private/tmp/bower-c3-plan3/docs/harness/2026-10-09-c3-planner-split-notes.md.

## 2026-10-09 c3-state-mark round 4 (two rulings needed; worker notes at branch c3-state-mark 38a9c08b, "Round 4")

- 2026-10-09 c3-state-mark-a16 | Addendum 16: after round 4, a non-clash refusal starts no run of its own (0 runs, so it is bounded), and the answer waits in .bower/changes for the next press, with no row. The class test with the "Not written" row at the cap, and the permanent kind's row at once, need a channel. The refusal is known only to the runner at run time; answered rows are made only at plan time; the Worker's tries are lost at takeWaiting and never reach the runner. Options from the worker: (a) a field in the admission manifest that carries the tries; (b) the runner reads earlier runs' outcomes. Which one, or is "0 automatic runs, no row until the next press" acceptable for now? | Addendum 17 is done (the Home card shows "Bower's update"). Nothing is dispatched; the coordinator restart waits for this entry to close.
- 2026-10-09 c3-state-mark-a18 | Addendum 18: no home refuses a news line with no source today. note-edit.ts entryOk allows source === null, and the zod schema has cites optional. Also, the cites on WRITE_IT_STATES must be an inbox thing's file id, which the fake seed makes at run time, so a static fixture can't name it without matching by name. Which home gets the refusal (note-edit entryOk, or the reply schema)? How does the fixture name its thing: by a seed-time id the scenario reads, or another way? | Same as above.

## 2026-10-10 d-v2-07 merged (86b4fe3e), P4-58h PASS; one question

- 2026-10-10 d-v2-07-rate-timeout | P4-58h minor: the round-6 red (273b58af, a red-owning Codex session) set a 30 s timeout on the random-event rate properties (engine.test.ts:397); the arrival property keeps 5 s. No ruling covers the 30 s. Keep it, or split the runs into batches under the 5 s gate as undo-compensate did (TL-P4-17 addendum 9)?
