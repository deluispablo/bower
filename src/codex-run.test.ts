/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = process.cwd();
const runner = join(root, 'harness/codex-run.sh');
const scanner = join(root, 'scripts/scan-staged.mjs');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(branch = 'worker') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'c5-')));
  dirs[dirs.length] = dir;
  const main = join(dir, 'main');
  const wt = join(dir, 'wt');
  mkdirSync(main);
  const git = (args: string[], cwd = wt): string => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  git(['init', '-q'], main);
  git(['config', 'user.name', 'Alex'], main);
  git(['config', 'user.email', 'you@example.com'], main);
  mkdirSync(join(main, 'harness'));
  copyFileSync(join(root, 'harness/with-lock.sh'), join(main, 'harness/with-lock.sh'));
  writeFileSync(join(main, 'base.txt'), 'base\n');
  git(['add', '-A'], main);
  git(['commit', '-qm', 'base'], main);
  git(['worktree', 'add', '-q', '-b', branch, wt], main);
  const base = git(['rev-parse', 'HEAD']);
  const prompt = join(dir, 'prompt');
  writeFileSync(prompt, 'Synthetic task\n');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const fake = join(bin, 'fake-codex');
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const wt = args[args.indexOf('-C') + 1];
fs.writeFileSync(process.env.C5_CALL, JSON.stringify({args, prompt: fs.readFileSync(0, 'utf8')}));
const delivery = JSON.parse(process.env.C5_DELIVERY);
for (const [name, value] of Object.entries(delivery.files || {})) {
  const file = path.join(wt, name);
  if (value === null) fs.rmSync(file);
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
}
if ('plan' in delivery) fs.writeFileSync(path.join(wt, '.codex-commits.json'), typeof delivery.plan === 'string' ? delivery.plan : JSON.stringify(delivery.plan));
console.log(JSON.stringify({type:'thread.started', model:'synthetic-model'}));
console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:1, output_tokens:2}}));
console.log(JSON.stringify({type:'item.completed', item:{type:'agent_message', text:'status: done\\nfiles: a.txt'}}));
console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:120, cached_input_tokens:30, output_tokens:7}}));
process.exit(Number(process.env.C5_CODEX_EXIT || 0));
`, { mode: 0o755 });
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.C5_GATES, JSON.stringify({args, cwd: process.cwd(), held: process.env.HARNESS_LOCK_HELD || ''}) + '\\n');
console.log('synthetic summary');
process.exit(Number(JSON.parse(process.env.C5_GATE_EXITS || '{}')[args[0]] || 0));
`, { mode: 0o755 });
  const result = join(dir, 'results/slice-2.result');
  const tokens = join(dir, 'tokens.csv');
  writeFileSync(tokens, 'entry,role,tool,model,effort,attempt,tokens,input,cache_write,cache_read,output,cost_usd,tool_uses,minutes,outcome,date\n');
  const call = join(dir, 'call');
  const gates = join(dir, 'gates');
  const env: NodeJS.ProcessEnv = {
    ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, BOWER_MAIN: main,
    CODEX_BIN: fake, CODEX_RUN_DIR: join(dir, 'results'), BOWER_TOKENS: tokens,
    HARNESS_LOCK: join(dir, 'heavy.lock'), C5_CALL: call, C5_GATES: gates,
  };
  delete env.HARNESS_LOCK_HELD;
  const run = (delivery: { files?: Record<string, string | null>; plan?: unknown } = {},
    args: string[] = [], overrides: NodeJS.ProcessEnv = {}, target = wt) => {
    const r = spawnSync('bash', [runner, target, prompt, '--entry', 'slice', '--attempt', '2', ...args], {
      cwd: dir, encoding: 'utf8', env: { ...env, C5_DELIVERY: JSON.stringify(delivery), ...overrides },
    });
    return { ...r, out: r.stdout + r.stderr, result: existsSync(result) ? readFileSync(result, 'utf8') : '' };
  };
  return { dir, main, wt, git, base, run, result, tokens, call, gates };
}

describe('codex delivery entry point', () => {
  it('refuses the main checkout, a codex branch and a dirty tree', () => {
    const f = fixture();
    const assertRefused = (r: ReturnType<typeof f.run>, why: RegExp) => {
      expect(r.status).toBe(2);
      expect(r.out.trim().split('\n')).toHaveLength(1);
      expect(r.out).toMatch(why);
      expect(r.result).toContain('status: refused');
      expect(existsSync(f.call)).toBe(false);
    };
    assertRefused(f.run({}, [], {}, f.main), /main checkout/i);
    assertRefused(f.run({}, [], {}, f.dir), /git worktree/i);
    writeFileSync(join(f.wt, 'loose.txt'), 'untracked');
    assertRefused(f.run(), /dirty/i);
    rmSync(join(f.wt, 'loose.txt'));
    writeFileSync(join(f.wt, 'base.txt'), 'tracked change');
    assertRefused(f.run(), /dirty/i);
    const c = fixture('codex/task');
    expect(c.run().status).toBe(2);
    expect(existsSync(c.call)).toBe(false);
    const detached = fixture();
    detached.git(['checkout', '--detach', '-q']);
    expect(detached.run().status).toBe(2);
    expect(existsSync(detached.call)).toBe(false);
  });

  it('commits a two-commit plan in order with implementer: codex', () => {
    const f = fixture();
    const r = f.run({ files: { 'a.txt': 'one\n', 'b space.txt': 'two\n' }, plan: [
      { message: 'first', files: ['a.txt'] }, { message: 'second', files: ['b space.txt'] },
    ] });
    expect(r.status, r.out).toBe(0);
    const first = f.git(['rev-parse', 'HEAD~1']);
    const second = f.git(['rev-parse', 'HEAD']);
    expect(f.git(['rev-parse', 'HEAD~2'])).toBe(f.base);
    expect(f.git(['show', '-s', '--format=%B', first])).toBe('first\n\nimplementer: codex');
    expect(f.git(['show', '-s', '--format=%B', second])).toBe('second\n\nimplementer: codex');
    expect(f.git(['diff-tree', '--no-commit-id', '--name-only', '-r', first])).toBe('a.txt');
    expect(f.git(['diff-tree', '--no-commit-id', '--name-only', '-r', second])).toBe('b space.txt');
    expect(f.git(['status', '--porcelain'])).toBe('?? .codex-commits.json');
    expect(r.result).toContain(`commits: ${first},${second}`);
    expect(r.result).toContain('status: green');
    expect(r.result).toContain('card:\nstatus: done\nfiles: a.txt');
    expect(JSON.parse(readFileSync(f.call, 'utf8')) as unknown).toEqual({
      args: ['exec', '--json', '--sandbox', 'workspace-write', '-C', f.wt, '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=medium', '-c', 'service_tier="priority"', '-'],
      prompt: 'Synthetic task\n',
    });
  });

  it.each([
    { kind: 'guarded settings', path: '.claude/settings.json', text: '{}' },
    { kind: 'guarded script', path: 'scripts/guard-x.mjs', text: 'x' },
    { kind: 'guarded environment', path: 'src/.env.local', text: 'x' },
    { kind: 'secret', path: 'a.txt', text: 'ghp_' + 'A'.repeat(36) },
    { kind: 'address', path: 'a.txt', text: 'person@' + 'invalid.test' },
  ])('refuses guarded paths, secrets and addresses: $kind', ({ path, text }) => {
    const f = fixture();
    const r = f.run({ files: { [path ?? '']: text ?? '' } });
    expect(r.status, r.out).toBe(3);
    expect(r.result).toContain('status: refused');
    expect(f.git(['rev-parse', 'HEAD'])).toBe(f.base);
    expect(existsSync(f.gates)).toBe(false);
    expect(f.git(['diff', '--cached', '--name-only'])).toBe('');
  });

  it.each<{ plan: unknown; files: Record<string, string | null> }>([
    { plan: [{ message: 'one', files: ['a.txt'] }], files: { 'a.txt': 'one', 'extra.txt': 'extra' } },
    { plan: [{ message: 'one', files: ['missing.txt'] }], files: { 'a.txt': 'one' } },
    { plan: [{ message: 'one', files: ['a.txt'] }, { message: 'two', files: ['missing.txt'] }], files: { 'a.txt': 'one' } },
    { plan: [{ message: 'one', files: ['a.txt'] }, { message: 'two', files: ['a.txt'] }], files: { 'a.txt': 'one' } },
    { plan: [{ message: 'one', files: ['../a.txt'] }], files: { 'a.txt': 'one' } },
    { plan: [{ message: '', files: ['a.txt'] }], files: { 'a.txt': 'one' } },
    { plan: 'not json', files: { 'a.txt': 'one' } },
  ])('validates the whole plan before changing HEAD ($plan)', (delivery) => {
    const f = fixture();
    expect(f.run(delivery).status).toBe(3);
    expect(f.git(['rev-parse', 'HEAD'])).toBe(f.base);
    expect(f.git(['diff', '--cached', '--name-only'])).toBe('');
  });

  it('appends the last usage in column order and captures the JSON stream', () => {
    const f = fixture();
    const r = f.run({}, ['--sandbox', 'read-only', '--role', 'reviewer', '--effort', 'high']);
    expect(r.status, r.out).toBe(0);
    const rows = readFileSync(f.tokens, 'utf8').trim().split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.split(',').slice(0, 11)).toEqual(['slice', 'reviewer', 'codex', 'synthetic-model', 'high', '2', '127', '120', '', '30', '7']);
    expect(rows[1]?.split(',').slice(14)).toEqual(['read-only', new Date().toISOString().slice(0, 10)]);
    expect(r.result).toContain('tokens: 127');
    expect(r.result).toContain(`json-log: ${join(f.dir, 'results/slice-2.jsonl')}`);
    expect(readFileSync(join(f.dir, 'results/slice-2.jsonl'), 'utf8')).toContain('turn.completed');
  });

  it('passes the chosen model, effort and standard speed to Codex (TL-P4-57)', () => {
    const f = fixture();
    const r = f.run({}, ['--sandbox', 'read-only', '--role', 'reviewer', '--model', 'gpt-6-astra', '--effort', 'xhigh', '--tier', 'standard']);
    expect(r.status, r.out).toBe(0);
    expect((JSON.parse(readFileSync(f.call, 'utf8')) as { args: string[] }).args).toEqual(
      ['exec', '--json', '--sandbox', 'read-only', '-C', f.wt, '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=xhigh', '-']);
  });

  it.each([['--tier', 'turbo'], ['--model', 'Bad Model'], ['--effort', 'ultra']])('refuses %s %s', (flag, value) => {
    const f = fixture();
    expect(f.run({}, ['--sandbox', 'read-only', flag, value]).status).toBe(2);
  });

  it('read-only writes the card without committing or running gates', () => {
    const f = fixture();
    const r = f.run({ files: { 'a.txt': 'one' } }, ['--sandbox', 'read-only']);
    expect(r.status, r.out).toBe(0);
    expect(r.result).toContain('status: read-only');
    expect(r.result).toContain('card:\nstatus: done\nfiles: a.txt');
    expect(f.git(['rev-parse', 'HEAD'])).toBe(f.base);
    expect(existsSync(f.gates)).toBe(false);
  });

  it('without a plan commits edits, additions and deletions once', () => {
    const f = fixture();
    const r = f.run({ files: { 'base.txt': null, 'a.txt': 'you@example.com\n' } });
    expect(r.status, r.out).toBe(0);
    expect(f.git(['show', '-s', '--format=%B', 'HEAD'])).toBe('slice: codex delivery\n\nimplementer: codex');
    expect(f.git(['rev-parse', 'HEAD~1'])).toBe(f.base);
    expect(f.git(['status', '--porcelain'])).toBe('');
  });

  it('never commits the plan file, even when a previous plan is tracked', () => {
    const f = fixture();
    writeFileSync(join(f.wt, '.codex-commits.json'), '[]\n');
    f.git(['add', '.codex-commits.json']);
    f.git(['commit', '-qm', 'previous plan']);
    const before = f.git(['rev-parse', 'HEAD']);
    const r = f.run({ files: { 'a.txt': 'one' }, plan: [{ message: 'delivery', files: ['a.txt'] }] });
    expect(r.status, r.out).toBe(0);
    expect(f.git(['diff', '--name-only', before, 'HEAD'])).toBe('a.txt');
    expect(f.git(['show', 'HEAD:.codex-commits.json'])).toBe('[]');
    expect(f.git(['status', '--porcelain'])).toBe('M .codex-commits.json');
  });

  it.each([
    [{ check: 1 }, 'check-failed', ['check']],
    [{ e2e: 1 }, 'e2e-failed', ['check', 'e2e', 'e2e:fake']],
    [{ 'e2e:fake': 1 }, 'e2e-failed', ['check', 'e2e', 'e2e:fake']],
    [{}, 'green', ['check', 'e2e', 'e2e:fake']],
  ] as const)('records gate exits and runs both e2e sources (%s)', (exits, status, commands) => {
    const f = fixture();
    const r = f.run({ files: { 'a.txt': 'one' } }, ['--e2e', '-g "a whole name"'], { C5_GATE_EXITS: JSON.stringify(exits) });
    expect(r.status, r.out).toBe(status === 'green' ? 0 : 1);
    expect(r.result).toContain(`status: ${status}`);
    expect(r.result).toContain(`commits: ${f.git(['rev-parse', 'HEAD'])}`);
    const calls = readFileSync(f.gates, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { args: string[]; cwd: string; held: string });
    expect(calls.map((c) => c.args[0])).toEqual(commands);
    expect(calls[0]?.held).toBe(join(f.dir, 'heavy.lock'));
    for (const c of calls) expect(c.cwd).toBe(f.wt);
    for (const c of calls.slice(1)) expect(c.args.slice(1)).toEqual(['-g', 'a whole name']);
    for (const name of ['check', ...(status === 'check-failed' ? [] : ['e2e-demo', 'e2e-fake'])]) {
      expect(r.result).toContain(`${name}-log: ${join(f.dir, `results/slice-2.${name}.log`)}`);
    }
  });

  it('a failed codex process never commits or gates', () => {
    const f = fixture();
    const r = f.run({ files: { 'a.txt': 'one' } }, [], { C5_CODEX_EXIT: '9' });
    expect(r.status).toBe(1);
    expect(r.result).toContain('status: codex-failed');
    expect(f.git(['rev-parse', 'HEAD'])).toBe(f.base);
    expect(existsSync(f.gates)).toBe(false);
  });

  it('refuses result directories in the main checkout or delivery tree without writing there', () => {
    const f = fixture();
    for (const target of [f.main, f.wt]) {
      const outputDir = join(target, 'results');
      const r = f.run({}, [], { CODEX_RUN_DIR: outputDir });
      expect(r.status, r.out).toBe(2);
      expect(existsSync(outputDir)).toBe(false);
      expect(existsSync(f.call)).toBe(false);
    }
  });

  it('never contains a git subcommand for the remote upload', () => {
    expect(existsSync(runner)).toBe(true);
    const source = readFileSync(runner, 'utf8');
    expect(source).not.toMatch(new RegExp('\\b' + ['pu', 'sh'].join('') + '\\b'));
  });
});

describe('the reusable staged scanner', () => {
  async function scan(paths: string[], diff: string): Promise<string[]> {
    expect(existsSync(scanner)).toBe(true);
    const module = await import(/* @vite-ignore */ scanner) as { scanStaged: (paths: string[], diff: string) => string[] };
    return module.scanStaged(paths, diff);
  }

  it.each(['.claude/x', '.agents/x', '.githooks/x', 'scripts/guard-x.mjs', 'scripts/check-hook-scripts.mjs',
    'scripts/check-agent-defs.mjs', 'nested/settings.local.json', '.env', 'nested/.env.local'])('guards %s', async (path) => {
    expect(await scan([path], '')).toHaveLength(1);
  });

  it.each([
    '-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----',
    '-----BEGIN EC PRIVATE KEY-----', '-----BEGIN ENCRYPTED PRIVATE KEY-----', '-----BEGIN PGP PRIVATE KEY BLOCK-----',
    'AKIA' + 'A'.repeat(16), 'sk-' + 'a'.repeat(24), 'ghp_' + 'a'.repeat(36),
    'github_pat_' + 'a'.repeat(40), 'xoxb-' + '1'.repeat(20), 'xoxp-' + '1'.repeat(20),
    'client_secret = synthetic', 'https://synthetic.workers.dev', 'person@' + 'invalid.test',
  ])('scans added lines for pattern %s', async (line) => {
    expect((await scan(['a.txt'], `@@ -0,0 +1 @@\n+${line}\n`)).length).toBeGreaterThan(0);
    expect(await scan(['a.txt'], `@@ -1 +0,0 @@\n-${line}\n`)).toEqual([]);
  });

  it('allows example addresses and scans content beginning with plus signs', async () => {
    const allowed = ['you@example.com', ['noreply', 'anthropic.com'].join('@'), ['alex', 'example.com'].join('@')];
    expect(await scan(['src/settings.ts'], allowed.map((line) => `+${line}\n`).join(''))).toEqual([]);
    expect(await scan(['a.txt'], '+++ b/a.txt\n@@ -0,0 +1 @@\n+++person@' + 'invalid.test\n')).toHaveLength(1);
  });

  it('the CLI uses the staged diff, including staged additions', () => {
    const f = fixture();
    writeFileSync(join(f.wt, 'a.txt'), 'client_secret = synthetic\n');
    f.git(['add', 'a.txt']);
    const r = spawnSync('node', [scanner], { cwd: f.wt, encoding: 'utf8' });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('secret');
    writeFileSync(join(f.wt, 'a.txt'), 'you@example.com\n');
    f.git(['add', 'a.txt']);
    expect(spawnSync('node', [scanner], { cwd: f.wt }).status).toBe(0);
  });
});
