---
name: bower-review
description: Independently review a pinned bower-app diff range, reading only the worker card, the packet and the diff.
---

# Review a pinned range

Read `docs/harness/WORKER.md`, the packet and the diff range only. Read-only: no init, builds or edits. Judge against the packet's acceptance contract. Report Critical and Important findings against it with a reproduction, and Minor findings in one line each (they never block). Flag a home-made mechanism where a standard one fits. Always answer whether the diff adds a second way to do something that already exists (`docs/ARCHITECTURE.md`, mechanism map); a yes is Important (TL-P4-15). Also check the WORKER checklist items that machines cannot see: a promised behaviour is verified through its real entry point, a stored format still reads what was stored before, and the live path never reads fixtures. Read other revisions with `git show` or `git diff`, never by moving the main checkout. Reply with the review card in `WORKER.md`.
