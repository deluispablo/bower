# c3-permissions notes

- Files: `.claude/settings.json` (one added PreToolUse Bash hook, new `permissions.deny`), `scripts/guard-push.mjs`, `src/guard-push.test.ts`.
- tests changed: none (one new test file, no existing test modified).
- Research (docs read 2026-10-09):
  - Permissions (code.claude.com/docs/en/permissions): rules run deny, ask, allow; first match wins; "An allow rule can't carve an exception out of a deny rule". Hooks section: "PreToolUse hook decisions don't bypass permission rules ... a matching deny rule blocks the call".
  - Hooks (code.claude.com/docs/en/hooks): input has `tool_name`, `tool_input.command`, `cwd`; output `hookSpecificOutput.permissionDecision` allow/deny; silent exit 0 means no decision (normal permission flow).
  - Path rules use gitignore syntax: `Edit(public/landing/**)` anchored at project root, `Read(.env*)` matches at any depth. `Write` is denied too, since an Edit deny covers the file-editing tools but the rule is listed for both explicitly.
- Decision: no `Bash(git push *)` deny rule. It would also block the backup push, and a hook allow cannot override it. The hook alone denies every push except the exact BACKUP.md command (hook-only denial, as the packet allows).
- Interaction: the hook allows the exact backup push (no deny rule exists to override it) and denies any other command containing `git ... push`, including chains, `-C`, `$(...)`. Bash rules do not match `git -C . push`, so a deny rule would also be bypassable; the hook regex is not.
- Limit: the hook is a text check. A push hidden behind a variable, script or alias is not seen; same limit as any Bash rule.
- Live check left to the coordinator: the backup push once after merge.
