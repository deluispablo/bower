#!/usr/bin/env bash
# A local Codex delivery: validate, run, scan, commit, gate, and record the card.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
exec node --input-type=module - "$script_dir" "$@" <<'NODE'
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [scriptDir, target, prompt, ...args] = process.argv.slice(2);
const { scanStaged } = await import(pathToFileURL(resolve(scriptDir, '../scripts/scan-staged.mjs')).href);
// Model and speed per run (TL-P4-57): the workhorse by default, the frontier model for escalated, adversarial and closing work.
const options = { entry: '', role: 'implementer', sandbox: 'workspace-write', effort: 'medium', attempt: '1', e2e: '', model: 'gpt-6.1-sol', tier: 'fast' };
let invalid = '';
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].slice(2);
  if (!args[i].startsWith('--') || !Object.hasOwn(options, key) || args[i + 1] === undefined) {
    invalid = 'Invalid runner arguments.'; break;
  }
  options[key] = args[i + 1];
}
if (!target || !prompt || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.entry) ||
    !/^[1-9][0-9]*$/.test(options.attempt) || /[\r\n]/.test(options.role) ||
    !['workspace-write', 'read-only'].includes(options.sandbox) || !['low', 'medium', 'high', 'xhigh'].includes(options.effort) ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(options.model) || !['fast', 'standard'].includes(options.tier)) {
  invalid = 'Invalid runner arguments.';
}
if (invalid) { console.error(invalid); process.exit(2); }

const canonical = (path) => {
  const full = resolve(path);
  if (existsSync(full)) return realpathSync(full);
  const parent = dirname(full);
  return parent === full ? full : join(canonical(parent), basename(full));
};
const main = canonical(process.env.BOWER_MAIN || '/Users/deluisp/Projects/bower-app');
const wt = canonical(target);
const requestedOutput = resolve(process.env.CODEX_RUN_DIR || '/tmp/codex-run');
const outputLocation = canonical(requestedOutput);
const unsafeOutput = [main, wt].some((path) => outputLocation === path || outputLocation.startsWith(`${path}/`));
// An unsafe override is refused; its refusal result goes in the standard temporary directory.
const outputDir = unsafeOutput ? '/tmp/codex-run' : requestedOutput;
mkdirSync(outputDir, { recursive: true });
const prefix = join(outputDir, `${options.entry}-${options.attempt}`);
const logs = { 'json-log': `${prefix}.jsonl`, 'codex-log': `${prefix}.codex.log`,
  'check-log': `${prefix}.check.log`, 'e2e-demo-log': `${prefix}.e2e-demo.log`, 'e2e-fake-log': `${prefix}.e2e-fake.log` };
const result = { status: 'refused', branch: '', commits: '', tokens: '', check: 'not-run', 'e2e-demo': 'not-run', 'e2e-fake': 'not-run', ...logs };
let card = '';
let usage;
let model = options.model;
let initialHead;
let tokenFile;
let recorded = false;
let scratch;
const save = () => writeFileSync(`${prefix}.result`, Object.entries(result).map(([k, v]) => `${k}: ${v}\n`).join('') + `card:\n${card}\n`);
const csv = (value) => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const recordTokens = () => {
  if (!usage || recorded) return;
  const header = 'entry,role,tool,model,effort,attempt,tokens,input,cache_write,cache_read,output,cost_usd,tool_uses,minutes,outcome,date';
  const values = [options.entry, options.role, 'codex', model, options.effort, options.attempt,
    result.tokens, usage.input_tokens, '', usage.cached_input_tokens ?? '', usage.output_tokens,
    '', '', '', result.status, new Date().toISOString().slice(0, 10)];
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, `${header}\n`);
  // Append in one operation so independent runners cannot interleave a row.
  appendFileSync(tokenFile, `${values.map(csv).join(',')}\n`);
  recorded = true;
};
const finish = (status, code, reason) => {
  result.status = status;
  if (reason) result.reason = String(reason).replace(/[\r\n]+/g, ' ');
  save();
  if (scratch) { rmSync(scratch, { recursive: true, force: true }); scratch = undefined; }
  recordTokens();
  if (reason) console.error(result.reason);
  process.exit(code);
};
const git = (args, env = process.env, input) => execFileSync('git', args, {
  cwd: wt, env, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
});

// Do not inherit another repository or an alternate index from the caller.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) delete process.env[name];
}
try {
  if (wt === main) finish('refused', 2, 'Refusing the main checkout.');
  let top;
  try { top = canonical(git(['rev-parse', '--show-toplevel']).trim()); }
  catch { finish('refused', 2, 'The target is not a git worktree.'); }
  if (top !== wt || git(['rev-parse', '--is-inside-work-tree']).trim() !== 'true') {
    finish('refused', 2, 'The target is not a git worktree root.');
  }
  if (unsafeOutput) finish('refused', 2, 'Refusing a result directory inside a checkout.');
  try { result.branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim(); }
  catch { finish('refused', 2, 'Refusing a detached HEAD.'); }
  if (result.branch.startsWith('codex/')) finish('refused', 2, 'Refusing a codex branch.');
  if (git(['status', '--porcelain', '--untracked-files=all']).trim()) finish('refused', 2, 'Refusing a dirty tree.');
  initialHead = git(['rev-parse', 'HEAD']).trim();
  tokenFile = canonical(process.env.BOWER_TOKENS || join(main, 'harness/tokens.csv'));
  if (tokenFile === wt || tokenFile.startsWith(`${wt}/`)) finish('refused', 2, 'The usage file must be outside the worktree.');
  if (outputDir === wt || outputDir.startsWith(`${wt}/`)) finish('refused', 2, 'The result directory must be outside the worktree.');
  if (!existsSync(prompt)) finish('refused', 2, 'The prompt file does not exist.');

  // Parse shell-style argument quoting without executing expansions or commands.
  const splitArgs = (text) => {
    const words = [];
    let word = ''; let quote = ''; let escaped = false; let active = false;
    for (const char of text) {
      if (escaped) { word += char; escaped = false; active = true; continue; }
      if (char === '\\' && quote !== "'") { escaped = true; active = true; continue; }
      if (quote) { if (char === quote) quote = ''; else word += char; continue; }
      if (char === '"' || char === "'") { quote = char; active = true; continue; }
      if (/\s/.test(char)) { if (active) { words[words.length] = word; word = ''; active = false; } }
      else { word += char; active = true; }
    }
    if (quote || escaped) throw new Error('Invalid e2e argument quoting.');
    if (active) words[words.length] = word;
    return words;
  };
  let e2eArgs;
  try { e2eArgs = splitArgs(options.e2e); }
  catch (error) { finish('refused', 2, error.message); }

  const input = openSync(prompt, 'r');
  const stream = openSync(logs['json-log'], 'w');
  const errors = openSync(logs['codex-log'], 'w');
  let run;
  try {
    run = spawnSync(process.env.CODEX_BIN || 'codex', ['exec', '--json', '--sandbox', options.sandbox,
      '-C', wt, '-m', options.model, '-c', `model_reasoning_effort=${options.effort}`,
      ...(options.tier === 'fast' ? ['-c', 'service_tier="priority"'] : []), '-'], { cwd: wt, stdio: [input, stream, errors] });
  } finally { closeSync(input); closeSync(stream); closeSync(errors); }
  for (const line of readFileSync(logs['json-log'], 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); }
    catch { continue; } // The raw stream is retained, including non-event diagnostics.
    if (typeof event.model === 'string') model = event.model;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') card = event.item.text;
    if (event.type === 'turn.completed') usage = event.usage;
  }
  if (usage && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 &&
      Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0) result.tokens = String(usage.input_tokens + usage.output_tokens);
  else usage = undefined;
  if (run.status !== 0 || run.error) finish('codex-failed', 1, 'Codex failed; see its log.');
  if (options.sandbox === 'read-only') finish('read-only', 0);
  if (git(['rev-parse', 'HEAD']).trim() !== initialHead ||
      git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim() !== result.branch) {
    finish('refused', 3, 'Codex changed the branch or HEAD.');
  }

  // A private index snapshots the whole delivery before any commits are published.
  scratch = mkdtempSync(join(tmpdir(), 'codex-index-'));
  try {
    const indexEnv = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index'), GIT_LITERAL_PATHSPECS: '1' };
    git(['read-tree', initialHead], indexEnv);
    git(['add', '-A', '--', '.'], indexEnv);
    const planPath = join(wt, '.codex-commits.json');
    const previousPlan = git(['ls-tree', '-z', initialHead, '--', '.codex-commits.json'], indexEnv);
    if (previousPlan) git(['update-index', '-z', '--index-info'], indexEnv, previousPlan);
    else git(['update-index', '--force-remove', '--', '.codex-commits.json'], indexEnv);
    const paths = git(['diff', '--cached', '--name-only', '--no-renames', '-z', initialHead], indexEnv).split('\0').filter(Boolean);
    const diff = git(['diff', '--cached', '--no-renames', '--no-ext-diff', '--no-textconv', '--unified=0', initialHead], indexEnv);
    const problems = scanStaged(paths, diff);
    if (problems.length) finish('refused', 3, problems[0]);
    let plan;
    try {
      plan = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) :
        (paths.length ? [{ message: `${options.entry}: codex delivery`, files: paths }] : []);
    } catch { finish('refused', 3, 'Invalid commit plan JSON.'); }
    if (!Array.isArray(plan)) finish('refused', 3, 'The commit plan must be an array.');
    const assigned = new Set();
    for (const commit of plan) {
      if (!commit || typeof commit.message !== 'string' || !commit.message.trim() || commit.message.includes('\0') ||
          !Array.isArray(commit.files) || !commit.files.length) finish('refused', 3, 'Invalid commit plan item.');
      for (const path of commit.files) {
        if (typeof path !== 'string' || isAbsolute(path) || path.split('/').some((part) => !part || part === '.' || part === '..') ||
            !paths.includes(path) || assigned.has(path)) finish('refused', 3, 'A planned path is unchanged, repeated or invalid.');
        assigned.add(path);
      }
    }
    if (assigned.size !== paths.length) finish('refused', 3, 'A changed file is missing from the commit plan.');

    // Build trees from the scanned snapshot, including deletions. Only the final ref update publishes them.
    const snapshot = git(['write-tree'], indexEnv).trim();
    git(['read-tree', initialHead], indexEnv);
    let parent = initialHead;
    const commits = [];
    for (const commit of plan) {
      for (const path of commit.files) {
        const entry = git(['ls-tree', '-z', snapshot, '--', path], indexEnv);
        if (entry) git(['update-index', '-z', '--index-info'], indexEnv, entry);
        else git(['update-index', '--force-remove', '--', path], indexEnv);
      }
      const tree = git(['write-tree'], indexEnv).trim();
      parent = git(['commit-tree', tree, '-p', parent], indexEnv, `${commit.message.trim()}\n\nimplementer: codex\n`).trim();
      commits[commits.length] = parent;
    }
    if (commits.length) {
      git(['update-ref', `refs/heads/${result.branch}`, parent, initialHead]);
      result.commits = commits.join(',');
      result.status = 'committed';
      save();
      git(['read-tree', parent]);
    }
  } finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); scratch = undefined; }

  const gate = (command, argv, name) => {
    const fd = openSync(logs[`${name}-log`], 'w');
    let run;
    try { run = spawnSync(command, argv, { cwd: wt, stdio: ['ignore', fd, fd] }); }
    finally { closeSync(fd); }
    result[name] = run.status === 0 && !run.error ? 'pass' : 'fail';
    // Gate output stays in its log; the coordinator gets only the last summary line.
    const summary = execFileSync('tail', ['-n', '1', logs[`${name}-log`]], { encoding: 'utf8' }).trimEnd();
    result[`${name}-summary`] = summary;
    return result[name] === 'pass';
  };
  if (!gate('bash', ['harness/with-lock.sh', 'pnpm', 'check'], 'check')) finish('check-failed', 1);
  if (options.e2e) {
    const demo = gate('pnpm', ['e2e', ...e2eArgs], 'e2e-demo');
    const fake = gate('pnpm', ['e2e:fake', ...e2eArgs], 'e2e-fake');
    if (!demo || !fake) finish('e2e-failed', 1);
  }
  finish('green', 0);
} catch (error) {
  // Preserve the result and any completed commit ids on an unexpected local failure.
  const status = result.status === 'committed' ? 'check-failed' : 'refused';
  finish(status, status === 'refused' ? 3 : 1, `Runner failed: ${String(error.message).split('\n')[0]}`);
}
NODE
