# Packet: c3-stop-gate (stage 3, TL-P4-20 addendum 3)

- **Entry:** `c3-stop-gate` (harness, config). Worktree `/private/tmp/bower-c3-stop`, branch `c3-stop-gate` from `claude/p3` (after c3-hooks merges without the gate).
- **Authorization:** the owner authorized the TL-P4-20 config changes in the coordinator's chat on 2026-10-09 (hooks, agent definitions, hook scripts).
- **Ruling sweep:**
  - TL-P4-20 row 2 and addendum 3 (DECISIONS:197);
  - DEFECT_LOG `stop-gate-wrong-tree`, with the [diagnosis](defects/2026-10-09-stop-gate-wrong-tree.md);
  - the c3-hooks branch tip 20a3a908, which holds the first gate (scripts/stop-gate.mjs, mark-path.mjs, check-mark.mjs) for reuse.
- **Starting model:** `bower-implementer` (Sonnet).

## Step 0: prove the premise before building

1. Check the current hooks reference (code.claude.com/docs/en/hooks). Does the SubagentStop input carry the final reply (`last_assistant_message`)? context7 queries name only the library and the topic.
2. Run one live subagent stop:
   - A throwaway project agent in your worktree, with a frontmatter Stop hook that only appends its stdin to a file under /tmp, never exits 2, and is never committed.
   - Start it from a `claude -p` run whose working directory is your worktree, with a one-line prompt.
   - Record the input fields it got: `cwd`, `last_assistant_message`, `agent_transcript_path`.
   - If you cannot run a live stop, say why on your card and stop.
3. If the input does not carry the final reply, **stop and report** (status: blocked) before building.

## Contract (option b)

1. **One command.** `pnpm check` itself writes the green mark (HEAD and tree path) on success. `check-mark.mjs` goes away. WORKER.md, the bower-implement skill and the gate all name `pnpm check`.
2. **The worktree line.** The worker card gets a strict line, `worktree: <absolute path>`. Add it to the WORKER.md card format. The gate reads that line from the final reply and judges that tree: clean, and a mark for its HEAD.
   - A missing or unparseable line is refused with a one-line reason.
   - `stop_hook_active` still frees the worker on its second try.
3. **Gate messages** name the worktree path, never "run it here", so a worker is never sent to act in the main checkout.
4. **Real hook input.** Tests use the field shapes recorded in step 0 (fixtures copied from the live input, synthetic values), never a cwd that a live worker never gets (lead's class rule).

## Red

`a worker stop with a dirty worktree is refused for that tree, not for main`

## Verify (exact names)

- `a worker stop with a dirty worktree is refused for that tree, not for main`
- `a worker stop with a clean worktree and a green mark on its head is allowed`
- `a final reply without a worktree line is refused`
- `pnpm check writes the green mark for its tree and head`
- `a stop hook already active lets the worker stop`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines.

The coordinator merges, then checks one live worker stop.

Reviewers are read-only. They never move the main checkout in any form.
