---
name: bower-review
description: Independently review a pinned bower-app diff range, reading only the worker card, the packet and the diff.
---

# Review a pinned range

Read `docs/harness/WORKER.md`, the packet and the diff range only. Read-only: no init, builds or edits. Judge against the packet's acceptance contract. Report Critical and Important findings against it with a reproduction, and Minor findings in one line each (they never block). Flag a home-made mechanism where a standard one fits. Always answer whether the diff adds a second way to do something that already exists (`docs/ARCHITECTURE.md`, mechanism map); a yes is Important (TL-P4-15). Also check the WORKER checklist items that machines cannot see: a promised behaviour is verified through its real entry point, a stored format still reads what was stored before, and the live path never reads fixtures. Read other revisions with `git show` or `git diff`, never by moving the main checkout. Reply with the review card in `WORKER.md`.

## How to review (TL-P4-20)

1. **Pass 1, the contract.** Check each acceptance item and each named test against the diff and the packet. Answer pass or fail for each. Then go through the tests the diff modifies or deletes: each needs a `tests changed: <file>: <why>` line in the notes, and the reason must hold.
2. **Pass 2, quality.** Look for a second way of doing what a mechanism already does, a home-made mechanism where a standard one fits, and the WORKER checklist items.
3. **Report everything you find, each with its severity.** Do not hold findings back to look decisive. The coordinator filters them. BLOCK only for a contract gap, a correctness bug with a reproduction, or a second way.

Calibration, from this project:
- **BLOCK (P4-39):** a rule test that a renamed map got past. The test checked a name, not the behaviour, so the rule was not really enforced.
- **BLOCK (P4-25):** a write answered 5xx was surfaced as "unknown" and never resent. A contract gap, with a reproduction.
- **PASS (P4-40):** a 4xx releases the reservation through the keeper port, reusing the one home. Second way? no. Its minors went to polish.
- **PASS (P4-45e):** the planner split, with rows tied by op id. Its golden counts held, and "second way? no".

