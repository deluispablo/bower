# Designer state

Updated 2026-10-09.

- Phase: 3 (V2 shown). Review `reviews/2026-10-09-current-state.md` shown to the owner; waiting for their call on each item (fix, later, not a problem) and on questions 1–4.
- Sources read: the claude.ai design system "Bower" (README, tokens), the "Bower app" canvas (screenshots of the demo as built on 2026-10-04, plus "How Bower works"), the landing canvas file list.
- Walked: `main` 38995d97, demo source, 16 routes and scenarios at 320, 375, 768 and 1440, dark and light; axe, focus, target sizes, contrast, three tasks.
- Serving: Vite from this worktree on a spare port for one script run (never the main checkout, which belongs to the coordinator).
- 2026-10-09: the owner asked for the target design of every screen with all fixes, and for Bower's landings fixed (E5). The canvas "Bower App V2" is on claude.ai (link not stored here). It has 31 boards: phone, desktop, tablet, light, "Where Bower lands", "What changed" and the parts.
- My calls inside it, for the owner to confirm: tablet in a centred 600 px column; desktop right panel with no repeated questions; a note icon instead of Bower's head in lists; 44 px phone targets; a new `control-line` colour for 3:1 field edges; answers confirmed in place, with no toast.
- 2026-10-09: the owner chose (b) for question 5: one row per note under "Brought up to date", with its changes joined in report order. The V2 board "Home after a tidy-up" shows it.
- 2026-10-09: the owner asked for the missing screens and my proposed changes, each next to how it looks today, on a new canvas page. It is "Today and V2", with 41 boards. They also asked for Bower to have the personality of a companion, so I added the page "Bower, your companion": a live demo, the behaviour map and four moments. The Bower part now takes a gaze (lookX, lookY). New findings: E6 to E8.
- The owner said the spec is written together with the lead, after their OK.
- 2026-10-09: answered the lead's c3-pair-ask copy consult; it was adopted as TL-P4-19 addendum 9. Under TL-P4-18 addendum 3, the coordinator may consult me, and I check every built UI change; c3-pair-ask is the first.
- 2026-10-09: my design check of c3-pair-ask at claude/p3 bdc08775 returned "not as specified". The "Not merged" sentence went into report.setAside: it was counted as "1 thing set aside" and shown on no screen. The lines-already-in copy is verified. The fix round adopted an `answered` row (TL-P4-19 addendum 10), and I gave its q-ask and q-state copy. I check the fix when the coordinator sends it.
- 2026-10-09: the owner signed in to claude.ai in the browser pane, and the canvas renders, Bower included. The companion demo has not yet been tried with the pointer.
- 2026-10-09: the owner approved V2 and asked for the spec to be written together with the lead, for the build to match the design exactly (I supervise it and give the OK), and for the code to be well engineered (DRY, one home per mechanism). Spec: specs/2026-10-09-v2.md.
- Waits on the lead: the spec review, the impact note and the plan for my fidelity check.
