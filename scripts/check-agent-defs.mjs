// check-harness rule: agent definitions (TL-P4-20 rows 5 and 6, c3-agent-defs).
// Every frontmatter parses; every agent has a turn cap and cannot dispatch (no Agent tool);
// the read-only roles list their tools (an allowlist) and never Edit.
// Usage: node scripts/check-agent-defs.mjs [rootDir]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const READ_ONLY_ROLES = ['bower-reviewer', 'bower-evaluator', 'bower-diagnoser', 'bower-impact', 'bower-design-checker'];
const WRITES_CODE = ['Edit', 'NotebookEdit'];

const list = (value) => value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);

/** Top-level `key: value` pairs of a frontmatter block; null if there is no block. */
const frontmatter = (text) => {
  const block = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  if (block === undefined) return null;
  const fields = {};
  for (const line of block.split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
};

/** Problem lines for the agent definitions under `root`. */
export const agentDefProblems = (root) => {
  const dir = join(root, '.claude/agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .flatMap((file) => {
      const where = `.claude/agents/${file}`;
      const front = frontmatter(readFileSync(join(dir, file), 'utf8'));
      if (!front || !front.name || !front.description) return [`${where} has no parsable frontmatter with a name and a description`];
      const out = [];
      if (!/^[1-9]\d*$/.test(front.maxTurns ?? '')) out.push(`${where} needs maxTurns, a positive whole number`);
      const tools = front.tools === undefined ? null : list(front.tools);
      const denied = list(front.disallowedTools ?? '');
      if (tools ? tools.some((t) => t === 'Agent' || t.startsWith('Agent(')) : !denied.includes('Agent')) out.push(`${where} can dispatch: it must not have the Agent tool`);
      if (READ_ONLY_ROLES.includes(front.name)) {
        if (!tools) out.push(`${where} is read-only: list its tools: instead of disallowedTools`);
        else for (const t of tools.filter((t) => WRITES_CODE.includes(t))) out.push(`${where} is read-only but lists ${t}`);
        if (front.disallowedTools !== undefined) out.push(`${where} is read-only: use tools:, not disallowedTools`);
      }
      return out;
    });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  const problems = agentDefProblems(root);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}
