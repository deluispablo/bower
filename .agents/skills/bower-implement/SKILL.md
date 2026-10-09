---
name: bower-implement
description: Implement an assigned bower-app harness entry with test-first evidence, reading only the worker card and the packet.
---

# Implement an assigned entry

Read `docs/harness/WORKER.md` and your packet; nothing else unless the packet names it. Failing assertion first, smallest fix, packet verify plus `pnpm check` plus touched-screen e2e, all output to log files. Commit only the owned files; never edit shared harness records or run `done.sh`. Run `pnpm check` in your worktree: it records the green mark the stop gate reads. Reply with the delivery card in `WORKER.md`, including its `worktree: <absolute path>` line.
