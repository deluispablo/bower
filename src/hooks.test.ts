/// <reference types="node" />
/** The hook audit (TL-P4-20 row 3, c3-hooks; the stop gate moved to c3-stop-gate). Hooks run on fixture inputs only. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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

/** The stop gate (TL-P4-20 addendum 3, c3-stop-gate). Inputs copy the SubagentStop shape recorded from a live stop. */
const git = (cwd: string, ...args: string[]): string =>
  spawnSync('git', ['-c', 'user.name=Alex', '-c', 'user.email=you@example.com', ...args], { cwd, encoding: 'utf8' }).stdout.trim();

const fixture = () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'bower-stop-')));
  const main = join(base, 'main');
  const worker = join(base, 'worker');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'trunk');
  writeFileSync(join(main, 'a.txt'), 'one\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'first');
  git(main, 'worktree', 'add', '-q', '-b', 'work', worker);
  return { main, worker };
};

const mark = (tree: string) => node(script('write-check-mark.mjs'), [], undefined, tree);

const stopInput = (cwd: string, reply: string, active = false) => ({
  session_id: 'sess-1',
  transcript_path: '/tmp/sess-1.jsonl',
  cwd,
  scratchpad_dir: '/tmp/scratch',
  prompt_id: 'prompt-1',
  permission_mode: 'bypassPermissions',
  agent_id: 'agent-1',
  agent_type: 'bower-implementer',
  effort: { level: 'medium' },
  hook_event_name: 'SubagentStop',
  stop_hook_active: active,
  agent_transcript_path: '/tmp/sess-1/subagents/agent-agent-1.jsonl',
  last_assistant_message: reply,
  background_tasks: [],
  session_crons: [],
});

const card = (worktree: string) => `status: done\ncommits: abc123\nred: t\ngreen: pass\nworktree: ${worktree}\nfiles: a.txt\n`;
const gate = (cwd: string, reply: string, active = false) => node(script('stop-gate.mjs'), [], stopInput(cwd, reply, active), '/');

describe('the stop gate', () => {
  it('a worker stop with a dirty worktree is refused for that tree, not for main', () => {
    const { main, worker } = fixture();
    expect(mark(main).status).toBe(0);
    writeFileSync(join(worker, 'stray.txt'), 'x');
    const r = gate(main, card(worker));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(worker);
    expect(r.stderr).not.toContain(main);
  });

  it('a worker stop with a clean worktree and a green mark on its head is allowed', () => {
    const { main, worker } = fixture();
    writeFileSync(join(main, 'coordinator-edit.txt'), 'x');
    expect(gate(main, card(worker)).status).toBe(2);
    expect(mark(worker).status).toBe(0);
    expect(gate(main, card(worker)).status).toBe(0);
    writeFileSync(join(worker, 'a.txt'), 'two\n');
    git(worker, 'commit', '-q', '-am', 'second');
    const r = gate(main, card(worker));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(worker);
  });

  it('a final reply without a worktree line is refused', () => {
    const { main, worker } = fixture();
    expect(mark(worker).status).toBe(0);
    for (const reply of ['status: done\ncommits: abc123\n', `status: done\nworktree: relative/path\n`, `status: done\nworktree: ${worker}-gone\n`, '']) {
      const r = gate(main, reply);
      expect(r.status, reply).toBe(2);
      expect(r.stderr).toMatch(/worktree:/);
    }
  });

  it('pnpm check writes the green mark for its tree and head', () => {
    const { main, worker } = fixture();
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: { check: string; 'check:run': string } };
    // `pnpm check` is the lock around `check:run`, whose last step writes the mark.
    expect(pkg.scripts.check).toContain('pnpm check:run');
    expect(pkg.scripts['check:run'].trim().endsWith('node scripts/write-check-mark.mjs')).toBe(true);
    expect(mark(worker).status).toBe(0);
    const path = join(git(worker, 'rev-parse', '--absolute-git-dir'), 'bower-check-green');
    expect(readFileSync(path, 'utf8').trim()).toBe(git(worker, 'rev-parse', 'HEAD'));
    expect(git(main, 'rev-parse', '--git-path', 'bower-check-green')).not.toContain('worktrees');
    expect(gate(main, card(main)).status).toBe(2);
  });

  it('a stop hook already active lets the worker stop', () => {
    const { main, worker } = fixture();
    writeFileSync(join(worker, 'stray.txt'), 'x');
    expect(gate(main, card(worker), true).status).toBe(0);
    expect(gate(main, 'no worktree line', true).status).toBe(0);
  });
});
