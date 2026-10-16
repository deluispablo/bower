import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * cutover-rollback: scripts/cutover.sh and scripts/rollback.sh, run with macOS's stock bash against a throwaway
 * copy of the repository. Every tool that could reach the network is a stand-in on PATH that logs its call; git
 * passes local commands to the real git and refuses remote ones. With --dry-run, no stand-in but local git may be
 * called at all. Made-up origin, ids and repository only.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');
const ORIGIN = 'https://bower.example.test';
const CONFIG = 'api/wrangler.production.jsonc';
const STAGING_KV = '6969d46bffdb4b1e90d068f84235fbec';
const MADE_UP_KV = '0123456789abcdef0123456789abcdef';
const LIVE = '11111111-2222-4333-8444-555555555555';
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
/** Tools that reach the network, or could: each is a stand-in that logs its call. */
const NETWORK = ['pnpm', 'npx', 'wrangler', 'curl', 'wget', 'gh', 'ssh', 'nc'];

const GIT = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$CALLS"
for arg in "$@"; do
  case "$arg" in push|fetch|pull|clone|ls-remote|remote|submodule) echo "git stand-in: no network" >&2; exit 1 ;; esac
done
exec "$REAL_GIT" "$@"
`;

/**
 * One stand-in for every network tool: logs "<tool> <args>"; fails unless $ANSWER is set (a real run). npx answers
 * deployments status with $LIVE_OUT and a deploy with $DEPLOY_OUT; curl answers /health with $HEALTH, /status with
 * 401 JSON and / with 200, then the code line the script asks for with -w; pnpm build writes dist/.
 */
const TOOL = `#!/bin/sh
tool=\${0##*/}
printf '%s %s VITE_API_URL=%s\\n' "$tool" "$*" "\${VITE_API_URL-unset}" >> "$CALLS"
[ -n "$ANSWER" ] || { echo "$tool stand-in: no network in a dry run" >&2; exit 1; }
for last in "$@"; do :; done
case "$tool $*" in
  "npx wrangler deployments status"*) printf '%s\\n' "$LIVE_OUT" ;;
  "npx wrangler rollback"*) printf 'Successfully rolled back\\n' ;;
  "npx wrangler deploy "*) printf '%s\\n' "$DEPLOY_OUT" ;;
  "pnpm install --frozen-lockfile") ;;
  "pnpm build") mkdir -p dist/assets && echo 'const contact = "you@example.com";' > dist/assets/index.js ;;
  curl*/health) printf '{"ok":true,"version":"%s"}\\n200 application/json' "$HEALTH" ;;
  curl*/status) printf '{"error":"signed-out"}\\n401 application/json; charset=UTF-8' ;;
  curl*/) printf '<!doctype html>\\n200 text/html' ;;
  *) echo "$tool stand-in: unexpected call" >&2; exit 1 ;;
esac
`;

const gitEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Alex',
  GIT_AUTHOR_EMAIL: 'you@example.com',
  GIT_COMMITTER_NAME: 'Alex',
  GIT_COMMITTER_EMAIL: 'you@example.com',
});
const git = (cwd: string, ...args: string[]): string => execFileSync(REAL_GIT, args, { cwd, env: gitEnv(), encoding: 'utf8' }).trim();

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Checkout { repo: string; bin: string; calls: string; sha: string; short: string }

/** The production config: the staging one renamed bower-api, with a KV namespace of its own. */
const production = (staging: string): string => staging.replace('"name": "bower-staging"', '"name": "bower-api"').replace(STAGING_KV, MADE_UP_KV);

/** A throwaway repository on main with the scripts, the staging config and a production config, one commit, clean. */
function checkout(config: (staging: string) => string = production): Checkout {
  const dir = mkdtempSync(join(tmpdir(), 'bower-cutover-'));
  made.push(dir);
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'api'));
  for (const name of ['cutover.sh', 'rollback.sh', 'deploy-lib.sh']) {
    if (existsSync(join(ROOT, 'scripts', name))) copyFileSync(join(ROOT, 'scripts', name), join(repo, 'scripts', name));
  }
  const staging = readFileSync(join(ROOT, 'api', 'wrangler.jsonc'), 'utf8');
  writeFileSync(join(repo, 'api', 'wrangler.jsonc'), staging);
  writeFileSync(join(repo, CONFIG), config(staging));
  writeFileSync(join(repo, '.gitignore'), 'dist\nnode_modules\n.env*\n.dev.vars\n');
  git(dir, 'init', '-q', '-b', 'main', repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'The app');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const [name, body] of [['git', GIT], ['sleep', '#!/bin/sh\nprintf "sleep %s\\n" "$*" >> "$CALLS"\n'], ...NETWORK.map((n) => [n, TOOL])] as const) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  return { repo, bin, calls: join(dir, 'calls.log'), sha: git(repo, 'rev-parse', 'HEAD'), short: git(repo, 'rev-parse', '--short', 'HEAD') };
}

interface Run { status: number | null; stdout: string; stderr: string; calls: string[] }

function run(at: Checkout, script: 'cutover.sh' | 'rollback.sh', args: string[], env: NodeJS.ProcessEnv = {}): Run {
  rmSync(at.calls, { force: true });
  const out = spawnSync('/bin/bash', [join(at.repo, 'scripts', script), ...args], {
    cwd: at.repo,
    env: {
      ...gitEnv(),
      PATH: `${at.bin}:${process.env.PATH ?? ''}`,
      CALLS: at.calls,
      REAL_GIT,
      VITE_API_URL: 'https://wrong.example.test',
      ANSWER: '',
      LIVE_OUT: `Created: 2026-10-01T09:00:00.000Z\nVersion(s): (100%) ${LIVE}\n    Created: 2026-10-01T09:00:00.000Z`,
      DEPLOY_OUT: 'Uploaded bower-api (2.10 sec)\nDeployed bower-api triggers (0.80 sec)\nCurrent Version ID: 99999999-8888-4777-8666-555555555555',
      HEALTH: at.short,
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const calls = existsSync(at.calls) ? readFileSync(at.calls, 'utf8').trim().split('\n') : [];
  return { status: out.status, stdout: out.stdout, stderr: out.stderr, calls };
}

const networkCalls = (r: Run): string[] => r.calls.filter((c) => !c.startsWith('git ') && !c.startsWith('sleep '));
/** The numbered steps a dry run prints, in order. */
const steps = (r: Run): string[] => r.stdout.split('\n').filter((l) => /^\d+\. /.test(l));

/** A refusal: a non-zero exit, one plain sentence on stderr, and no network call. */
function expectRefused(r: Run, matcher: RegExp): void {
  expect(r.status, r.stderr).not.toBe(0);
  expect(r.stderr.trim()).toMatch(matcher);
  expect(r.stderr.trim().split('\n'), 'one sentence on stderr').toHaveLength(1);
  expect(networkCalls(r)).toEqual([]);
}

describe('cutover-rollback: the production deploy and its rollback, rehearsed with no network', { timeout: 30_000 }, () => {
  it('AC1 cutover-dry-run-steps: a dry run prints the deploy steps in order and calls no network tool', () => {
    const at = checkout();
    const dry = run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, CONFIG]);
    expect(dry.status, dry.stderr).toBe(0);
    expect(networkCalls(dry)).toEqual([]);
    expect(dry.calls.filter((c) => /\b(push|fetch|pull|clone|ls-remote|remote|submodule)\b/.test(c))).toEqual([]);
    const printed = steps(dry);
    const expected = [
      /npx wrangler deployments status --name bower-api/,
      /pnpm install --frozen-lockfile/,
      /env -u VITE_API_URL pnpm build/,
      /dist\//,
      new RegExp(`npx wrangler deploy --config ${CONFIG.replace(/\./g, '\\.')} --var APP_ORIGIN:${ORIGIN} --var API_ORIGIN:${ORIGIN} --var APP_VERSION:${at.short} --var GITHUB_REPO:deluispablo/bower-home`),
      new RegExp(`${ORIGIN}/health.*${at.short}`),
      new RegExp(`${ORIGIN}/status.*401`),
      new RegExp(`scripts/rollback\\.sh .*${ORIGIN}`),
    ];
    expect(printed, dry.stdout).toHaveLength(expected.length);
    expected.forEach((step, i) => expect(printed[i], `step ${i + 1}`).toMatch(step));
    printed.forEach((line, i) => expect(line.startsWith(`${i + 1}. `), line).toBe(true));
  });

  it('AC1 cutover-dry-run-guards: a dry run still refuses what the real run refuses, with no network call', () => {
    // The staging Worker, or the staging KV namespace, in the production config.
    const named = checkout((s) => production(s).replace('"name": "bower-api"', '"name": "bower-staging"'));
    expectRefused(run(named, 'cutover.sh', ['--dry-run', named.sha, ORIGIN, CONFIG]), /bower-api/);
    const kv = checkout((s) => production(s).replace(MADE_UP_KV, STAGING_KV));
    expectRefused(run(kv, 'cutover.sh', ['--dry-run', kv.sha, ORIGIN, CONFIG]), /KV/);
    // A config without the single-page fallback, or without the per-minute limits.
    const spa = checkout((s) => production(s).replace('"not_found_handling": "single-page-application",', ''));
    expectRefused(run(spa, 'cutover.sh', ['--dry-run', spa.sha, ORIGIN, CONFIG]), /single-page/);
    const limits = checkout((s) => production(s).replace(/"ratelimits": \[[\s\S]*?\],\n/, ''));
    expectRefused(run(limits, 'cutover.sh', ['--dry-run', limits.sha, ORIGIN, CONFIG]), /limit/i);
    // A dirty tree, a SHA that is not main's tip, an origin that is not plain https, a missing config.
    const dirty = checkout();
    writeFileSync(join(dirty.repo, 'notes.txt'), 'Alex\n');
    expectRefused(run(dirty, 'cutover.sh', ['--dry-run', dirty.sha, ORIGIN, CONFIG]), /clean|uncommitted/i);
    const branch = checkout();
    git(branch.repo, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(branch.repo, 'feature.txt'), 'new\n');
    git(branch.repo, 'add', '-A');
    git(branch.repo, 'commit', '-q', '-m', 'Feature');
    expectRefused(run(branch, 'cutover.sh', ['--dry-run', git(branch.repo, 'rev-parse', 'HEAD'), ORIGIN, CONFIG]), /main/);
    const at = checkout();
    expectRefused(run(at, 'cutover.sh', ['--dry-run', at.sha, 'http://bower.example.test', CONFIG]), /origin/i);
    expectRefused(run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, 'api/missing.jsonc']), /missing|config/i);
    const short = run(at, 'cutover.sh', ['--dry-run', at.sha]);
    expect(short.status).not.toBe(0);
    expect(networkCalls(short)).toEqual([]);
  });

  it('AC2 rollback-dry-run-steps: a dry run prints the rollback steps in order and calls no network tool', () => {
    const at = checkout();
    const dry = run(at, 'rollback.sh', ['--dry-run', LIVE, ORIGIN]);
    expect(dry.status, dry.stderr).toBe(0);
    expect(networkCalls(dry)).toEqual([]);
    const printed = steps(dry);
    const expected = [
      new RegExp(`npx wrangler rollback ${LIVE} --name bower-api --message `),
      new RegExp(`npx wrangler deployments status --name bower-api.*${LIVE}`),
      new RegExp(`${ORIGIN}/ .*200`),
    ];
    expect(printed, dry.stdout).toHaveLength(expected.length);
    expected.forEach((step, i) => expect(printed[i], `step ${i + 1}`).toMatch(step));
    // Not a version id, or not a plain https origin: refused before anything runs.
    expectRefused(run(at, 'rollback.sh', ['--dry-run', 'latest', ORIGIN]), /version/i);
    expectRefused(run(at, 'rollback.sh', ['--dry-run', LIVE, `${ORIGIN}/path`]), /origin/i);
  });

  it('AC3 cutover-real-order: the real run makes the dry run\'s calls in the same order, then names the rollback', () => {
    const at = checkout();
    const real = run(at, 'cutover.sh', [at.sha, ORIGIN, CONFIG], { ANSWER: '1' });
    expect(real.status, real.stderr).toBe(0);
    const calls = networkCalls(real);
    const order = [
      /^npx wrangler deployments status --name bower-api /,
      /^pnpm install --frozen-lockfile /,
      /^pnpm build VITE_API_URL=unset$/,
      new RegExp(`^npx wrangler deploy --config ${CONFIG.replace(/\./g, '\\.')} --var APP_ORIGIN:${ORIGIN} --var API_ORIGIN:${ORIGIN} --var APP_VERSION:${at.short} --var GITHUB_REPO:deluispablo/bower-home `),
      new RegExp(`^curl .*${ORIGIN}/health `),
      new RegExp(`^curl .*${ORIGIN}/status `),
    ];
    expect(calls, calls.join('\n')).toHaveLength(order.length);
    order.forEach((call, i) => expect(calls[i], `call ${i + 1}`).toMatch(call));
    expect(real.stdout).toContain(`scripts/rollback.sh ${LIVE} ${ORIGIN}`);
  });

  it('AC3 cutover-real-stops: no live version means no deploy; a wrong upload or health names the rollback', () => {
    const at = checkout();
    const unknown = run(at, 'cutover.sh', [at.sha, ORIGIN, CONFIG], { ANSWER: '1', LIVE_OUT: 'Created: 2026-10-01T09:00:00.000Z' });
    expect(unknown.status).not.toBe(0);
    expect(unknown.calls.filter((c) => c.startsWith('pnpm ') || c.startsWith('npx wrangler deploy '))).toEqual([]);
    const staging = run(at, 'cutover.sh', [at.sha, ORIGIN, CONFIG], { ANSWER: '1', DEPLOY_OUT: 'Uploaded bower-staging (2.10 sec)' });
    expect(staging.status).not.toBe(0);
    expect(`${staging.stdout}${staging.stderr}`).toContain(`scripts/rollback.sh ${LIVE} ${ORIGIN}`);
    const stale = run(at, 'cutover.sh', [at.sha, ORIGIN, CONFIG], { ANSWER: '1', HEALTH: 'abc1234' });
    expect(stale.status).not.toBe(0);
    expect(`${stale.stdout}${stale.stderr}`).toContain(`scripts/rollback.sh ${LIVE} ${ORIGIN}`);
  });

  it('AC4 rollback-real-order: the real rollback runs its steps in order and checks the version it named', () => {
    const at = checkout();
    const real = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1' });
    expect(real.status, real.stderr).toBe(0);
    const calls = networkCalls(real);
    const order = [
      new RegExp(`^npx wrangler rollback ${LIVE} --name bower-api --message `),
      /^npx wrangler deployments status --name bower-api /,
      new RegExp(`^curl .*${ORIGIN}/ `),
    ];
    expect(calls, calls.join('\n')).toHaveLength(order.length);
    order.forEach((call, i) => expect(calls[i], `call ${i + 1}`).toMatch(call));
    // Deployments that do not name the version asked for: the rollback did not take.
    const other = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', LIVE_OUT: 'Version(s): (100%) 99999999-8888-4777-8666-555555555555' });
    expect(other.status).not.toBe(0);
    expect(networkCalls(other).filter((c) => c.startsWith('curl '))).toEqual([]);
  });
});
