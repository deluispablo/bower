// Claude Code PreToolUse hook (TL-P4-17 entry 2): a subagent never moves the main checkout.
// A reviewer ran `git checkout <sha>` there and left it on a detached head (DEFECT_LOG reviewer-checkout-main).
// Subagent marker: the hook input field `agent_id`, present only inside a subagent
// (https://code.claude.com/docs/en/hooks). Agent frontmatter hooks may pass `--subagent` instead.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const MAIN = '/Users/deluisp/Projects/bower-app';
const MOVES = new Set(['checkout', 'switch', 'reset', 'rebase', 'merge', 'stash']);
const REASON =
  'Do not move the main checkout. Read another revision with `git show <rev>:<path>` or `git diff <a>..<b>`, or work in a scratch worktree (`git worktree add /tmp/<name> <rev>`).';

const inMain = (dir) => dir === MAIN || dir.startsWith(`${MAIN}/`);
const words = (segment) => segment.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/^["']|["']$/g, ''));

/** The reason to refuse a subagent's command, or null. Tracks `cd` and `git -C` through a chain. */
export const guardMainCheckout = (event, { subagent = false } = {}) => {
  const command = event?.tool_input?.command;
  if (typeof command !== 'string') return null;
  if (!subagent && typeof event?.agent_id !== 'string') return null;
  let dir = resolve(typeof event.cwd === 'string' ? event.cwd : '/');
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const w = words(segment);
    if (w[0] === 'cd' && w[1]) {
      dir = resolve(dir, w[1]);
      continue;
    }
    if (w[0] !== 'git') continue;
    let target = dir;
    let i = 1;
    while (i < w.length && w[i].startsWith('-')) {
      if (w[i] === '-C' && w[i + 1]) target = resolve(target, w[++i]);
      i++;
    }
    if (MOVES.has(w[i]) && inMain(target)) return REASON;
  }
  return null;
};

const main = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const reason = guardMainCheckout(JSON.parse(raw), { subagent: process.argv.includes('--subagent') });
  if (reason === null) return;
  // Exit 2 blocks the call and feeds stderr to the model (https://code.claude.com/docs/en/hooks, exit codes).
  process.stderr.write(`${reason}\n`);
  process.exit(2);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
