// Subagent stop gate (TL-P4-20 row 2, addendum 3). Frontmatter `Stop` on an implementer runs as SubagentStop;
// exit 2 keeps the worker going (https://code.claude.com/docs/en/hooks, "Exit code 2 behavior").
// A worker's hook `cwd` is the main checkout, so the tree to judge comes from the card's `worktree: <absolute path>` line
// in `last_assistant_message`. The worker may stop when that tree is clean and `pnpm check` marked a green run on its HEAD.
// `stop_hook_active` true means the gate already blocked once: never loop.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dirty, head, markPath } from './mark-path.mjs';

const LINE = /^worktree:[ \t]*(\S.*?)[ \t]*$/gm;

/** The one-line reason the worker may not stop yet, or null. */
export const stopGate = (event) => {
  if (event?.stop_hook_active === true) return null;
  const reply = typeof event?.last_assistant_message === 'string' ? event.last_assistant_message : '';
  const tree = [...reply.matchAll(LINE)].map((m) => m[1]).at(-1);
  if (tree === undefined || !isAbsolute(tree) || !existsSync(tree)) {
    return 'The final reply needs a line `worktree: <absolute path of your worktree>` that exists: add it to the card, then stop.';
  }
  try {
    if (dirty(tree)) return `The tree at ${tree} is not clean: commit your work (or remove stray files there), run \`pnpm check\` in ${tree}, then stop.`;
    let mark = '';
    try {
      mark = readFileSync(markPath(tree), 'utf8').trim();
    } catch {
      mark = '';
    }
    if (mark !== head(tree)) return `No green check on the current commit at ${tree}: run \`pnpm check > /tmp/check.log 2>&1\` in ${tree}, fix failures, then stop.`;
    return null;
  } catch (error) {
    return `The stop gate could not read ${tree} (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}): check the \`worktree:\` line.`;
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
