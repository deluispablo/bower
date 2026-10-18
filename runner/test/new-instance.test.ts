import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'new-instance.sh');
const REPO = 'OWNER/bower-home';
const ORIGIN = 'https://api.example.test';

/** A stand-in `gh` on PATH: logs each call; clones the local bare repository; keeps repository variables in files. */
const GH = `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view")
    repo=$3
    if grep -q "^public:$repo$" "$GH_REPOS" 2>/dev/null; then
      if [ "$4" = "--json" ] && [ "$5" = "visibility" ] && [ "$6" = "-q" ] && [ "$7" = ".visibility" ]; then
        printf 'PUBLIC\\n'
      fi
    else
      if [ "$4" = "--json" ] && [ "$5" = "visibility" ] && [ "$6" = "-q" ] && [ "$7" = ".visibility" ]; then
        printf 'PRIVATE\\n'
      fi
    fi
    exit 0 ;;
  "repo clone") exec git clone -q "$GH_REMOTE" "$4" ;;
  "variable get") cat "$GH_VARS/$3" 2>/dev/null; exit $? ;;
  "variable set")
    name=$3; shift 3
    while [ $# -gt 0 ]; do
      case "$1" in --body) printf '%s' "$2" > "$GH_VARS/$name"; shift 2 ;; *) shift ;; esac
    done
    exit 0 ;;
esac
echo "gh stub: unexpected call: $*" >&2
exit 1
`;

/** A git that never reads this machine's settings (signing, hooks), with a made-up identity. */
const gitEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Alex',
  GIT_AUTHOR_EMAIL: 'you@example.com',
  GIT_COMMITTER_NAME: 'Alex',
  GIT_COMMITTER_EMAIL: 'you@example.com',
});

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** The temporary folders made here, removed after each test. */
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The instance repository as the original left it: its workflows and agent files, and a readme. */
function instance(): { remote: string; bin: string; log: string; vars: string; repos: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bower-instance-'));
  made.push(dir);
  const remote = join(dir, 'remote.git');
  const seed = join(dir, 'seed');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'init', '-q', '-b', 'main', seed);
  mkdirSync(join(seed, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(seed, 'agent', 'prompts'), { recursive: true });
  writeFileSync(join(seed, '.github', 'workflows', 'ingest.yml'), 'name: ingest\n');
  writeFileSync(join(seed, '.github', 'workflows', 'lint.yml'), 'name: lint\n');
  writeFileSync(join(seed, 'agent', 'run.sh'), 'echo old\n');
  writeFileSync(join(seed, 'agent', 'prompts', 'ingest.md'), 'Old prompt.\n');
  writeFileSync(join(seed, 'README.md'), "Alex's personal copy.\n");
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'The original');
  git(seed, 'push', '-q', remote, 'HEAD:refs/heads/main');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), GH);
  chmodSync(join(bin, 'gh'), 0o755);
  const vars = join(dir, 'vars');
  mkdirSync(vars);
  const repos = join(dir, 'repos');
  writeFileSync(repos, '');
  return { remote, bin, log: join(dir, 'gh.log'), vars, repos };
}

/** Runs the script with macOS's stock bash, `gh` stubbed on PATH, and `input` as what is typed at its prompts. */
function run(at: ReturnType<typeof instance>, args: string[] = [REPO, ORIGIN], input = ''): { status: number | null; output: string } {
  const out = spawnSync('/bin/bash', [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...gitEnv(), PATH: `${at.bin}:${process.env.PATH ?? ''}`, GH_LOG: at.log, GH_REMOTE: at.remote, GH_VARS: at.vars, GH_REPOS: at.repos },
    input,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: out.status, output: `${out.stdout}${out.stderr}` };
}

describe('new-instance.sh', () => {
  it('new-instance copies the built runner and tidy.yml and nothing secret', () => {
    const at = instance();
    const first = run(at);
    expect(first.output).not.toMatch(/secret/i);
    expect(first.status).toBe(0);

    // One new commit: the original's workflows and agent files gone, the built runner and tidy.yml in.
    expect(git(at.remote, 'rev-list', '--count', 'main').trim()).toBe('2');
    expect(git(at.remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').sort()).toEqual(['.github/workflows/tidy.yml', 'README.md', 'runner/dist/runner.mjs']);
    expect(git(at.remote, 'show', 'main:.github/workflows/tidy.yml')).toBe(readFileSync(join(ROOT, 'runner', 'workflows', 'tidy.yml'), 'utf8'));
    expect(git(at.remote, 'show', 'main:runner/dist/runner.mjs')).toBe(readFileSync(join(ROOT, 'runner', 'dist', 'runner.mjs'), 'utf8'));

    // The workflow: the dispatch type, the run name recovery looks up, Node 24, the least permissions, no secret.
    const tidy = readFileSync(join(ROOT, 'runner', 'workflows', 'tidy.yml'), 'utf8');
    expect(tidy).toMatch(/repository_dispatch:\s*\n\s*types: \[bower-tidy\]/);
    expect(tidy).toContain('run-name: tidy ${{ github.event.client_payload.run_id }} ${{ github.event.client_payload.attempt }}');
    expect(tidy).toMatch(/node-version: '?24'?/);
    expect(tidy).toContain('node runner/dist/runner.mjs');
    expect(tidy).toContain('BOWER_API_URL: ${{ vars.BOWER_API_URL }}');
    expect(tidy).toMatch(/^permissions:/m);
    // GitHub's runner unless BOWER_RUNS_ON names the person's own (self-hosted) runner.
    expect(tidy).toContain("runs-on: ${{ vars.BOWER_RUNS_ON || 'ubuntu-latest' }}");
    // No expression reads the ticket, the one secret read is the Claude credential (TL-P4-01), and nothing is echoed.
    const expressions = [...tidy.matchAll(/\$\{\{[^}]*\}\}/g)].map((m) => m[0]);
    expect(expressions.join(' ')).not.toMatch(/ticket/i);
    expect(expressions.filter((e) => /secrets/i.test(e))).toEqual(['${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}']);
    expect(tidy).not.toMatch(/\becho\b/);

    // The Worker's address set as a variable; no secret asked for, read, listed or set.
    const calls = readFileSync(at.log, 'utf8');
    expect(calls).toContain(`variable set BOWER_API_URL -R ${REPO} --body ${ORIGIN}`);
    expect(calls).not.toMatch(/secret/i);

    // Again with nothing changed: no commit, and the variable is not set again.
    const again = run(at);
    expect(again.status).toBe(0);
    expect(git(at.remote, 'rev-list', '--count', 'main').trim()).toBe('2');
    expect(readFileSync(at.log, 'utf8').split('variable set').length).toBe(2);
  });

  it('new-instance refuses a repository that looks like a flag', () => {
    const at = instance();
    const typed = ['-R/bower-home', 'OWNER/-bower-home', '--help/bower-home'];
    for (const repo of typed) {
      const asked = run(at, [], `${repo}\n${ORIGIN}\n`);
      expect(asked.status, repo).not.toBe(0);
      expect(asked.output, repo).toContain('Not an owner/name repository');
    }
    for (const repo of typed) expect(run(at, [repo, ORIGIN]).status, repo).not.toBe(0);
    // Refused before any repository was looked at, made or changed.
    const calls = existsSync(at.log) ? readFileSync(at.log, 'utf8') : '';
    expect(calls.split('\n').filter((c) => c && c !== 'auth status')).toEqual([]);
    expect(git(at.remote, 'rev-list', '--count', 'main').trim()).toBe('1');
  });

  it('new-instance refuses a public repository', () => {
    const at = instance();
    // Mark the repository as public in the stub's registry
    writeFileSync(at.repos, `public:${REPO}\n`);
    const result = run(at);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('must be private');
  });
});

describe('tidy.yml', () => {
  it('every action in tidy.yml is pinned to a commit SHA', () => {
    const tidy = readFileSync(join(ROOT, 'runner', 'workflows', 'tidy.yml'), 'utf8');
    const usesLines = tidy.split('\n').filter((line) => line.includes('uses:'));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line, line).toMatch(/@[0-9a-f]{40}\b/);
    }
  });
  it('the Install Claude Code step restores from the cache key and still installs on a miss', () => {
    const tidy = readFileSync(join(ROOT, 'runner', 'workflows', 'tidy.yml'), 'utf8');
    const steps = tidy.split(/\n(?= {6}- )/).slice(1);
    const at = (pattern: RegExp): number => steps.findIndex((s) => pattern.test(s));
    // Restored by the pinned version, as the original's ingest.yml caches its CLI (actions/cache, keyed on the version).
    const cache = at(/uses: actions\/cache@[0-9a-f]{40}\b/);
    const step = steps[cache] ?? '';
    expect(step).toMatch(/\n {8}id: cache-claude-cli\n/);
    // F10-region R2: a self-hosted runner keeps ~/claude-cli in its home, so the cache step runs only on GitHub's runners.
    expect(step).toMatch(/\n {8}if: vars\.BOWER_PROVIDER == 'claude' && runner\.environment == 'github-hosted'\n/);
    expect(step).toMatch(/\n {10}path: ~\/claude-cli\n/);
    expect(step).toMatch(/\n {10}key: claude-code-\$\{\{ runner\.os \}\}-\$\{\{ env\.CLAUDE_CODE_VERSION \}\}(\n|$)/);
    // Installed only on a miss, into the folder the cache keeps; on the path either way.
    const install = at(/name: Install Claude Code\n/);
    expect(install).toBeGreaterThan(cache);
    expect(steps[install]).toMatch(/\n {8}if: vars\.BOWER_PROVIDER == 'claude' && steps\.cache-claude-cli\.outputs\.cache-hit != 'true'\n/);
    expect(steps[install]).toContain('npm install --prefix "$HOME/claude-cli" "@anthropic-ai/claude-code@$CLAUDE_CODE_VERSION"');
    const path = at(/>> "\$GITHUB_PATH"/);
    expect(path).toBeGreaterThan(cache);
    expect(steps[path]).toMatch(/\n {8}if: vars\.BOWER_PROVIDER == 'claude'\n/);
    expect(steps[path]).not.toContain('cache-hit');
    expect(at(/name: Tidy up with Claude\n/)).toBeGreaterThan(Math.max(install, path));
  });
  it('BOWER_API_URL stays a list: the origin is appended once, other entries kept, never a substring match', () => {
    const at = instance();
    const variable = join(at.vars, 'BOWER_API_URL');
    const other = 'https://api.example.org';
    // Unset: the plain origin, no leading comma.
    expect(run(at).status).toBe(0);
    expect(readFileSync(variable, 'utf8')).toBe(ORIGIN);
    // Another Worker's origin: appended at the end, nothing dropped.
    writeFileSync(variable, ` ${other} , ${ORIGIN}x `);
    const added = run(at);
    expect(added.status).toBe(0);
    expect(readFileSync(variable, 'utf8')).toBe(`${other},${ORIGIN}x,${ORIGIN}`);
    // Already listed (exact entry): untouched, and the line names the origin.
    const again = run(at);
    expect(again.output).toContain(`already lists ${ORIGIN}`);
    expect(readFileSync(variable, 'utf8')).toBe(`${other},${ORIGIN}x,${ORIGIN}`);
    expect(readFileSync(at.log, 'utf8').split('variable set').length).toBe(3);
    // An empty variable is the plain origin.
    writeFileSync(variable, '');
    run(at);
    expect(readFileSync(variable, 'utf8')).toBe(ORIGIN);
  }, 120_000);
  it('the workflow records the runner region and never fails on it', () => {
    const tidy = readFileSync(join(ROOT, 'runner', 'workflows', 'tidy.yml'), 'utf8');
    const steps = tidy.split(/\n(?= {6}- )/).slice(1);
    const region = steps.findIndex((s) => /name: Record the runner region\n/.test(s));
    expect(region, 'the Record the runner region step exists').toBeGreaterThanOrEqual(0);
    const runner = steps.findIndex((s) => /run: node runner\/dist\/runner\.mjs/.test(s));
    expect(region, 'before the runner step').toBeLessThan(runner);
    const step = steps[region] ?? '';
    // Azure IMDS compute/location, text format, with the Metadata header and a 2 second cap (Azure docs: instance metadata service).
    expect(step).toContain('curl -s -m 2 -H Metadata:true');
    expect(step).toContain('http://169.254.169.254/metadata/instance/compute/location?api-version=2021-02-01&format=text');
    expect(step).toContain('>> "$GITHUB_ENV"');
    expect(step).toContain('BOWER_RUNNER_REGION=');
    // It cannot fail the job.
    expect(step).toMatch(/\n {8}continue-on-error: true\n/);
    // F10-region R1: Azure's metadata service exists only on GitHub's runners; a self-hosted one skips the probe.
    expect(step).toMatch(/\n {8}if: runner\.environment == 'github-hosted'\n/);
    // R7: the header says both steps are skipped on a self-hosted runner.
    const header = tidy.slice(0, tidy.indexOf('\nname: '));
    expect(header).toMatch(/self-hosted runner[^.]*skip/);
  });
});
