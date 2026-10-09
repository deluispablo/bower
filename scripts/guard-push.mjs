// Claude Code PreToolUse hook (c3-permissions, TL-P4-20): the only push allowed is the backup of main.
// Exact command from docs/harness/BACKUP.md. Anything else that runs `git push` is refused.
// Why a hook and not a deny rule: a PreToolUse allow cannot override a deny rule, so `Bash(git push *)`
// in permissions.deny would also block the backup push (https://code.claude.com/docs/en/permissions, hooks section).
import { pathToFileURL } from 'node:url';

export const BACKUP_PUSH = 'git push backup refs/heads/main:refs/heads/main';
const REASON = `Workers and sessions never push. The only push allowed is the backup of main: \`${BACKUP_PUSH}\` (docs/harness/BACKUP.md).`;
// `git`, any options or arguments, then `push`, inside one command (also within $(...) or a chain).
const PUSHES = /\bgit\b[^;&|\n]*\bpush\b/;

/** 'allow' for the exact backup push, 'deny' for any other push, null when the command is no push. */
export const guardPush = (event) => {
  const command = event?.tool_input?.command;
  if (event?.tool_name !== 'Bash' || typeof command !== 'string') return null;
  if (command.trim() === BACKUP_PUSH) return 'allow';
  return PUSHES.test(command) ? 'deny' : null;
};

const main = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const decision = guardPush(JSON.parse(raw));
  if (decision === null) return;
  // https://code.claude.com/docs/en/hooks: hookSpecificOutput.permissionDecision for PreToolUse.
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: decision === 'allow' ? 'The backup push of main (BACKUP.md).' : REASON,
      },
    })}\n`,
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
