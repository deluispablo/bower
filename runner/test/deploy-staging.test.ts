import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * scripts/deploy-staging.sh (TL-P3-24), run with macOS's stock bash against a throwaway copy of the
 * repository. Every external command it calls (git, pnpm, npx, wrangler, curl, sleep) is a stand-in on
 * PATH: nothing is built, deployed or fetched. The git stand-in passes local commands to the real git and
 * refuses any that would reach a remote.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'deploy-staging.sh');
const ORIGIN = 'https://bower-staging.example.test';
/** A real id read where it lives, never spelled in a test (sec-hardening L1). */
const idIn = (file: string, pattern: RegExp): string => {
  const id = pattern.exec(readFileSync(join(ROOT, file), 'utf8'))?.[1];
  if (!id) throw new Error(`no KV namespace id in ${file}`);
  return id;
};
const PRODUCTION_KV = idIn('scripts/deploy-staging.sh', /^PRODUCTION_KV='([0-9a-f]{32})'$/m);
const STAGING_KV = idIn('api/wrangler.jsonc', /"binding":\s*"BOWER_KV",\s*"id":\s*"([0-9a-f]{32})"/);
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

const GIT = `#!/bin/sh
printf 'git %s\\n' "$*" >> "$CALLS"
for arg in "$@"; do
  case "$arg" in push|fetch|pull|clone|ls-remote|remote|submodule) echo "git stub: no network: $*" >&2; exit 1 ;; esac
done
exec "$REAL_GIT" "$@"
`;

/** pnpm: install does nothing; build writes dist/ from $DIST_TEXT; the runner build writes its bundle. */
const PNPM = `#!/bin/sh
printf 'pnpm %s VITE_API_URL=%s in %s\\n' "$*" "\${VITE_API_URL-unset}" "\${PWD##*/}" >> "$CALLS"
case "$*" in
  "install --frozen-lockfile") exit 0 ;;
  build) mkdir -p dist/assets && printf '%s\\n' "$DIST_TEXT" > dist/assets/index.js && { [ -z "$DIST_EXTRA" ] || printf '%s\\n' "$DIST_EXTRA_TEXT" > "dist/assets/$DIST_EXTRA"; } && printf '<html></html>\\n' > dist/index.html; exit 0 ;;
  "-C runner build") mkdir -p runner/dist && printf '%s\\n' "$RUNNER_TEXT" > runner/dist/runner.mjs; exit 0 ;;
esac
echo "pnpm stub: unexpected call: $*" >&2
exit 1
`;

const NPX = `#!/bin/sh
printf 'npx %s in %s\\n' "$*" "\${PWD##*/}" >> "$CALLS"
printf '%s\\n' "$WRANGLER_OUT"
exit "\${WRANGLER_STATUS:-0}"
`;

const WRANGLER = `#!/bin/sh
printf 'wrangler %s\\n' "$*" >> "$CALLS"
echo "wrangler stub: call it through npx" >&2
exit 1
`;

/**
 * curl: answers /health with the next version in $HEALTH_VERSIONS and /status with the next code in
 * $STATUS_CODES (comma lists; the last item repeats), printing the body, then a line with the code and type,
 * as the script asks with -w.
 */
const CURL = `#!/bin/sh
prev=''
for url in "$@"; do [ "$prev" = --max-time ] && printf '%s\\n' "$url" >> "$CALLS.maxtime"; prev=$url; done
printf 'curl %s\\n' "$url" >> "$CALLS"
next() {
  n=$(cat "$STATE/$1" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$STATE/$1"
  v=$(printf '%s' "$2" | cut -d, -f"$n")
  [ -n "$v" ] || v=$(printf '%s' "$2" | awk -F, '{print $NF}')
  printf '%s' "$v"
}
case "$url" in
  */health) v=$(next health "$HEALTH_VERSIONS"); printf '{"ok":true,"version":"%s"}\\n200 application/json' "$v" ;;
  */status)
    code=$(next status "$STATUS_CODES")
    case "$code" in
      401) printf '{"error":"signed-out"}\\n401 application/json; charset=UTF-8' ;;
      html) printf '<!doctype html>\\n200 text/html' ;;
      *) printf '{"error":"internal"}\\n%s application/json' "$code" ;;
    esac ;;
  *) echo "curl stub: unexpected url: $url" >&2; exit 7 ;;
esac
`;

const SLEEP = `#!/bin/sh
printf 'sleep %s\\n' "$*" >> "$CALLS"
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

interface Checkout {
  repo: string;
  bin: string;
  calls: string;
  state: string;
  sha: string;
  short: string;
}

/** A throwaway repository on main with the script and the real Worker config, one commit, clean. */
function checkout(): Checkout {
  const dir = mkdtempSync(join(tmpdir(), 'bower-deploy-'));
  made.push(dir);
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'api'));
  mkdirSync(join(repo, 'runner'));
  copyFileSync(SCRIPT, join(repo, 'scripts', 'deploy-staging.sh'));
  // The guards it shares with the production cutover (cutover-rollback R3), once they live in their own file.
  if (existsSync(join(ROOT, 'scripts', 'deploy-lib.sh'))) copyFileSync(join(ROOT, 'scripts', 'deploy-lib.sh'), join(repo, 'scripts', 'deploy-lib.sh'));
  copyFileSync(join(ROOT, 'api', 'wrangler.jsonc'), join(repo, 'api', 'wrangler.jsonc'));
  writeFileSync(join(repo, 'runner', 'package.json'), '{}\n');
  writeFileSync(join(repo, '.gitignore'), 'dist\nnode_modules\n.env*\n.dev.vars\n');
  git(dir, 'init', '-q', '-b', 'main', repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'The app');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const stubs: Record<string, string> = { git: GIT, pnpm: PNPM, npx: NPX, wrangler: WRANGLER, curl: CURL, sleep: SLEEP };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const state = join(dir, 'state');
  mkdirSync(state);
  const sha = git(repo, 'rev-parse', 'HEAD');
  return { repo, bin, calls: join(dir, 'calls.log'), state, sha, short: git(repo, 'rev-parse', '--short', 'HEAD') };
}

/** Commits a change to the Worker config, so the tree is clean and HEAD is main's tip. */
function commitConfig(at: Checkout, edit: (config: string) => string): string {
  const path = join(at.repo, 'api', 'wrangler.jsonc');
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
  git(at.repo, 'commit', '-q', '-am', 'Config');
  return git(at.repo, 'rev-parse', 'HEAD');
}

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[];
}

function run(at: Checkout, args: string[], env: NodeJS.ProcessEnv = {}): Run {
  rmSync(at.calls, { force: true });
  rmSync(at.state, { recursive: true, force: true });
  mkdirSync(at.state);
  const out = spawnSync('/bin/bash', [join(at.repo, 'scripts', 'deploy-staging.sh'), ...args], {
    cwd: at.repo,
    env: {
      ...gitEnv(),
      PATH: `${at.bin}:${process.env.PATH ?? ''}`,
      CALLS: at.calls,
      STATE: at.state,
      REAL_GIT,
      VITE_API_URL: 'https://wrong.example.test',
      DIST_EXTRA: '',
      DIST_EXTRA_TEXT: '',
      DIST_TEXT: 'const contact = "you@example.com";',
      RUNNER_TEXT: 'export {};',
      WRANGLER_OUT: 'Uploaded bower-staging (2.10 sec)\nDeployed bower-staging triggers (0.80 sec)\nCurrent Version ID: 0000aaaa',
      HEALTH_VERSIONS: at.short,
      STATUS_CODES: '401',
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const calls = existsSync(at.calls) ? readFileSync(at.calls, 'utf8').trim().split('\n') : [];
  return { status: out.status, stdout: out.stdout, stderr: out.stderr, calls };
}

/** A refusal: a non-zero exit with one plain sentence on stderr, and nothing deployed. */
function expectRefused(result: Run, matcher: RegExp): void {
  expect(result.stderr.trim(), result.stderr).toMatch(matcher);
  expect(result.stderr.trim().split('\n'), 'one sentence on stderr').toHaveLength(1);
  expect(result.stderr.trim()).toMatch(/\.$/);
  expect(result.status).not.toBe(0);
  expect(result.calls.filter((c) => /^(npx|wrangler|curl)/.test(c))).toEqual([]);
}

// Each case runs the whole script with stubbed tools; under a loaded machine that takes seconds.
describe('deploy-staging.sh', { timeout: 30_000 }, () => {
  it('deploy-staging refuses production and dirty checkouts', () => {
    // The original app's production Worker, by name.
    const named = checkout();
    const apiSha = commitConfig(named, (c) => c.replace('"name": "bower-staging"', '"name": "bower-api"'));
    expectRefused(run(named, [apiSha, ORIGIN]), /bower-api/);

    // Any other name is refused too, as is a config without the single-page fallback.
    const other = checkout();
    const otherSha = commitConfig(other, (c) => c.replace('"name": "bower-staging"', '"name": "bower-other"'));
    expectRefused(run(other, [otherSha, ORIGIN]), /bower-staging/);
    const spa = checkout();
    const spaSha = commitConfig(spa, (c) => c.replace('"not_found_handling": "single-page-application",', ''));
    expectRefused(run(spa, [spaSha, ORIGIN]), /single-page/);

    // Production's KV namespace, or anything but the staging one.
    const kv = checkout();
    const kvSha = commitConfig(kv, (c) => c.replace(STAGING_KV, PRODUCTION_KV));
    expectRefused(run(kv, [kvSha, ORIGIN]), /KV/);

    // A dirty tree: a changed file, then an untracked one.
    const dirty = checkout();
    writeFileSync(join(dirty.repo, 'api', 'wrangler.jsonc'), `${readFileSync(join(dirty.repo, 'api', 'wrangler.jsonc'), 'utf8')}\n`);
    expectRefused(run(dirty, [dirty.sha, ORIGIN]), /clean|uncommitted/i);
    const untracked = checkout();
    writeFileSync(join(untracked.repo, 'notes.txt'), 'Alex\n');
    expectRefused(run(untracked, [untracked.sha, ORIGIN]), /clean|uncommitted/i);

    // A SHA that is not main's tip: a branch commit checked out, then an older main commit checked out.
    const branch = checkout();
    git(branch.repo, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(branch.repo, 'feature.txt'), 'new\n');
    git(branch.repo, 'add', '-A');
    git(branch.repo, 'commit', '-q', '-m', 'Feature');
    expectRefused(run(branch, [git(branch.repo, 'rev-parse', 'HEAD'), ORIGIN]), /main/);
    const older = checkout();
    commitConfig(older, (c) => `${c}\n`);
    git(older.repo, 'checkout', '-q', older.sha);
    expectRefused(run(older, [older.sha, ORIGIN]), /main/);
    // HEAD is main's tip, but the SHA asked for is not HEAD.
    const asked = checkout();
    const newer = commitConfig(asked, (c) => `${c}\n`);
    expect(newer).not.toBe(asked.sha);
    expectRefused(run(asked, [asked.sha, ORIGIN]), /HEAD|main/);

    // An origin that is not a plain https origin, and a missing argument.
    const origin = checkout();
    expectRefused(run(origin, [origin.sha, 'http://bower-staging.example.test']), /origin/i);
    expectRefused(run(origin, [origin.sha, `${ORIGIN}/path`]), /origin/i);
    expect(run(origin, [origin.sha]).status).not.toBe(0);

    // A scan hit in dist/: an address other than you@example.com, then each secret pattern. The value is never printed.
    const scan = checkout();
    const leakedAddress = run(scan, [scan.sha, ORIGIN], { DIST_TEXT: 'const contact = "you@example.com"; const owner = "alex.real@company.test";' });
    expectRefused(leakedAddress, /address/i);
    expect(`${leakedAddress.stdout}${leakedAddress.stderr}`).not.toContain('alex.real@company.test');
    expect(leakedAddress.calls).toContain(`pnpm build VITE_API_URL=unset in repo`);
    const secrets = [
      'ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234',
      'github_pat_FAKEFAKEFAKE_FAKEFAKEFAKE',
      'sk-ant-api03-FAKEFAKEFAKE',
      'AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE123',
      'ya29.FAKEFAKEFAKEFAKE',
      '-----BEGIN PRIVATE KEY-----',
      '-----BEGIN RSA PRIVATE KEY-----',
    ];
    for (const secret of secrets) {
      const hit = run(scan, [scan.sha, ORIGIN], { DIST_TEXT: `const key = "${secret}";` });
      expectRefused(hit, /secret/i);
      expect(`${hit.stdout}${hit.stderr}`, secret).not.toContain(secret);
    }

    // No refusal ever ran wrangler or reached a remote.
    expect(readFileSync(named.calls, 'utf8')).not.toMatch(/^(npx|wrangler)/m);
  });

  it('the deploy scan allows the unpdf literal and still refuses a real address', () => {
    const at = checkout();
    // A bundle with only the unpdf literal should pass.
    const literalText = 'const obfuscated = "jm@kbswfq.pkbgltMlwbaof";';
    const withLiteral = run(at, [at.sha, ORIGIN], { DIST_TEXT: literalText });
    expect(withLiteral.status).toBe(0);
    // A bundle with the literal plus a real address should refuse.
    const mixedText =
      'const obfuscated = "jm@kbswfq.pkbgltMlwbaof"; const contact = "alex@company.test";';
    const withBoth = run(at, [at.sha, ORIGIN], { DIST_TEXT: mixedText });
    expectRefused(withBoth, /address/i);
    expect(`${withBoth.stdout}${withBoth.stderr}`).not.toContain('alex@company.test');
  });

  it('the deploy scan passes the real unpdf bundle line and still refuses a real address', () => {
    const at = checkout();
    // The real unpdf bundle line extracted from the library, with the full token.
    const realBundleLine =
      'ufqwz`kbnafqOjujmd#ulovnfpBmwklmzoldjm!#QfobwfgF`lmlnzqfb`kfp`vwwjmd' +
      'dqbujwzojef#jm@kbswfq.pkbgltMlwbaof?,wg=	#qfwvqmpwbgjvntjgdfwpubqz';
    const withRealBundle = run(at, [at.sha, ORIGIN], { DIST_TEXT: realBundleLine });
    expect(withRealBundle.status).toBe(0);
    // The bundle line plus a real address should refuse.
    const mixedText = `${realBundleLine} const contact = "alex@larkspur.example.org";`;
    const withBoth = run(at, [at.sha, ORIGIN], { DIST_TEXT: mixedText });
    expectRefused(withBoth, /address/i);
    expect(`${withBoth.stdout}${withBoth.stderr}`).not.toContain('alex@larkspur.example.org');
  });

  it('deploy-staging deploys a clean main SHA and checks health', () => {
    const at = checkout();
    // The first /health still names the previous version, and /status is 500 twice during version skew.
    const ok = run(at, [at.sha, `${ORIGIN}/`], { HEALTH_VERSIONS: `0000000,${at.short}`, STATUS_CODES: '500,500,401' });
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    expect(ok.calls.filter((c) => !c.startsWith('git ') && !c.startsWith('sleep '))).toEqual([
      'pnpm install --frozen-lockfile VITE_API_URL=https://wrong.example.test in repo',
      'pnpm build VITE_API_URL=unset in repo',
      `npx wrangler deploy --var APP_ORIGIN:${ORIGIN} --var API_ORIGIN:${ORIGIN} --var APP_VERSION:${at.short} --var GITHUB_REPO:deluispablo/bower-home in api`,
      `curl ${ORIGIN}/health`,
      `curl ${ORIGIN}/health`,
      `curl ${ORIGIN}/status`,
      `curl ${ORIGIN}/status`,
      `curl ${ORIGIN}/status`,
      'pnpm -C runner build VITE_API_URL=https://wrong.example.test in repo',
    ]);
    expect(ok.calls.filter((c) => c.startsWith('sleep '))).toHaveLength(3);
    expect(ok.calls.filter((c) => c.startsWith('git ') && /\b(push|fetch|pull|remote)\b/.test(c))).toEqual([]);
    expect(ok.stdout).toContain(at.short);
    expect(ok.stdout).toContain(join(at.repo, 'runner', 'dist', 'runner.mjs'));
    expect(ok.stdout).toContain('scripts/new-instance.sh');
    expect(ok.stdout).not.toMatch(/secret/i);

    // The instance repository comes from BOWER_GITHUB_REPO when it is set.
    const repo = run(at, [at.sha, ORIGIN], { BOWER_GITHUB_REPO: 'OWNER/bower-home' });
    expect(repo.status).toBe(0);
    expect(repo.calls.find((c) => c.startsWith('npx '))).toContain('--var GITHUB_REPO:OWNER/bower-home in api');

    // Wrangler's output must name bower-staging, never bower-api.
    const wrongWorker = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: 'Uploaded bower-api (2.10 sec)' });
    expect(wrongWorker.status).not.toBe(0);
    expect(wrongWorker.stderr).toMatch(/bower-staging/);
    expect(wrongWorker.calls.filter((c) => c.startsWith('curl '))).toEqual([]);
    const failed = run(at, [at.sha, ORIGIN], { WRANGLER_STATUS: '1' });
    expect(failed.status).not.toBe(0);
    expect(failed.calls.filter((c) => c.startsWith('curl '))).toEqual([]);

    // /health that still disagrees after one rerun fails.
    const stale = run(at, [at.sha, ORIGIN], { HEALTH_VERSIONS: '0000000' });
    expect(stale.status).not.toBe(0);
    expect(stale.stderr).toMatch(new RegExp(at.short));
    expect(stale.calls.filter((c) => c.endsWith('/health'))).toHaveLength(2);
    expect(stale.calls.filter((c) => c.endsWith('/status'))).toEqual([]);

    // /status that never answers 401 JSON: bounded tries, then it gives up after 5 minutes and says so.
    for (const codes of ['500', 'html']) {
      const skew = run(at, [at.sha, ORIGIN], { STATUS_CODES: codes });
      expect(skew.status, codes).not.toBe(0);
      expect(skew.stderr, codes).toMatch(/5 minutes/);
      const tries = skew.calls.filter((c) => c.endsWith('/status')).length;
      const waited = skew.calls.filter((c) => c.startsWith('sleep ')).map((c) => Number(c.split(' ')[1]));
      expect(tries, codes).toBeGreaterThan(1);
      expect(waited.reduce((a, b) => a + b, 0), codes).toBeLessThanOrEqual(310);
      expect(skew.calls.some((c) => c.startsWith('pnpm -C runner')), codes).toBe(false);
    }
  });

  it('deploy-staging refuses an env file Vite would read', () => {
    const at = checkout();
    const files = ['.env', '.env.local', '.env.production', '.env.production.local', 'api/.env', 'api/.env.local', 'api/.env.production', 'api/.env.production.local', 'api/.dev.vars'];
    for (const file of files) {
      writeFileSync(join(at.repo, file), 'VITE_API_URL=https://wrong.example.test\n');
      expect(git(at.repo, 'status', '--porcelain', '--untracked-files=all'), `${file} is ignored`).toBe('');
      const result = run(at, [at.sha, ORIGIN]);
      expectRefused(result, /env|dev\.vars/i);
      expect(result.stderr, file).toContain(file);
      expect(result.calls.filter((c) => c.startsWith('pnpm ')), file).toEqual([]);
      rmSync(join(at.repo, file));
    }
    expect(run(at, [at.sha, ORIGIN]).status).toBe(0);
  });

  it('deploy-staging passes when only the URL holds bower-api', () => {
    const at = checkout();
    const withApiInUrl = 'Total Upload: 1.00 KiB\nYour Worker has access to the following bindings:\n- Vars:\n  - APP_ORIGIN: "https://bower-api.example.test"\nUploaded bower-staging (2.10 sec)\nDeployed bower-staging triggers (0.80 sec)';
    const result = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: withApiInUrl });
    expect(result.status).toBe(0);
    expect(result.calls.filter((c) => c.startsWith('curl '))).not.toEqual([]);
  });

  it('deploy-staging fails when bower-api is uploaded', () => {
    const at = checkout();
    const uploadedBowerApi = 'Total Upload: 1.00 KiB\nUploaded bower-api (2.10 sec)\nDeployed bower-api triggers (0.80 sec)';
    const result = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: uploadedBowerApi });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/bower-staging/);
    expect(result.calls.filter((c) => c.startsWith('curl '))).toEqual([]);
  });

  it('deploy-staging ignores asset upload lines', () => {
    const at = checkout();
    // Real wrangler output includes asset progress lines before the Worker upload line.
    const withAssets = `🌀 Building list of assets...
🌀 Starting asset upload...
🌀 Found 10 new or modified static assets to upload. Proceeding with upload...
+ /index.html
Uploaded 6 of 10 assets
Uploaded 10 of 10 assets
✨ Success! Uploaded 10 files (3 already uploaded) (1.52 sec)
Total Upload: 412.33 KiB / gzip: 98.10 KiB
Your Worker has access to the following bindings:
- Vars:
  - APP_ORIGIN: "https://bower-staging.example.test"
Uploaded bower-staging (4.21 sec)
Deployed bower-staging triggers (0.31 sec)
  https://bower-staging.example.test
Current Version ID: 00000000-0000-0000-0000-000000000000`;
    const result = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: withAssets });
    expect(result.status).toBe(0);
    expect(result.calls.filter((c) => c.startsWith('curl '))).not.toEqual([]);

    // Same output with bower-api should fail with production alarm.
    const withBowerApi = withAssets.replace('Uploaded bower-staging (4.21 sec)', 'Uploaded bower-api (4.21 sec)');
    const failed = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: withBowerApi });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toMatch(/production|bower-api/i);
    expect(failed.calls.filter((c) => c.startsWith('curl '))).toEqual([]);
  });

  it('deploy-staging confirms the upload line', () => {
    const at = checkout();
    const echoed = 'Total Upload: 1.00 KiB\nYour Worker has access to the following bindings:\n- Vars:\n  - APP_ORIGIN: "https://bower-staging.example.test"\nUploaded bower-other (2.10 sec)\nDeployed bower-other triggers (0.80 sec)';
    const other = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: echoed });
    expect(other.status).not.toBe(0);
    expect(other.stderr).toMatch(/bower-staging/);
    expect(other.calls.filter((c) => c.startsWith('curl '))).toEqual([]);
    const none = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: 'APP_ORIGIN: "https://bower-staging.example.test"' });
    expect(none.status).not.toBe(0);
    expect(none.stderr).toMatch(/no upload line for bower-staging/);
    expect(none.calls.filter((c) => c.startsWith('curl '))).toEqual([]);
    const fine = run(at, [at.sha, ORIGIN], { WRANGLER_OUT: `${echoed.split('Uploaded')[0]}Uploaded bower-staging (2.10 sec)` });
    expect(fine.status).toBe(0);
  });

  it('deploy-staging gives up on the skew wait and says so', () => {
    const at = checkout();
    const skew = run(at, [at.sha, ORIGIN], { STATUS_CODES: '500' });
    expect(skew.status).not.toBe(0);
    const tries = skew.calls.filter((c) => c.endsWith('/status')).length;
    const slept = skew.calls.filter((c) => c.startsWith('sleep ')).map((c) => Number(c.split(' ')[1]));
    const maxTime = readFileSync(`${at.calls}.maxtime`, 'utf8').trim().split('\n').map(Number);
    // The worst case is every check timing out: its time limit plus the wait between checks.
    const worst = maxTime.slice(-tries).reduce((a, b) => a + b, 0) + slept.reduce((a, b) => a + b, 0);
    const claimed = /up to (\d+) minutes/.exec(skew.stderr);
    expect(claimed, skew.stderr).not.toBeNull();
    expect(worst).toBeLessThanOrEqual(Number(claimed?.[1]) * 60);
    expect(skew.stderr).toContain(`after ${tries} checks`);
  });

  it('deploy-staging reruns a failed first health check and reads names with spaces', () => {
    const at = checkout();
    const rerun = run(at, [at.sha, ORIGIN], { HEALTH_VERSIONS: `0000000,${at.short}` });
    expect(rerun.status).toBe(0);
    expect(rerun.calls.filter((c) => c.endsWith('/health'))).toHaveLength(2);

    const spaced = run(at, [at.sha, ORIGIN], { DIST_EXTRA: 'my file.js', DIST_EXTRA_TEXT: 'const owner = "alex.real@company.test";' });
    expectRefused(spaced, /address/i);
    expect(spaced.stderr).toContain('dist/assets/my file.js');
    const secret = run(at, [at.sha, ORIGIN], { DIST_EXTRA: 'my file.js', DIST_EXTRA_TEXT: 'ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234' });
    expectRefused(secret, /secret/i);
    expect(secret.stderr).toContain('dist/assets/my file.js');
  });
});
