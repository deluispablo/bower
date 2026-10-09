# Notes: c3-stop-gate

- Step 0 (live, `claude -p` from the worktree, throwaway agent with a frontmatter Stop hook, deleted): SubagentStop input fields
  `session_id, transcript_path, cwd, scratchpad_dir, prompt_id, permission_mode, agent_id, agent_type, effort, hook_event_name,
  stop_hook_active, agent_transcript_path, last_assistant_message, background_tasks, session_crons`. `last_assistant_message` held the reply ("ok").
  The live `cwd` equalled the launch directory; a worker's `cwd` is the main checkout, so the gate reads the card's `worktree:` line instead.
- `pnpm check` ends with `scripts/write-check-mark.mjs`; `check-mark.mjs` is not reintroduced. Gate: `scripts/stop-gate.mjs`, hook on `bower-implementer` and `bower-escalated`.
- WORKER.md card is now at most 9 lines (new `worktree:` line); the bower-implement skill names `pnpm check` only. `maxTurns` and `disallowedTools` kept.
- tests changed: src/hooks.test.ts: added the stop gate describe and a `realpathSync` import; no existing test modified.
