# What Bower does on each screen (d-v2-07, d-v2-24)

The text of the canvas board `BowerMap.dc.html` (page "Bower, your companion"). Tests cite a row by its screen name. The engine rules from d-v2-07 and d-v2-24 apply to every row. They are: one reaction at a time, started within 0.1 s; still with "Bower moves" off or reduced motion; paused while the tab is hidden.

| Screen | Where it sits | Looks at | On its own | Reacts when you… |
|---|---|---|---|---|
| Everywhere | On the top edge of the panel that matters now; toes on the edge. | The pointer; on a keyboard, the focused control; on touch, where you last touched (2.5 s). Turns round with a hop when you are behind it for 0.5 s. | One idle act every 0.8 to 2 s: head snap, tail flick, chirp, wing shuffle or preen, never in a fixed order. A blink every 1.6 to 5.2 s. | Tap it: a hop and a chirp. No input for 60 s: it tucks its head and sleeps; any input wakes it with a startle (tuft up, 0.6 s). |
| Home | The inbox panel; after a tidy-up, the result panel. | The newest pile; the question you are reading. | Peeks at the inbox rows as if counting them. | Point at "Tidy up": tuft up, leans in. Answer yes: two nods. Answer no: a head tilt. Add a pile elsewhere: it flies back and lands on the inbox. |
| Add a pile | The edge of the drop zone. | The file you drag; the field while you type. | Hops along the edge. | Drag over: leans forward, beak open. Drop: catches the file and sets it in the list. A file you already have: tilts its head at that line. Save: carries the pile off toward Home. |
| A pile | The pile's heading. | Each thing as you point at it. | Reads (small head bobs). | Remove the pile: startles, then looks at the message with Undo. |
| A note | The top of Current state, Bower's own section. | Your scroll: it reads along with you. | Reads; now and then looks up at you. | Tick a task: a short chirp. Open a link: follows it with its eye. |
| Files and folders | The folder's heading. | The row you drag. | Idle. | Drop into a folder: a small hop. Move to the Bin: a startle, then it looks at Undo. |
| Tell Bower | Large, beside the heading. | The text as you type (the caret); the microphone while you speak. | Head tilts, as if listening. | Send: two nods and a chirp. A new rule: it carries a small paper to "Your rules". |
| Settings | By "Bower moves". | The switch. | Idle. | Turn "Bower moves" off: it settles once (0.6 s, eyes closing) and then holds. Turn it on: it wakes and shakes its feathers (0.4 s). |
| Tidy-up | On the ground line of the scene. | What it is working on. | Acts the real phase: reads, writes with its beak, carries. | Hide: it waves its wing once. Done: shows off (tail fan). Stopped: alarm pose, then looks at "Try again". |
| Replay | On the heap, then each shelf's twig. | The thing it carries, then its shelf. | Carries one thing at a time. | Skip: lands at once on the last shelf. |
| Errors, offline | Where it was. | The message. | Alarm pose, tuft up. | Back online: a small hop. |

## Like a companion, unlike Clippy

- It notices you, watches what you do and answers with its body.
- No speech bubbles over your work, no tips you did not ask for, nothing that waits for you to close it. Its words are the page's own lines.
- With "Bower moves" off or reduced motion, it holds a pose on its perch and stops following you.
