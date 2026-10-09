// The harness's rules, pure, so they are tested (src/harness.test.ts) and used by
// scripts/check-harness.mjs and harness/done.sh alike.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The hash a proof line keeps for a verify command. */
export const hashOf = (verify) => createHash('sha256').update(verify).digest('hex').slice(0, 16);

/** proof.log lines → Map(id → { hash, how }); a later line for an id wins. */
export function readProofs(text) {
  const out = new Map();
  for (const line of text.split('\n').filter(Boolean)) {
    const [id, hash, , how = ''] = line.split('\t');
    out.set(id, { hash, how });
  }
  return out;
}

/** The tests a vitest JSON report lists (a run's test-results/unit.json, or a dry run's), with the config they ran under. */
export function reportTests(report, config, cwd = process.cwd()) {
  return report.testResults.flatMap((r) =>
    r.assertionResults.map((a) => ({ name: a.fullName, file: relative(cwd, r.name).replaceAll('\\', '/'), config, project: r.projectName ?? '' })));
}

/** A package's unit tests, from the JSON report its vitest run writes (<dir>/test-results/unit.json, see <dir>/vitest.config.ts). */
function packageTests(dir, root, cwd) {
  const file = join(root, `${dir}/test-results/unit.json`);
  if (!existsSync(file)) return [];
  return reportTests(JSON.parse(readFileSync(file, 'utf8')), `${dir}/vitest.config.ts`, cwd);
}

/** The api's unit tests (api/test-results/unit.json). */
export function apiTests(root, cwd = process.cwd()) {
  return packageTests('api', root, cwd);
}

/** The runner's unit tests (runner/test-results/unit.json). */
export function runnerTests(root, cwd = process.cwd()) {
  return packageTests('runner', root, cwd);
}

/** A command that runs the browser tests: playwright, e2e-both.sh, or the pnpm e2e scripts. */
const isE2e = (part) => /playwright test|e2e-both|\bpnpm\s+e2e(:\w+)?(\s|$)/.test(part);

/** The test patterns a verify names: vitest -t "…" and playwright -g "…"; `pnpm -C api …` and `pnpm -C runner …` run those packages' own tests. */
export function patterns(part) {
  const m = /(?: -| --)(t|g|grep|testNamePattern)(?: |=)"([^"]*)"/.exec(part);
  if (!m) return null;
  const pkg = /\bpnpm\s+(-C|--dir)\s+(api|runner)\b/.exec(part)?.[2];
  const kind = m[1] === 'g' || m[1] === 'grep' || isE2e(part) ? 'e2e' : (pkg ?? 'unit');
  return { kind, pattern: m[2] };
}

/** "a|b(c|d)" → ["a", "b(c|d)"]: the alternatives at the top level of a pattern. */
function topLevelParts(pattern) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') i++;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === '|' && depth === 0) {
      out.push(pattern.slice(from, i));
      from = i + 1;
    }
  }
  out.push(pattern.slice(from));
  return out.filter((p) => p.trim());
}

/** The files/config/projects a named verify actually selects, before its name filter. */
function selectedTests(command, kind, tests) {
  const words = [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const start = kind !== 'e2e' ? words.indexOf('run') : words.findIndex((w) => w.endsWith('e2e-both.sh') || w === 'e2e' || w.startsWith('e2e:'));
  const at = start >= 0 ? start : words.indexOf('test');
  const filters = [];
  const projects = [];
  let config = kind === 'e2e' ? 'playwright.config.ts' : null;
  const takesValue = new Set(['-t', '-g', '-c', '--config', '--project', '--grep', '--grep-invert', '--testNamePattern', '--reporter', '--outputFile', '--output', '--workers', '--timeout', '--retries', '--repeat-each', '--shard', '--maxWorkers', '--minWorkers', '--pool', '--environment']);
  for (let i = at + 1; i < words.length; i++) {
    const word = words[i];
    const equal = word.indexOf('=');
    const option = equal > 0 ? word.slice(0, equal) : word;
    if (takesValue.has(option)) {
      const value = equal > 0 ? word.slice(equal + 1) : words[++i];
      if (option === '-c' || option === '--config') config = value;
      if (option === '--project') projects.push(value);
    } else if (!word.startsWith('-')) filters.push(word);
  }
  const localPath = (p) => relative(process.cwd(), resolve(p)).replaceAll('\\', '/');
  const expectedConfig = config ? localPath(config) : null;
  return tests.filter((test) => {
    // Older pure callers supplied names only. The production sensor supplies
    // file/config/project metadata, so its proofs always receive scoped checks.
    if (typeof test === 'string') return true;
    if (expectedConfig && test.config && localPath(test.config) !== expectedConfig) return false;
    if (projects.length && !projects.some((p) => {
      const pattern = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
      return new RegExp(`^${pattern}$`).test(test.project ?? '');
    })) return false;
    const file = test.file.replaceAll('\\', '/');
    return !filters.length || filters.some((filter) => kind !== 'e2e' ? file.includes(filter.replace(/^\.\//, '')) : new RegExp(filter).test(file));
  });
}

/**
 * Everything that makes the feature list dishonest, one sentence each.
 * `tests` (the names of the unit and e2e tests that exist) lets it check that
 * every named pattern still matches a test.
 */
/** The hash of harness/proof-legacy.txt: the entries proved before the proof rule. Frozen; growing it means changing this line. */
export const LEGACY_HASH = '837283d24771c394';

/** The review a closed escalated consolidation entry must name: "P4-NN PASS". */
const REVIEW_PASS = /^P4-\S+ PASS$/;

/** One sentence when an entry passes (or is about to) without what its kind needs: an escalated p4-consolidation entry a review PASS, a `ui: true` entry `design: "verified"` (TL-P4-18 addendum 3); else null. */
export function reviewProblem(f) {
  if (f.ui === true && f.design !== 'verified') return `${f.id}: a UI entry passes without a verified design check (set "design": "verified" after the designer's check)`;
  const escalated = f.task === 'p4-consolidation' && /Starting model: bower-escalated/.test(f.note ?? '');
  if (!escalated || REVIEW_PASS.test(f.review ?? '')) return null;
  return `${f.id}: escalated, passes without a review PASS (set "review": "P4-NN PASS" after the reviewer's PASS)`;
}

/** Tracked files with a line that is only a conflict marker, as "file:line: conflict marker" (git grep: tracked files only). */
export function conflictMarkers(root) {
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-nIE', '^(<{7} |={7}$|>{7} )'], { cwd: root, encoding: 'utf8' });
  } catch (e) {
    if (e.status !== 1) throw e; // 1 = no match
  }
  return out.split('\n').filter(Boolean).map((l) => {
    const [file, line] = l.split(':');
    return `${file}:${line}: conflict marker`;
  });
}

export function problems(features, proofs, tests, legacy = new Set(), checkOpen = false) {
  const bad = [];
  for (const f of features) {
    const proof = proofs.get(f.id);
    if (f.passes) {
      const r = reviewProblem(f);
      if (r) bad.push(r);
    }
    if (f.passes && proof?.hash !== hashOf(f.verify)) bad.push(`${f.id}: passes without a proof for its current verify (close it with harness/done.sh)`);
    if (f.passes && proof?.how === 'reproved' && typeof f.task !== 'number' && !legacy.has(f.id)) bad.push(`${f.id}: a "reproved" proof is only for the entries before the proof rule; close it with harness/done.sh`);
    if (typeof f.task !== 'string') continue;
    if (!Array.isArray(f.steps) || !f.steps.some((x) => typeof x === 'string' && x.trim())) bad.push(`${f.id}: no steps (how a person sees it, for an evaluator to replay)`);
    for (const p of f.verify.split('&&').map((x) => x.trim())) {
      const named = /vitest run|playwright test|e2e-both/.test(p) || (isE2e(p) && patterns(p) !== null);
      if (!named) continue;
      const pat = patterns(p);
      if (!pat) {
        bad.push(`${f.id}: "${p}" names no test (add -t "<test name>" or -g "<test name>")`);
        continue;
      }
      if (pat.pattern.replace(/[.^$|()\\[\]*+?]/g, '').length < 4) {
        bad.push(`${f.id}: pattern "${pat.pattern}" is too short to name a test`);
        continue;
      }
      if (tests && (f.passes || checkOpen)) {
        const selected = selectedTests(p, pat.kind, tests[pat.kind] ?? []);
        // Each name the pattern lists (a|b|c at the top level) must match a test of its own.
        for (const part of topLevelParts(pat.pattern)) {
          let re;
          try {
            re = new RegExp(part);
          } catch {
            bad.push(`${f.id}: pattern "${part}" is not a valid pattern`);
            continue;
          }
          if (!selected.some((test) => re.test(typeof test === 'string' ? test : test.name))) bad.push(`${f.id}: "${part}" matches no test (${pat.kind}, selected files/config/projects)`);
        }
      }
    }
  }
  return bad;
}

/** Entries other than `id` whose `passes` changed since `before` (one entry per commit). */
export function othersFlipped(before, now, id) {
  const was = new Map(before.map((x) => [x.id, x.passes]));
  return now.filter((x) => x.id !== id && was.has(x.id) && was.get(x.id) !== x.passes).map((x) => x.id);
}

/**
 * done.sh's arguments: <id> "<message>" and at most one of
 *   --fixed-in <sha>   the fix is that commit: the red step puts its code back as it was before it;
 *   --known-green "<why>"  no red is possible (a decision kept, a finding not reproduced); the entry needs a note, committed before.
 * Anything else is refused, so a mistyped flag never skips the red step.
 */
export function doneArgs(argv, entry, committed) {
  const [id, msg, flag, value, ...rest] = argv;
  if (!id || !msg) throw new Error('usage: done.sh <id> "<message>" [--fixed-in <sha> | --known-green "<why>"]');
  if (rest.length) throw new Error(`unknown arguments: ${rest.join(' ')}`);
  if (!flag) return { id, msg, mode: 'red' };
  if (flag === '--fixed-in') {
    if (!value || !/^[0-9a-f]{7,40}$/.test(value)) throw new Error('--fixed-in needs a commit');
    return { id, msg, mode: 'fixed-in', sha: value };
  }
  if (flag === '--known-green') {
    if (!value) throw new Error('--known-green needs a reason');
    if (!entry?.note) throw new Error('--known-green needs the entry to carry a note saying why');
    // The note is decided before the close: written in the same change, it would excuse itself.
    if (!committed?.note) throw new Error('--known-green needs the note committed first (git commit it, then close)');
    return { id, msg, mode: 'known-green', reason: value };
  }
  throw new Error(`unknown flag ${flag}`);
}

/**
 * Paths from `git status --porcelain` with changes not staged (the harness's own
 * records aside). done.sh commits only what is staged, so it refuses these: one
 * entry's commit never carries another change by accident.
 */
export function notStaged(status) {
  return status
    .split('\n')
    .filter(Boolean)
    .filter((l) => l.startsWith('??') || l[1] !== ' ')
    .map((l) => l.slice(3))
    .filter((p) => !p.startsWith('harness/'));
}

/** harness/progress.md must say what comes next: a "## Next" section with at least one line. */
export function nextProblems(text) {
  const m = /^## Next\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return 'harness/progress.md has no "## Next" section: write the next step before stopping';
  if (!/^- \S/m.test(m[1] ?? '')) return 'harness/progress.md: "## Next" is empty: write the next step before stopping';
  return null;
}

/**
 * What a red run showed: 'assert' only with a failed test and the reporter's
 * assertion diagnostic (a failed expectation can itself time out); 'load' when only a test file
 * failed (a missing import is not a red that pins behaviour); 'none' otherwise.
 */
export function redKind(output) {
  // Colour codes do not change the diagnostic. Source excerpts and stack traces
  // do not start with these error labels; merely mentioning expect is not proof.
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
  if (/^\s*(?:Error: )?["']?(?:beforeAll|beforeEach|afterAll|afterEach)["']? hook\b/m.test(plain)) return 'none';
  const assertion = /^\s*(?:AssertionError:|Error: expect\()/m.test(plain);
  const unitFailed = /^\s*Tests\s+[1-9]\d* failed/m.test(plain);
  const browserFailed = /^\s+[1-9]\d* failed\s*$/m.test(plain) && !/^\s*Test Files/m.test(plain);
  if (assertion && (unitFailed || browserFailed)) return 'assert';
  if (!unitFailed && /^\s*Test Files\s+[1-9]\d* failed/m.test(plain)) return 'load';
  return 'none';
}

/** The size of harness/real-timers.json today. The list may only shrink, to empty: lower this when a line goes, never raise it. */
export const REAL_TIMER_CEILING = 22;
/**
 * The timer allowlist (harness/real-timers.json, enforced while tests run by harness/timer-gate.ts): a list longer than the
 * ceiling, and lines that match no test. `names` are the full names of every unit test of the app, api and runner.
 */
export function timerListProblems(names, list, ceiling = REAL_TIMER_CEILING) {
  const bad = [];
  if (list.length > ceiling) bad.push(`harness/real-timers.json has ${list.length} lines, over the ${ceiling} it may keep: the timer list may only shrink`);
  const known = new Set(names);
  for (const name of list) if (!known.has(name)) bad.push(`harness/real-timers.json names "${name}", which matches no test: delete the line and lower REAL_TIMER_CEILING`);
  return bad;
}

/**
 * The slowest unit tests by wall-clock time, one line each: a report only, never a failure (TL-P4-17 addendum 9). Time
 * measures the machine under load; the timer gate judges the test, and vitest's 5000 ms timeout stays as the backstop.
 */
export function slowReport(tests, count = 5) {
  return [...tests]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, count)
    .map((t) => `${Math.round(t.duration)} ms  ${t.name}`);
}

/** Test files: unit, e2e, and the api and runner tests (the same set as TEST_PATTERN in harness-git.mjs, without the helper folders). */
const TEST_FILE = /\.test\.tsx?$|^e2e\/.+\.spec\.ts$|^(api|runner)\/test\/.+\.ts$/;
/** A notes file a branch adds or changes. */
const NOTES_FILE = /^docs\/harness\/.+-notes\.md$/;

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * One line per existing test file that the judged tips of a branch modify or delete, since their merge base with
 * `base`, when no notes file the same tips add or change carries `tests changed: <file>: <why>` for it (TL-P4-20).
 * `tips` are the commits to judge: HEAD, plus MERGE_HEAD during an uncommitted merge (historyTips). The one home of
 * the rule: check-harness runs it, and integrate.sh calls check-harness.
 */
export function testsChangedProblems(base, tips = ['HEAD'], cwd = process.cwd()) {
  const out = [];
  for (const tip of tips) {
    let from;
    try {
      from = git(['merge-base', base, tip], cwd).trim();
    } catch {
      // expected: the base ref does not exist here (a fixture or a fresh clone); nothing to compare with.
      continue;
    }
    const names = (filter) => git(['diff', '--name-only', `--diff-filter=${filter}`, from, tip], cwd).split('\n').filter(Boolean);
    const stated = new Set(names('AM').filter((f) => NOTES_FILE.test(f)).flatMap((f) => [...git(['show', `${tip}:${f}`], cwd).matchAll(/^\W*tests changed:\s*(\S+?):\s/gm)].map((m) => m[1])));
    for (const f of names('DM').filter((n) => TEST_FILE.test(n))) {
      if (!stated.has(f)) out.push(`${f} is a changed test with no "tests changed: ${f}: <why>" line in a notes file of this branch`);
    }
  }
  return [...new Set(out)];
}
