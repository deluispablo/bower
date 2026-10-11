# B4b adversarial pass 2 (Sol high, attempt 12)

card:
Prior findings: **#1 partially closed**; **#2–#6 closed under addendum 13**. Four blockers remain:

- **Blocking: data safety — `src/data/spine/scripted.ts:2735`.**  
  Submit “Remember my remote preference and file the offer in Resources” with an attachment. Let filing and the ledger succeed, then reject the About me edit. The pile is binned, its words are reported filed, and the run ends `done` without the visible preference or a not-done row.

- **Blocking: hard rule — `src/data/spine/scripted.ts:2325`.**  
  Pile `p-1` says only “File the attached offer in Resources”; its document says “Alex prefers office roles.” Return that preference with `source:{pileId:"p-1"}`. It persists as words-origin personal authority. The same claim with the document’s file ID is refused. Personal About me text can be copied into observations through this same bypass.

- **Blocking: hard rule — `src/data/contracts/observations.ts:148`.**  
  A document contains “Alex has a sensitive health condition.” Return its file ID, `subject:"Alex"`, `category:"biography"`, and `section:"about-you"`. The model’s category label admits the sensitive fact into the ledger and About me.

- **Blocking: normal use — `src/data/spine/scripted.ts:2266`.**  
  With one remote-preference fact, submit “Forget my remote preference.” Let its tombstone succeed and reject the visible edit. Retrying the original fact ID refuses and leaves the text visible. An empty reply repairs the view but leaves the request unconsumed; subsequent runs offer no question and settle nothing. This leaves prior finding #1 incomplete.

All four reproduced through production `main`. Stale origins were refused before writes; no second mechanism found.

Skipped: full suites, `pnpm check`, and e2e. No files changed; the four blockers remain.
verdict: BLOCK
