/// <reference types="node" />
/** The agent-definition sensor (TL-P4-20 rows 5 and 6, c3-agent-defs). It runs on fixture roots only; check-harness runs it on the repository. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SENSOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-agent-defs.mjs');
const READ_ONLY = ['bower-reviewer', 'bower-evaluator', 'bower-diagnoser', 'bower-impact', 'bower-design-checker'];

const agent = (front: string[]): string => `---\n${front.join('\n')}\n---\nbody\n`;
const fixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'bower-agents-root-'));
  mkdirSync(join(root, '.claude/agents'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, '.claude/agents', `${name}.md`), text);
  return root;
};
const run = (root: string) => spawnSync('node', [SENSOR, root], { encoding: 'utf8' });
const valid = (): Record<string, string> => ({
  'bower-implementer': agent(['name: bower-implementer', 'description: d', 'maxTurns: 80', 'disallowedTools: [Agent]']),
  ...Object.fromEntries(READ_ONLY.map((n) => [n, agent([`name: ${n}`, 'description: d', 'maxTurns: 60', 'tools: [Read, Grep, Bash]'])])),
});

describe('the agent definitions', () => {
  it('every worker agent has a turn cap and read-only roles list their tools', () => {
    expect(run(fixture(valid())).status).toBe(0);

    const noCap = valid();
    noCap['bower-implementer'] = agent(['name: bower-implementer', 'description: d', 'disallowedTools: [Agent]']);
    const capless = run(fixture(noCap));
    expect(capless.status).toBe(1);
    expect(capless.stderr).toMatch(/bower-implementer\.md.*maxTurns/);

    const denylist = valid();
    denylist['bower-reviewer'] = agent(['name: bower-reviewer', 'description: d', 'maxTurns: 60', 'disallowedTools: [Edit, Write, NotebookEdit]']);
    const noTools = run(fixture(denylist));
    expect(noTools.status).toBe(1);
    expect(noTools.stderr).toMatch(/bower-reviewer\.md.*tools:/);

    const edits = valid();
    edits['bower-impact'] = agent(['name: bower-impact', 'description: d', 'maxTurns: 60', 'tools: [Read, Write, Edit]']);
    const canEdit = run(fixture(edits));
    expect(canEdit.status).toBe(1);
    expect(canEdit.stderr).toMatch(/bower-impact\.md.*Edit/);

    const nested = valid();
    nested['bower-implementer'] = agent(['name: bower-implementer', 'description: d', 'maxTurns: 80']);
    const canNest = run(fixture(nested));
    expect(canNest.status).toBe(1);
    expect(canNest.stderr).toMatch(/bower-implementer\.md.*Agent/);

    const broken = valid();
    broken['bower-mechanical'] = 'no frontmatter here\n';
    const unparsed = run(fixture(broken));
    expect(unparsed.status).toBe(1);
    expect(unparsed.stderr).toMatch(/bower-mechanical\.md.*frontmatter/);
  });
});
