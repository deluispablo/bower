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
const OTHER = '99999999-8888-4777-8666-555555555555';
/** An id inside a deployment's message, which comes before the versions in wrangler's output. */
const IN_MESSAGE = '22222222-3333-4444-8555-666666666666';
/** A message that even has a line shaped like a version (a line break in --message is the odd case). */
const messageWith = (id: string): string => `Rolled back to ${id}\n(100%) ${id}`;
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
/** Tools that reach the network, or could: each is a stand-in that logs its call. */
const NETWORK = ['pnpm', 'npx', 'wrangler', 'curl', 'wget', 'gh', 'ssh', 'nc'];
/** The pinned wrangler in api/, from the checkout root: plain `npx wrangler` there would fetch a newer one. */
const WRANGLER = 'npx --prefix api wrangler';

const GIT = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$CALLS"
for arg in "$@"; do
  case "$arg" in push|fetch|pull|clone|ls-remote|remote|submodule) echo "git stand-in: no network" >&2; exit 1 ;; esac
done
exec "$REAL_GIT" "$@"
`;

/**
 * One stand-in for every network tool: logs "<tool> <args>"; fails unless $ANSWER is set (a real run). npx answers
 * deployments status with $LIVE_OUT (exit $LIVE_STATUS), a deploy with $DEPLOY_OUT (exit $DEPLOY_STATUS) and a
 * rollback with exit $ROLLBACK_STATUS, and fails when anything is open on its stdin, as wrangler would wait at a prompt on a terminal.
 * curl answers with the n-th item (the last one repeats) of $HEALTH (versions), $STATUS_CODES and $HOME_CODES for
 * that address, then the code line the script asks for with -w; pnpm build writes dist/ from $DIST_TEXT.
 */
const TOOL = `#!/bin/sh
tool=\${0##*/}
printf '%s %s VITE_API_URL=%s\\n' "$tool" "$*" "\${VITE_API_URL-unset}" >> "$CALLS"
[ -n "$ANSWER" ] || { echo "$tool stand-in: no network in a dry run" >&2; exit 1; }
if [ "$tool" = npx ] && [ -n "$(dd bs=1 count=1 2>/dev/null)" ]; then echo "npx stand-in: wrangler could wait at a prompt on stdin" >&2; exit 1; fi
for last in "$@"; do :; done
pick() {
  n=$(grep -cF "$last " "$CALLS")
  v=$(printf '%s' "$1" | cut -d, -f"$n")
  [ -n "$v" ] || v=\${1##*,}
  printf '%s' "$v"
}
case "$tool $*" in
  "npx --prefix api wrangler deployments status"*) printf '%s\\n' "$LIVE_OUT"; exit "\${LIVE_STATUS:-0}" ;;
  "npx --prefix api wrangler rollback"*) printf 'Successfully rolled back\\n'; exit "\${ROLLBACK_STATUS:-0}" ;;
  "npx --prefix api wrangler deploy "*) printf '%s\\n' "$DEPLOY_OUT"; exit "\${DEPLOY_STATUS:-0}" ;;
  "pnpm install --frozen-lockfile") ;;
  "pnpm build") mkdir -p dist/assets && printf '%s\\n' "$DIST_TEXT" > dist/assets/index.js ;;
  curl*/health) printf '{"ok":true,"version":"%s"}\\n200 application/json' "$(pick "$HEALTH")" ;;
  curl*/status)
    code=$(pick "$STATUS_CODES")
    case "$code" in
      401) printf '{"error":"signed-out"}\\n401 application/json; charset=UTF-8' ;;
      *) printf '{"error":"internal"}\\n%s application/json' "$code" ;;
    esac ;;
  curl*/) printf '<!doctype html>\\n%s text/html' "$(pick "$HOME_CODES")" ;;
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

/**
 * What `wrangler deployments status` prints: the deployment's message first, then the versions after the
 * "Version(s):" label, each as "(NN%) <id>" with its details, the next ones indented under the label.
 */
function deployments(shares: Array<[number, string]>, message = '-'): string {
  const versions = shares.map(([pct, id]) => `(${pct}%) ${id}\n    Created:  2026-10-01T09:00:00.000Z\n    Tag:      -\n    Message:  -`);
  const indent = (text: string): string => text.split('\n').join(`\n${' '.repeat(13)}`);
  return `Created:     2026-10-01T09:00:00.000Z\nSource:      Upload\nMessage:     ${indent(message)}\nVersion(s):  ${indent(versions.join('\n\n'))}`;
}

interface Run { status: number | null; stdout: string; stderr: string; calls: string[] }

function run(at: Checkout, script: 'cutover.sh' | 'rollback.sh', args: string[], env: NodeJS.ProcessEnv = {}): Run {
  rmSync(at.calls, { force: true });
  const out = spawnSync('/bin/bash', [join(at.repo, 'scripts', script), ...args], {
    cwd: at.repo,
    // Input waiting on stdin: a tool that leaves its stdin open to it could be answered at a prompt.
    input: 'y\n',
    env: {
      ...gitEnv(),
      PATH: `${at.bin}:${process.env.PATH ?? ''}`,
      CALLS: at.calls,
      REAL_GIT,
      VITE_API_URL: 'https://wrong.example.test',
      ANSWER: '',
      LIVE_OUT: deployments([[100, LIVE]]),
      DEPLOY_OUT: 'Uploaded bower-api (2.10 sec)\nDeployed bower-api triggers (0.80 sec)\nCurrent Version ID: 99999999-8888-4777-8666-555555555555',
      DIST_TEXT: 'const contact = "you@example.com";',
      HEALTH: at.short,
      STATUS_CODES: '401',
      HOME_CODES: '200',
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const calls = existsSync(at.calls) ? readFileSync(at.calls, 'utf8').trim().split('\n') : [];
  return { status: out.status, stdout: out.stdout, stderr: out.stderr, calls };
}

const networkCalls = (r: Run): string[] => r.calls.filter((c) => !c.startsWith('git ') && !c.startsWith('sleep '));
const callsTo = (r: Run, what: string): string[] => r.calls.filter((c) => c.includes(what));
/** The numbered steps a dry run prints, in order. */
const steps = (r: Run): string[] => r.stdout.split('\n').filter((l) => /^\d+\. /.test(l));
const dots = (text: string): string => text.replace(/\./g, '\\.');
const rollbackCommand = `scripts/rollback.sh ${LIVE} ${ORIGIN}`;
/** Seconds the stand-in `sleep` was asked to wait, in all. */
const slept = (r: Run): number => r.calls.filter((c) => c.startsWith('sleep ')).reduce((sum, c) => sum + Number(c.split(' ')[1]), 0);

/** A refusal: a non-zero exit, one plain sentence on stderr, and no network call. */
function expectRefused(r: Run, matcher: RegExp): void {
  expect(r.status, r.stderr).not.toBe(0);
  expect(r.stderr.trim()).toMatch(matcher);
  expect(r.stderr.trim().split('\n'), 'one sentence on stderr').toHaveLength(1);
  expect(r.stderr.trim()).toMatch(/\.$/);
  expect(networkCalls(r)).toEqual([]);
}

const cutover = (at: Checkout, env: NodeJS.ProcessEnv = {}): Run => run(at, 'cutover.sh', [at.sha, ORIGIN, CONFIG], { ANSWER: '1', ...env });
const dryCutover = (at: Checkout, config = CONFIG): Run => run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, config]);

/** The same Worker as the production config, in another layout: properties reordered, comments (one holding the words
 * the guards look for), a URL with // in a string, tabs and trailing commas. The first "name" is not the Worker's. */
const reformatted = (): string => `/* The production Worker. Never bower-staging, never KV ${STAGING_KV}: these words are only in comments. */
{
\t"ratelimits": [ // per-minute limits
\t\t{ "simple": { "period": 60, "limit": 60 }, "namespace_id": "2003", "name": "VAULT_RATE_LIMIT" },
\t\t{ "name": "DRIVE_RATE_LIMIT", "namespace_id": "2002", "simple": { "limit": 30, "period": 60 } },
\t\t{ "name": "AUTH_RATE_LIMIT", "namespace_id": "2001", "simple": { "limit": 20, "period": 60 }, },
\t],
\t"durable_objects": { "bindings": [{ "name": "PERSON", "class_name": "Person" }] },
\t"kv_namespaces": [
\t\t{ "id": "${MADE_UP_KV}", "binding": "BOWER_KV" }, // its own namespace
\t],
\t"vars": { "APP_ORIGIN": "https://app.example.com", /* a // inside a string above */ "GITHUB_REPO": "OWNER/REPO" },
\t"assets": { "run_worker_first": ["/health"], "directory": "../dist", "not_found_handling": "single-page-application" },
\t"main": "src/index.ts",
\t"name": "bower-api", "compatibility_date": "2026-08-22",
}
`;

describe('cutover-rollback: the production deploy and its rollback, rehearsed with no network', { timeout: 60_000 }, () => {
  it('AC1 cutover-dry-run-steps: a dry run prints the deploy steps in order and calls no network tool', () => {
    const at = checkout();
    const dry = run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, CONFIG]);
    expect(dry.status, dry.stderr).toBe(0);
    expect(networkCalls(dry)).toEqual([]);
    expect(dry.calls.filter((c) => /\b(push|fetch|pull|clone|ls-remote|remote|submodule)\b/.test(c))).toEqual([]);
    const printed = steps(dry);
    const expected = [
      new RegExp(`${WRANGLER} deployments status --name bower-api`),
      /pnpm install --frozen-lockfile/,
      /env -u VITE_API_URL pnpm build/,
      /dist\//,
      new RegExp(`${WRANGLER} deploy --config ${dots(CONFIG)} --var APP_ORIGIN:${ORIGIN} --var API_ORIGIN:${ORIGIN} --var APP_VERSION:${at.short} --var GITHUB_REPO:deluispablo/bower-home`),
      new RegExp(`${ORIGIN}/health.*${at.short}`),
      new RegExp(`${ORIGIN}/status.*401`),
      new RegExp(`scripts/rollback\\.sh .*${ORIGIN}`),
    ];
    expect(printed, dry.stdout).toHaveLength(expected.length);
    expected.forEach((step, i) => expect(printed[i], `step ${i + 1}`).toMatch(step));
    printed.forEach((line, i) => expect(line.startsWith(`${i + 1}. `), line).toBe(true));
    // The repository comes from BOWER_GITHUB_REPO when it is set, and an invalid one is refused.
    const repo = run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, CONFIG], { BOWER_GITHUB_REPO: 'OWNER/bower-home' });
    expect(steps(repo)[4]).toContain('--var GITHUB_REPO:OWNER/bower-home');
    expectRefused(run(at, 'cutover.sh', ['--dry-run', at.sha, ORIGIN, CONFIG], { BOWER_GITHUB_REPO: 'not a repository' }), /repository/);
  });

  it('AC1 cutover-dry-run-guards: a dry run still refuses what the real run refuses, with no network call', () => {
    // The staging Worker, or the staging KV namespace, in the production config.
    const named = checkout((s) => production(s).replace('"name": "bower-api"', '"name": "bower-staging"'));
    expectRefused(dryCutover(named), /bower-api/);
    const kv = checkout((s) => production(s).replace(MADE_UP_KV, STAGING_KV));
    expectRefused(dryCutover(kv), /KV/);
    // The staging namespace under another binding, as well as a BOWER_KV of its own.
    const second = checkout((s) => production(s).replace('"kv_namespaces": [', `"kv_namespaces": [{ "binding": "OLD_KV", "id": "${STAGING_KV}" }, `));
    expectRefused(dryCutover(second), /staging KV/);
    // No BOWER_KV binding at all, an empty id, or the binding under another name: production needs a namespace of its own.
    const none = checkout((s) => production(s).replace(/"kv_namespaces": \[[^\]]*\],\n/, ''));
    expectRefused(dryCutover(none), /BOWER_KV/);
    const empty = checkout((s) => production(s).replace(MADE_UP_KV, ''));
    expectRefused(dryCutover(empty), /BOWER_KV/);
    const renamed = checkout((s) => production(s).replace('"binding": "BOWER_KV"', '"binding": "OTHER_KV"'));
    expectRefused(dryCutover(renamed), /BOWER_KV/);
    // A config without the single-page fallback, or without each of the per-minute limits.
    const spa = checkout((s) => production(s).replace('"not_found_handling": "single-page-application",', ''));
    expectRefused(dryCutover(spa), /single-page/);
    const limits = checkout((s) => production(s).replace(/"ratelimits": \[[\s\S]*?\],\n/, ''));
    expectRefused(dryCutover(limits), /limit/i);
    for (const limit of ['AUTH_RATE_LIMIT', 'DRIVE_RATE_LIMIT', 'VAULT_RATE_LIMIT']) {
      const one = checkout((s) => production(s).replace(`"name": "${limit}"`, `"name": "${limit}_OLD"`));
      expectRefused(dryCutover(one), new RegExp(`${limit},`));
    }
    // A dirty tree, a SHA that is not main's tip, an origin that is not plain https, a missing config.
    const dirty = checkout();
    writeFileSync(join(dirty.repo, 'notes.txt'), 'Alex\n');
    expectRefused(dryCutover(dirty), /clean|uncommitted/i);
    const branch = checkout();
    git(branch.repo, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(branch.repo, 'feature.txt'), 'new\n');
    git(branch.repo, 'add', '-A');
    git(branch.repo, 'commit', '-q', '-m', 'Feature');
    expectRefused(run(branch, 'cutover.sh', ['--dry-run', git(branch.repo, 'rev-parse', 'HEAD'), ORIGIN, CONFIG]), /main/);
    const at = checkout();
    expectRefused(run(at, 'cutover.sh', ['--dry-run', at.sha, 'http://bower.example.test', CONFIG]), /origin/i);
    expectRefused(dryCutover(at, 'api/missing.jsonc'), /missing|config/i);
    const short = run(at, 'cutover.sh', ['--dry-run', at.sha]);
    expect(short.status).not.toBe(0);
    expect(networkCalls(short)).toEqual([]);
    // An env file Vite would read, ignored or not.
    writeFileSync(join(at.repo, '.env.production'), 'VITE_API_URL=https://wrong.example.test\n');
    expectRefused(dryCutover(at), /\.env\.production/);
    rmSync(join(at.repo, '.env.production'));
    // The production config is a file in api/ other than the staging one, and it parses.
    for (const where of ['api/wrangler.jsonc', 'wrangler.production.jsonc', 'api/../api/wrangler.production.jsonc', 'api/sub/wrangler.jsonc']) {
      expectRefused(dryCutover(at, where), /file in api\/ other than api\/wrangler\.jsonc/);
    }
    const broken = checkout(() => '{ "name": "bower-api", ');
    expectRefused(dryCutover(broken), /config/);
  });

  it('AC1 cutover-config-syntax: the config is read as JSON with comments, in any layout, not by its text', () => {
    // The same Worker, reformatted: it passes the guards and prints the same 8 steps.
    const at = checkout(reformatted);
    const dry = dryCutover(at);
    expect(dry.status, dry.stderr).toBe(0);
    expect(steps(dry)).toHaveLength(8);
    expect(networkCalls(dry)).toEqual([]);
    // The same layout still refuses what it should: the Worker's name (not the first "name" in the text), the staging
    // namespace as a value (not in a comment), and a binding or a limit missing.
    const named = checkout(() => reformatted().replace('"name": "bower-api"', '"name": "bower-staging"'));
    expectRefused(dryCutover(named), /bower-api/);
    const staging = checkout(() => reformatted().replace(`"id": "${MADE_UP_KV}"`, `"id": "${STAGING_KV}"`));
    expectRefused(dryCutover(staging), /staging KV/);
    const noKv = checkout(() => reformatted().replace('"binding": "BOWER_KV"', '"binding": "KV"'));
    expectRefused(dryCutover(noKv), /BOWER_KV/);
    const noLimit = checkout(() => reformatted().replace('"name": "AUTH_RATE_LIMIT"', '"name": "AUTH"'));
    expectRefused(dryCutover(noLimit), /AUTH_RATE_LIMIT/);
  });

  it('AC2 rollback-dry-run-steps: a dry run prints the rollback steps in order and calls no network tool', () => {
    const at = checkout();
    const dry = run(at, 'rollback.sh', ['--dry-run', LIVE, ORIGIN]);
    expect(dry.status, dry.stderr).toBe(0);
    expect(networkCalls(dry)).toEqual([]);
    const printed = steps(dry);
    const expected = [
      new RegExp(`${WRANGLER} rollback ${LIVE} --name bower-api --message `),
      new RegExp(`${WRANGLER} deployments status --name bower-api.*${LIVE}`),
      new RegExp(`${ORIGIN}/ .*200`),
    ];
    expect(printed, dry.stdout).toHaveLength(expected.length);
    expected.forEach((step, i) => expect(printed[i], `step ${i + 1}`).toMatch(step));
    // Not a version id, or not a plain https origin: refused before anything runs.
    expectRefused(run(at, 'rollback.sh', ['--dry-run', 'latest', ORIGIN]), /version/i);
    expectRefused(run(at, 'rollback.sh', ['--dry-run', LIVE, `${ORIGIN}/path`]), /origin/i);
    expectRefused(run(at, 'rollback.sh', ['--dry-run', LIVE, 'http://bower.example.test']), /origin/i);
    // It needs no clean tree: a hurried rollback runs from any state of the checkout.
    writeFileSync(join(at.repo, 'notes.txt'), 'Alex\n');
    const dirty = run(at, 'rollback.sh', ['--dry-run', LIVE, ORIGIN]);
    expect(dirty.status, dirty.stderr).toBe(0);
    expect(steps(dirty)).toHaveLength(3);
  });

  it('AC3 cutover-real-order: the real run makes the dry run\'s calls in the same order, then names the rollback', () => {
    const at = checkout();
    const real = cutover(at);
    expect(real.status, real.stderr).toBe(0);
    const calls = networkCalls(real);
    const order = [
      new RegExp(`^${WRANGLER} deployments status --name bower-api `),
      /^pnpm install --frozen-lockfile /,
      /^pnpm build VITE_API_URL=unset$/,
      new RegExp(`^${WRANGLER} deploy --config ${dots(CONFIG)} --var APP_ORIGIN:${ORIGIN} --var API_ORIGIN:${ORIGIN} --var APP_VERSION:${at.short} --var GITHUB_REPO:deluispablo/bower-home `),
      new RegExp(`^curl .*${ORIGIN}/health `),
      new RegExp(`^curl .*${ORIGIN}/status `),
    ];
    expect(calls, calls.join('\n')).toHaveLength(order.length);
    order.forEach((call, i) => expect(calls[i], `call ${i + 1}`).toMatch(call));
    expect(real.stdout).toContain(rollbackCommand);
    expect(real.stdout.trim().split('\n').pop(), 'it ends with the way back').toContain(rollbackCommand);
    // Nothing waited, and none of the checks was repeated.
    expect(slept(real)).toBe(0);
  });

  it('AC3 cutover-real-stops: no live version means no deploy; a wrong upload or health names the rollback', () => {
    const at = checkout();
    const unknown = cutover(at, { LIVE_OUT: 'Created: 2026-10-01T09:00:00.000Z' });
    expect(unknown.status).not.toBe(0);
    expect(unknown.calls.filter((c) => c.startsWith('pnpm ') || c.startsWith('npx --prefix api wrangler deploy '))).toEqual([]);
    expect(unknown.stderr).toMatch(/no live version/);
    const staging = cutover(at, { DEPLOY_OUT: 'Uploaded bower-staging (2.10 sec)' });
    expect(staging.status).not.toBe(0);
    expect(staging.stderr).toMatch(/bower-staging/);
    expect(staging.stderr).toContain(rollbackCommand);
    expect(callsTo(staging, 'curl ')).toEqual([]);
    const noUpload = cutover(at, { DEPLOY_OUT: 'Total Upload: 1.00 KiB' });
    expect(noUpload.status).not.toBe(0);
    expect(noUpload.stderr).toMatch(/no upload line for bower-api/);
    expect(noUpload.stderr).toContain(rollbackCommand);
    expect(callsTo(noUpload, 'curl ')).toEqual([]);
    const stale = cutover(at, { HEALTH: 'abc1234' });
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain(rollbackCommand);
    // The deploy's own reply may be lost: wrangler failing after step 1 names the way back too, and nothing is checked.
    const lost = cutover(at, { DEPLOY_STATUS: '1' });
    expect(lost.status).not.toBe(0);
    expect(lost.stderr).toContain(rollbackCommand);
    expect(callsTo(lost, 'curl ')).toEqual([]);
    // A scan hit in dist/ stops before the deploy, and still names the way back; the value is never printed.
    const leak = cutover(at, { DIST_TEXT: 'const owner = "alex.real@company.test";' });
    expect(leak.status).not.toBe(0);
    expect(leak.stderr).toContain(rollbackCommand);
    expect(`${leak.stdout}${leak.stderr}`).not.toContain('alex.real@company.test');
    expect(callsTo(leak, ' wrangler deploy ')).toEqual([]);
  });

  it('AC3 cutover-real-live-version: the live version is the one at 100% in the Version(s) list; a split deploys nothing', () => {
    const at = checkout();
    // An id earlier in the output, in the deployment's message, is not the live version.
    const noisy = cutover(at, { LIVE_OUT: deployments([[100, LIVE]], messageWith(IN_MESSAGE)) });
    expect(noisy.status, noisy.stderr).toBe(0);
    expect(noisy.stdout).toContain(rollbackCommand);
    expect(noisy.stdout).not.toContain(`scripts/rollback.sh ${IN_MESSAGE}`);
    // Several live versions: nothing is deployed, and the versions and their shares are printed.
    const split = cutover(at, { LIVE_OUT: deployments([[60, LIVE], [40, OTHER]], messageWith(IN_MESSAGE)) });
    expect(split.status).not.toBe(0);
    expect(callsTo(split, 'pnpm ')).toEqual([]);
    expect(callsTo(split, ' wrangler deploy ')).toEqual([]);
    expect(split.stderr.trim().split('\n'), 'one sentence on stderr').toHaveLength(1);
    expect(split.stderr).toContain(`${LIVE} 60%`);
    expect(split.stderr).toContain(`${OTHER} 40%`);
    expect(split.stderr).not.toContain(IN_MESSAGE);
    expect(split.stderr, 'nothing to go back to yet').not.toContain('rollback.sh');
    // One version that does not carry all the traffic is no single version to return to either.
    const partial = cutover(at, { LIVE_OUT: deployments([[50, LIVE]]) });
    expect(partial.status).not.toBe(0);
    expect(callsTo(partial, 'pnpm ')).toEqual([]);
    expect(partial.stderr).toContain(`${LIVE} 50%`);
    // Wrangler failing on step 1 deploys nothing either.
    const failed = cutover(at, { LIVE_OUT: 'The Worker bower-api has no deployments.', LIVE_STATUS: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toMatch(/deployments/);
    expect(callsTo(failed, 'pnpm ')).toEqual([]);
    expect(failed.stderr, 'no live version is known to go back to').not.toContain('rollback.sh');
  });

  it('AC3 cutover-real-retries: a health check and a status check that disagree at first are repeated, within bounds', () => {
    const at = checkout();
    // The first /health still names the previous version and /status is 500 twice during version skew.
    const ok = cutover(at, { HEALTH: `0000000,${at.short}`, STATUS_CODES: '500,500,401' });
    expect(ok.status, ok.stderr).toBe(0);
    const kinds = networkCalls(ok).map((c) => (c.includes('/health ') ? 'health' : c.includes('/status ') ? 'status' : c.split(' ')[0]));
    expect(kinds).toEqual(['npx', 'pnpm', 'pnpm', 'npx', 'health', 'health', 'status', 'status', 'status']);
    expect(ok.calls.filter((c) => c.startsWith('sleep '))).toHaveLength(3);
    expect(ok.stdout.trim().split('\n').pop()).toContain(rollbackCommand);
    // A /health that still disagrees after one rerun fails and never reaches /status.
    const stale = cutover(at, { HEALTH: '0000000' });
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toContain(at.short);
    expect(stale.stderr).toContain(rollbackCommand);
    expect(stale.calls.filter((c) => c.includes('/health '))).toHaveLength(2);
    expect(callsTo(stale, '/status ')).toEqual([]);
    // A /status that never answers 401 JSON: bounded tries and waits, then it says so and names the way back.
    for (const codes of ['500', '200']) {
      const skew = cutover(at, { STATUS_CODES: codes });
      expect(skew.status, codes).not.toBe(0);
      expect(skew.stderr, codes).toMatch(/5 minutes/);
      expect(skew.stderr, codes).toContain(rollbackCommand);
      expect(callsTo(skew, '/status ').length, codes).toBeGreaterThan(1);
      expect(callsTo(skew, '/status ').length, codes).toBeLessThanOrEqual(15);
      expect(slept(skew), codes).toBeLessThanOrEqual(310);
    }
  });

  it('AC3 stdin: every wrangler call runs with nothing on its stdin, so it can never wait at a prompt', () => {
    const at = checkout();
    // The stand-in itself fails when something waits on its stdin, as the positive control for every real run here.
    const stand = (input: string): number | null =>
      spawnSync(join(at.bin, 'npx'), ['--prefix', 'api', 'wrangler', 'rollback', LIVE], { input, env: { ...process.env, CALLS: at.calls, ANSWER: '1' } }).status;
    expect(stand('y\n')).toBe(1);
    expect(stand('')).toBe(0);
    // And the scripts' calls pass it: the deployments, the deploy and the rollback all ran.
    const real = cutover(at);
    expect(real.status, real.stderr).toBe(0);
    expect(real.calls.filter((c) => c.startsWith('npx '))).toHaveLength(2);
    const back = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1' });
    expect(back.status, back.stderr).toBe(0);
    expect(back.calls.filter((c) => c.startsWith('npx '))).toHaveLength(2);
  });

  it('AC4 rollback-real-order: the real rollback runs its steps in order and checks the version it named', () => {
    const at = checkout();
    const real = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1' });
    expect(real.status, real.stderr).toBe(0);
    const calls = networkCalls(real);
    const order = [
      new RegExp(`^${WRANGLER} rollback ${LIVE} --name bower-api --message `),
      new RegExp(`^${WRANGLER} deployments status --name bower-api `),
      new RegExp(`^curl .*${ORIGIN}/ `),
    ];
    expect(calls, calls.join('\n')).toHaveLength(order.length);
    order.forEach((call, i) => expect(calls[i], `call ${i + 1}`).toMatch(call));
    expect(slept(real)).toBe(0);
    // Deployments that do not name the version asked for: the rollback did not take.
    const other = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', LIVE_OUT: deployments([[100, OTHER]]) });
    expect(other.status).not.toBe(0);
    expect(networkCalls(other).filter((c) => c.startsWith('curl '))).toEqual([]);
    // A split that holds the version is no rollback either: the version must carry all the traffic.
    const split = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', LIVE_OUT: deployments([[60, LIVE], [40, OTHER]], messageWith(LIVE)) });
    expect(split.status).not.toBe(0);
    expect(split.stderr).toContain(`${LIVE} 60%`);
    expect(split.stderr).toContain(`${OTHER} 40%`);
    expect(callsTo(split, 'curl ')).toEqual([]);
    // The version is only in the deployment's message, not in its list; and an empty list.
    const message = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', LIVE_OUT: deployments([[100, OTHER]], messageWith(LIVE)) });
    expect(message.status).not.toBe(0);
    expect(callsTo(message, 'curl ')).toEqual([]);
    const none = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', LIVE_OUT: 'Created: 2026-10-01T09:00:00.000Z' });
    expect(none.status).not.toBe(0);
    expect(callsTo(none, 'curl ')).toEqual([]);
    // Wrangler failing to roll back stops at once: nothing is checked after it.
    const failed = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', ROLLBACK_STATUS: '1' });
    expect(failed.status).not.toBe(0);
    expect(networkCalls(failed)).toHaveLength(1);
    // It needs no clean tree: run from a dirty checkout, it still rolls back.
    writeFileSync(join(at.repo, 'notes.txt'), 'Alex\n');
    expect(run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1' }).status).toBe(0);
  });

  it('AC4 rollback-site: the site is checked, rerun once after a wait, and a site that does not answer 200 fails', () => {
    const at = checkout();
    const slow = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', HOME_CODES: '503,200' });
    expect(slow.status, slow.stderr).toBe(0);
    expect(callsTo(slow, `${ORIGIN}/ `)).toHaveLength(2);
    expect(slept(slow)).toBe(10);
    const down = run(at, 'rollback.sh', [LIVE, ORIGIN], { ANSWER: '1', HOME_CODES: '503' });
    expect(down.status).not.toBe(0);
    expect(down.stderr).toMatch(/503/);
    expect(callsTo(down, `${ORIGIN}/ `)).toHaveLength(2);
  });
});
