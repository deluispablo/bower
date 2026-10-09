// Subagent stop gate (TL-P4-20 row 2). Frontmatter `Stop` on an implementer runs as SubagentStop;
// exit 2 keeps the worker going (https://code.claude.com/docs/en/hooks, "Exit code 2 behavior").
// It lets the worker stop when the tree is clean and `scripts/check-mark.mjs` marked a green
// `pnpm check` on the current HEAD. `stop_hook_active` true means the gate already blocked once: never loop.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirty, head, markPath } from './mark-path.mjs';

/** The one-line reason the worker may not stop yet, or null. */
export const stopGate = (event) => {
  if (event?.stop_hook_active === true) return null;
  const cwd = typeof event?.cwd === 'string' ? event.cwd : process.cwd();
  try {
    if (dirty(cwd)) return 'The tree is not clean: commit your work (or remove stray files), then run `node scripts/check-mark.mjs` and stop.';
    let mark = '';
    try {
      mark = readFileSync(markPath(cwd), 'utf8').trim();
    } catch {
      mark = '';
    }
    if (mark !== head(cwd)) return 'No green check on this commit: run `node scripts/check-mark.mjs > /tmp/check.log 2>&1` (it runs pnpm check), fix failures, then stop.';
    return null;
  } catch (error) {
    return `The stop gate could not read the worktree (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}): run \`node scripts/check-mark.mjs\` in it.`;
  }
};

const main = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    event = {};
  }
  const reason = stopGate(event);
  if (reason === null) return;
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
