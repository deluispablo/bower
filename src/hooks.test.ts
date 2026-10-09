/// <reference types="node" />
/** The worker stop gate and the hook audit (TL-P4-20 rows 2 and 3, c3-hooks). Hooks run on fixture inputs only. */
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
const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=you@example.com', ...args], { cwd, encoding: 'utf8' });
  return r.stdout.trim();
};
const repo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bower-hooks-'));
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'one');
  return dir;
};
const markFile = (dir: string): string => join(dir, git(dir, 'rev-parse', '--git-path', 'bower-check-green'));
const markGreen = (dir: string): void => writeFileSync(markFile(dir), `${git(dir, 'rev-parse', 'HEAD')}\n`);
const stopEvent = (cwd: string, active = false) => ({
  hook_event_name: 'SubagentStop',
  agent_id: 'a1b2',
  agent_type: 'bower-implementer',
  cwd,
  stop_hook_active: active,
});
const stop = (cwd: string, active = false) => node(script('stop-gate.mjs'), [], stopEvent(cwd, active));

describe('the worker stop gate', () => {
  it('a worker cannot stop with a dirty tree or without a green check on its HEAD', () => {
    const dir = repo();
    const none = stop(dir);
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/pnpm check/);
    expect(none.stderr.trim().split('\n')).toHaveLength(1);

    markGreen(dir);
    expect(stop(dir).status).toBe(0);

    writeFileSync(join(dir, 'a.txt'), 'two\n');
    const dirty = stop(dir);
    expect(dirty.status).toBe(2);
    expect(dirty.stderr).toMatch(/commit|uncommitted|clean/i);

    git(dir, 'commit', '-qam', 'two');
    const moved = stop(dir);
    expect(moved.status).toBe(2);
    expect(moved.stderr).toMatch(/pnpm check/);
  });

  it('a stop hook already active lets the worker stop', () => {
    const dir = repo();
    writeFileSync(join(dir, 'a.txt'), 'dirty\n');
    expect(stop(dir, true).status).toBe(0);
  });

  it('the check wrapper writes the mark only on green', () => {
    const dir = repo();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { check: 'true' } }));
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'pkg');
    const green = node(script('check-mark.mjs'), [], undefined, dir);
    expect(green.status).toBe(0);
    expect(readFileSync(markFile(dir), 'utf8').trim()).toBe(git(dir, 'rev-parse', 'HEAD'));

    const red = repo();
    writeFileSync(join(red, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { check: 'false' } }));
    git(red, 'add', '.');
    git(red, 'commit', '-qm', 'pkg');
    expect(node(script('check-mark.mjs'), [], undefined, red).status).not.toBe(0);
    expect(() => readFileSync(markFile(red), 'utf8')).toThrow();
  });
});

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
    expect(stop(repo()).status).toBe(2);
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

  it('both implementer agents carry the stop gate', () => {
    for (const agent of ['bower-implementer', 'bower-escalated']) {
      const text = readFileSync(join(ROOT, `.claude/agents/${agent}.md`), 'utf8');
      expect(text, agent).toMatch(/hooks:\n {2}Stop:[\s\S]*scripts\/stop-gate\.mjs/);
    }
  });
});
