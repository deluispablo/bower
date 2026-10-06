# P2 supplemental walk at 3e6e7da (TL-P2-47)

`bower-implementer` with the `bower-evaluate` skill (the walk began before `bower-evaluator` loaded; TL-P2-47 amendment), production build on port 5196, packet [2026-10-06-p2-supplemental-walk-packet.md](2026-10-06-p2-supplemental-walk-packet.md). Every reading had `document.hasFocus()` true. No tracked file changed. Evidence: [evidence/p2-walk-3e6e7da](evidence/p2-walk-3e6e7da/) (the full set of 65 screenshots stayed in `/private/tmp/p2-walk/`).

| Cell | F1 Escape | F1 Skip | F2 | C06 | C07 | C01 | Phone keyboard-only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DD | H1 | H1 | H1, H1 | link works, focus BODY (G1) | NOT RUN | sign-out: BODY (G2) | n/a |
| DP | H1 | H1 | H1, H1 | link works, focus BODY (G1) | NOT RUN | sign-out: BODY (G2) | NOT RUN |
| FD | H1 | H1 | H1, H1 | link follow only, BODY (G1) | n/a | n/a | n/a |
| FP | H1 | H1 | H1, H1 | both Timeline links work, BODY (G1) | n/a | n/a | C04, C05, C08, C09, C10, C11 pass |

F1/F2 used Enter on elements focused by script; C06 and the phone journeys used real Tab. **F1 and F2 pass in every cell with focus readings**, which settles the earlier MCP replay as a focus-less window artefact.

## Important (one P2 fix round)

- **G1, all cells.** A keyboard-followed link from one note to another (`/note/Projects/Flat%20hunt/Flat%20hunt.md`, Tab to the Timeline link "Flat 9, Wrenfield Road", Enter; also the cross-project Job hunt link): the URL changes, `document.activeElement` is BODY and stays BODY after 2.9 s. Home → note, `/bower` answer link, compared-note link and the IMG_2290 link land on H1.
- **G2, DD and DP.** `/settings` → Enter on "Sign out": the page moves to `/sign-in?from=…` with focus on BODY.

## Minors (to P2_POLISH)

Answering a Home question leaves focus on the container, not the next question; the "Your note is in the inbox" confirmation was not found as a `status` role right after the action; on the demo sign-in page "Demo" + Enter stays on `/sign-in` (a badge, not investigated).

## NOT RUN

C07 on demo and the full C06 on demo (the demo situation has no rent contradiction; the scripted C06–C10 journeys are fake-only); C01 sign-in on demo (needs Google; sign-out walked); phone keyboard-only on DP (no scripted journeys on demo).
