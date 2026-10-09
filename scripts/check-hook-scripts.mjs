// check-harness rule: every script a hook names, in settings or agent frontmatter, exists.
// Usage: node scripts/check-hook-scripts.mjs [rootDir]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PATH = /\$\{?CLAUDE_PROJECT_DIR\}?\/([\w./-]+)/g;
const commandsIn = (value) => {
  if (Array.isArray(value)) return value.flatMap(commandsIn);
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (k === 'command' && typeof v === 'string' ? [v] : commandsIn(v)));
  return [];
};

/** Problem lines for hook script paths that do not exist under `root`. */
export const hookScriptProblems = (root) => {
  const sources = [];
  const settings = join(root, '.claude/settings.json');
  if (existsSync(settings)) sources.push({ name: '.claude/settings.json', commands: commandsIn(JSON.parse(readFileSync(settings, 'utf8'))) });
  const agents = join(root, '.claude/agents');
  if (existsSync(agents)) {
    for (const file of readdirSync(agents).filter((f) => f.endsWith('.md'))) {
      const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(agents, file), 'utf8'))?.[1] ?? '';
      sources.push({ name: `.claude/agents/${file}`, commands: [...front.matchAll(/^\s*(?:-\s*)?command:\s*(.+)$/gm)].map((m) => m[1]) });
    }
  }
  return sources.flatMap(({ name, commands }) =>
    commands.flatMap((c) => [...c.matchAll(PATH)].map((m) => m[1]).filter((p) => !existsSync(join(root, p))).map((p) => `${name} names a hook script that does not exist: ${p}`)),
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  const problems = hookScriptProblems(root);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}
