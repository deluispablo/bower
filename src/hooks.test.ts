/// <reference types="node" />
/** The hook audit (TL-P4-20 row 3, c3-hooks; the stop gate moved to c3-stop-gate). Hooks run on fixture inputs only. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = '/Users/deluisp/Projects/bower-app';
const script = (name: string): string => join(ROOT, 'scripts', name);
const node = (file: string, args: string[], input?: unknown, cwd?: string) =>
  spawnSync('node', [file, ...args], { input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', cwd });

describe('the hook audit', () => {
  it('a hook denial exits 2', () => {
    const deny = node(script('guard-main-checkout.mjs'), [], {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      cwd: MAIN,
      agent_id: 'a1b2',
      tool_input: { command: 'git checkout d930f397' },
    });
    expect(deny.status).toBe(2);
    expect(deny.stderr).toMatch(/git show/);
  });

  it('the main-checkout guard uses the hook input cwd', () => {
    const at = (cwd: string) =>
      node(script('guard-main-checkout.mjs'), [], { tool_name: 'Bash', cwd, agent_id: 'a1b2', tool_input: { command: 'git switch other' } }, '/');
    expect(at(MAIN).status).toBe(2);
    expect(at(`${MAIN}/src`).status).toBe(2);
    expect(at('/private/tmp/bower-c3-hooks').status).toBe(0);
  });

  it('every hook script named in settings exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'bower-hooks-root-'));
    mkdirSync(join(root, '.claude/agents'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/here.mjs'), '');
    writeFileSync(
      join(root, '.claude/settings.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/here.mjs"' }] }] } }),
    );
    writeFileSync(
      join(root, '.claude/agents/w.md'),
      '---\nname: w\nhooks:\n  Stop:\n    - hooks:\n        - type: command\n          command: node "$CLAUDE_PROJECT_DIR/scripts/gone.mjs"\n---\nbody\n',
    );
    const missing = node(script('check-hook-scripts.mjs'), [root]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/scripts\/gone\.mjs/);
    expect(missing.stderr).not.toMatch(/here\.mjs/);

    writeFileSync(join(root, 'scripts/gone.mjs'), '');
    expect(node(script('check-hook-scripts.mjs'), [root]).status).toBe(0);
  });

  it('settings run one handler per rule, resume restores the same text, and PreCompact never blocks', () => {
    const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8'));
    const commands = Object.values<{ hooks: { command: string }[] }[]>(settings.hooks).flatMap((groups) => groups.flatMap((g) => g.hooks.map((h) => h.command)));
    expect(new Set(commands).size).toBe(commands.length);
    const start = settings.hooks.SessionStart as { matcher: string; hooks: { command: string }[] }[];
    const restore = start.find((g) => g.hooks.some((h) => h.command.includes('after-compact.md')));
    expect(restore?.matcher.split('|').sort()).toEqual(['compact', 'resume']);
    const pre = settings.hooks.PreCompact as { hooks: { command: string }[] }[];
    expect(pre).toHaveLength(1);
    for (const input of ['', '{', JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'auto' })]) {
      const r = spawnSync('node', [script('pre-compact.mjs')], { input, encoding: 'utf8' });
      expect(r.status, input).toBe(0);
    }
  });
});
