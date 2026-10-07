/**
 * The Claude provider (TL-P4-01, `claude-provider`): a run's plan from headless Claude Code, behind the same
 * `RunProvider` as the scripted one. Claude only answers; the spine stays the only thing that changes Drive.
 *
 * - It runs `claude -p --output-format json` (Claude Code headless mode,
 *   https://code.claude.com/docs/en/headless; flags in https://code.claude.com/docs/en/cli-reference) with the
 *   prepared context on stdin, as the original's `agent/run.sh` does (#967: never one huge argument).
 * - Under the original's permission policy (`agent/claude-settings.json`, Claude Code settings and permissions,
 *   https://code.claude.com/docs/en/settings, https://code.claude.com/docs/en/iam): its deny list kept, and here no
 *   tool at all (`--tools ""`), every tool that writes, runs a shell or reaches the network denied as well, no MCP
 *   server (`--strict-mcp-config`, so nothing reaches Drive) and nothing that may ask (`--permission-mode dontAsk`).
 * - In an empty folder of its own, under `env -i`-style allow-list from `run.sh` (`CLAUDE_ENV_ALLOWLIST`): the
 *   credential is `CLAUDE_CODE_OAUTH_TOKEN` from the instance repository's secrets (Claude Code GitHub Actions,
 *   https://code.claude.com/docs/en/github-actions), passed in its environment only, never in an argument, the
 *   input, a log line or an error.
 * - The model and the turn cap come from the environment, `BOWER_MODEL` and `BOWER_MAX_TURNS`, starting from the
 *   original's: Sonnet (`run.sh` DEFAULT_MODEL) and the Worker's `DEFAULT_MAX_TURNS` (60, runbook "Rulebook v22
 *   and the turn budget"). A setting that does not pass its check falls back with a warning naming the setting only.
 * - Its reply is a run manifest (the contract the scripted provider fills, `src/data/contracts/run-manifest.ts`). It
 *   is parsed and checked against that contract and against what the run was admitted to take; a reply that is not
 *   one, ran past its turn cap or size, or plans for another run or another thing, refuses the plan before any
 *   write. The run then ends failed, saying nothing changed (`runTidy`), which is the truth.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANIFEST_V2_LIMIT, parseRunManifestV2 } from '../../src/data/contracts/run-manifest';
import type { Admitted, RunProvider } from '../../src/data/spine/provider';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import type { ScriptedRun } from '../../src/data/spine/scripted';
import { BowerError } from '../../src/data/types';
import type { ModelStats, RunTiming } from './timing';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_MAX_TURNS = 60;
/** The original's AGENT_TIME_LIMIT: 15 minutes, inside the job's own limit. */
const TIME_LIMIT_MS = 900_000;
/** The reply's cap: a manifest at its limit, escaped once into the result string, and the envelope around it. */
const REPLY_LIMIT = 2 * MANIFEST_V2_LIMIT + 64 * 1024;

/** `agent/claude-settings.json`'s deny list, as the original has it. */
const ORIGINAL_DENY = [
  'Write(CLAUDE.md)', 'Write(**/CLAUDE.md)', 'Edit(CLAUDE.md)', 'Edit(**/CLAUDE.md)', 'MultiEdit(CLAUDE.md)', 'MultiEdit(**/CLAUDE.md)',
  'Write(README.md)', 'Edit(README.md)', 'MultiEdit(README.md)',
  'Write(.claude/**)', 'Edit(.claude/**)', 'MultiEdit(.claude/**)',
  'Write(.obsidian/**)', 'Edit(.obsidian/**)', 'MultiEdit(.obsidian/**)',
  'Bash(*://*)', 'Read(//proc/**)', 'Read(//etc/**)', 'Read(//root/**)', 'Read(../**)',
];
/** What the original let the agent do in its local copy and this provider does not: write, run a shell, go online. */
const NO_EFFECT_DENY = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task'];

/** The settings `claude` runs under (`--settings`, as JSON so the one-file runner bundle needs no file beside it). */
export const CLAUDE_SETTINGS = {
  permissions: { blockReadsOutsideWorkingDirectories: true, deny: [...ORIGINAL_DENY, ...NO_EFFECT_DENY] },
  disableAllHooks: true,
} as const;

/** `run.sh`'s CLAUDE_ENV_ALLOWLIST, with the OAuth token as the one credential. */
const ENV_ALLOWLIST = ['HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'CI', 'GITHUB_ACTIONS', 'CLAUDE_CODE_OAUTH_TOKEN'] as const;

/** One run of `claude`: what it is started with. */
export interface ClaudeCall {
  command: string;
  args: string[];
  /** Its whole environment: nothing else of the runner's reaches it. */
  env: Record<string, string>;
  cwd: string;
  /** The prompt with the prepared context, on stdin. */
  input: string;
  timeoutMs: number;
  maxBytes: number;
}

/** How it ended: `cut` when it was stopped at its time or size cap. */
export interface ClaudeExit {
  code: number | null;
  stdout: string;
  stderr: string;
  cut: 'time' | 'size' | null;
}

export type ClaudeSpawn = (call: ClaudeCall) => Promise<ClaudeExit>;

/** What the provider is handed: the runner's environment, and (in tests only) a recorded `claude`. */
export interface ClaudeSetup {
  env: Readonly<Record<string, string | undefined>>;
  spawn?: ClaudeSpawn;
  /** The run's timing line, which gets the model step's numbers. */
  timing?: RunTiming;
}

/** One sentence for the person; the details go to `console.error`. */
const PLAN_REFUSED = "Bower couldn't plan this tidy-up. Try again.";

/** The model and turn cap from the environment, each falling back to the original's with a warning. */
export function claudeLimits(env: Readonly<Record<string, string | undefined>>): { model: string; maxTurns: number } {
  let model = env.BOWER_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^[a-z][a-z0-9.-]*$/.test(model)) {
    console.warn(`warning: BOWER_MODEL is not a model name, using ${DEFAULT_MODEL}`);
    model = DEFAULT_MODEL;
  }
  const turns = env.BOWER_MAX_TURNS?.trim();
  let maxTurns = DEFAULT_MAX_TURNS;
  if (turns) {
    if (/^[1-9][0-9]{0,3}$/.test(turns)) maxTurns = Number(turns);
    else console.warn(`warning: BOWER_MAX_TURNS is not a number of turns, using ${DEFAULT_MAX_TURNS}`);
  }
  return { model, maxTurns };
}

/** The arguments `claude` runs with: print mode, JSON out, the model and cap, no tool, no MCP server, the policy. */
export function claudeArgs(model: string, maxTurns: number): string[] {
  return [
    '-p', '--output-format', 'json', '--model', model, '--max-turns', String(maxTurns),
    '--tools', '', '--strict-mcp-config', '--permission-mode', 'dontAsk', '--no-session-persistence',
    '--settings', JSON.stringify(CLAUDE_SETTINGS),
  ];
}

/** The prompt and the prepared context: the run, and exactly what it was admitted to take. */
function prepared(run: ScriptedRun, took: Admitted): string {
  return [
    'You plan one Bower tidy-up. You have no tools: never try to read, write or run anything.',
    'Reply with one JSON object and nothing else: the run manifest (kind "run-manifest", v 1, or v 2 when it holds an',
    'edit-text) for the run below, planning only the piles, things and journal lines in "admitted".',
    'Bower checks it against the contract and against what was admitted; anything else is refused and nothing changes.',
    '',
    JSON.stringify({ run, admitted: took }),
  ].join('\n');
}

/** The runner's environment cut down to the allow-list. */
function claudeEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of ENV_ALLOWLIST) {
    const value = env[name];
    if (value) kept[name] = value;
  }
  return kept;
}

/** Starts `claude` with only its call's environment, feeds stdin, and stops it at its time or size cap. */
export const spawnClaude: ClaudeSpawn = (call) =>
  new Promise((resolve, reject) => {
    const child = spawn(call.command, call.args, { cwd: call.cwd, env: call.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let cut: ClaudeExit['cut'] = null;
    const stop = (why: 'time' | 'size'): void => {
      cut ??= why;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop('time'), call.timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      size += chunk.length;
      if (size > call.maxBytes) stop('size');
      else stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (stderr.length < 64_000) stderr += chunk;
    });
    // A closed stdin (claude ended early) is told by its exit, kept with its stderr.
    child.stdin.on('error', (e: Error) => {
      stderr += `\n(stdin: ${e.message})`;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, cut });
    });
    child.stdin.end(call.input);
  });

type Read = { ok: true; value: unknown } | { ok: false; why: string };

/** The manifest JSON out of `claude -p --output-format json`'s result, or why there is none. */
function replyOf(exit: ClaudeExit, maxTurns: number): Read {
  if (exit.cut) return { ok: false, why: `stopped at its ${exit.cut} cap` };
  let envelope: unknown;
  try {
    envelope = JSON.parse(exit.stdout);
  } catch {
    return { ok: false, why: `exit ${exit.code}, no JSON result` };
  }
  if (!envelope || typeof envelope !== 'object' || (envelope as { type?: unknown }).type !== 'result') return { ok: false, why: `exit ${exit.code}, not a result` };
  const { subtype, is_error: isError, num_turns: turns, result } = envelope as Record<string, unknown>;
  if (subtype === 'error_max_turns' || (typeof turns === 'number' && turns > maxTurns)) return { ok: false, why: `over its turn cap of ${maxTurns}` };
  if (subtype !== 'success' || isError !== false || exit.code !== 0) return { ok: false, why: `an error result (${String(subtype)}, exit ${exit.code})` };
  if (typeof result !== 'string') return { ok: false, why: 'a result with no text' };
  const text = result.trim().replace(/^```(?:json)?\n([\s\S]*)\n```$/, '$1');
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, why: 'a result that is not JSON' };
  }
}

/** The model step's numbers from the JSON result, when it has them; only numbers are kept. */
function statsOf(stdout: string): ModelStats | null {
  let r: unknown;
  try {
    r = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!r || typeof r !== 'object') return null;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const { duration_ms: wall, duration_api_ms: api, num_turns: turns, usage } = r as Record<string, unknown>;
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  return {
    wallMs: n(wall),
    apiMs: n(api),
    turns: n(turns),
    inputTokens: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens),
    outputTokens: n(u.output_tokens),
  };
}

/** Why a manifest that passed the contract still is not this run's, planned from what it took; null when it is. */
function notAdmitted(m: RunManifest, run: ScriptedRun, took: Admitted): string | null {
  const t = took.taken;
  if (m.runId !== run.runId) return 'planned for another run';
  if (m.requestId !== t.id || m.runScope !== t.scope || m.requestedAt !== t.at || m.allowWeb !== run.allowWeb) return 'planned for another request';
  const piles = new Map(t.piles.map((p) => [p.pileId, p]));
  const things = new Set(t.piles.flatMap((p) => p.items.map((i) => i.fileId)));
  const lines = new Set(t.journal.map((j) => j.fileId));
  if (m.capture.piles.some((p) => !piles.has(p.pileId) || (p.anchor !== null && p.anchor.fileId !== piles.get(p.pileId)?.anchor?.fileId))) return 'a pile it was not admitted to take';
  if (m.capture.members.some((x) => !things.has(x.file.fileId))) return 'a thing it was not admitted to take';
  if (m.capture.journal.some((j) => j.fileIds.some((id) => !lines.has(id)))) return 'a change it was not admitted to read';
  return null;
}

/** The token said nowhere: each place it shows in `text` replaced. */
const hidden = (text: string, token: string | undefined): string => (token ? text.split(token).join('[hidden]') : text);

export function claudeProvider(setup: ClaudeSetup, run: ScriptedRun): RunProvider {
  const token = setup.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || undefined;
  const refuse = (why: string, stderr = ''): never => {
    const tail = stderr.trim() ? `; claude said: ${stderr.trim().slice(-2000)}` : '';
    console.error(hidden(`The Claude provider's plan for run ${run.runId} is refused: ${why}${tail}`, token));
    throw new BowerError('unknown', PLAN_REFUSED);
  };
  return async (took) => {
    if (took.taken.rootId !== run.rootId) return refuse('the admitted set is for another folder');
    if (!token) return refuse('no Claude credential (CLAUDE_CODE_OAUTH_TOKEN is not set)');
    const { model, maxTurns } = claudeLimits(setup.env);
    const cwd = await mkdtemp(join(tmpdir(), 'bower-claude-'));
    let exit: ClaudeExit;
    try {
      const call = {
        command: 'claude',
        args: claudeArgs(model, maxTurns),
        env: claudeEnv(setup.env),
        cwd,
        input: prepared(run, took),
        timeoutMs: TIME_LIMIT_MS,
        maxBytes: REPLY_LIMIT,
      };
      const ask = (): Promise<ClaudeExit> => (setup.spawn ?? spawnClaude)(call);
      exit = setup.timing ? await setup.timing.time('model', ask) : await ask();
    } catch (e) {
      return refuse(`claude could not start (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
    const stats = statsOf(exit.stdout);
    if (setup.timing && stats) setup.timing.model = stats;
    const reply = replyOf(exit, maxTurns);
    if (!reply.ok) return refuse(reply.why, exit.stderr);
    let bytes: Uint8Array;
    try {
      bytes = (await canonical(reply.value)).bytes;
    } catch (e) {
      return refuse(`a reply that cannot be recorded (${e instanceof Error ? e.message : String(e)})`);
    }
    const parsed = await parseRunManifestV2(bytes, run.rootId);
    if (!parsed.ok) return refuse(`outside the run manifest contract (${parsed.reason})`);
    const manifest: RunManifest = parsed.value;
    const stray = notAdmitted(manifest, run, took);
    if (stray) return refuse(stray);
    console.log(`The Claude provider planned ${manifest.operations.length} operations with ${model}.`);
    return manifest;
  };
}
