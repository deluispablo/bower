// Claude Code PreToolUse hook (TL-P2-44 rule 7): a plain gate command runs with its whole
// output in a log file, and only the failures and the tail come back into the agent's context.
// Anything chained, piped or already redirected is left alone.
import { pathToFileURL } from 'node:url';

const ENV = String.raw`(?:[A-Z_][A-Z0-9_]*=\S+\s+)*`;
const GATE = new RegExp(
  String.raw`^${ENV}(?:pnpm\s+(?:check|test|lint|typecheck|build|e2e(?::[\w-]+)?)|pnpm\s+exec\s+(?:vitest|playwright)|npx\s+(?:vitest|playwright))(?:\s.*)?$`,
);
const SHELL = /[;&|<>`$()\n]/;
const FAILURES = 'FAIL|✗|×|✘|error TS|  error  |failed|No test files';

/** The quiet form of a gate command, or null when the command is not a plain gate. */
export const quietGate = (command) => {
  const plain = command.trim();
  if (SHELL.test(plain) || !GATE.test(plain)) return null;
  return `(log=$(mktemp /tmp/bower-gate.XXXXXX); ${plain} > "$log" 2>&1; s=$?; grep -E "${FAILURES}" "$log" | head -40; echo "--- tail of $log (exit $s)"; tail -15 "$log"; exit $s)`;
};

const main = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const event = JSON.parse(raw);
  const command = event?.tool_input?.command;
  const quiet = typeof command === 'string' ? quietGate(command) : null;
  if (quiet === null) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...event.tool_input, command: quiet } },
    }),
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
