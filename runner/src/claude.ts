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
 * - With no checkout or home settings (TL-P4-01 P4-2): `--setting-sources ""` loads no user, project or local settings
 *   or CLAUDE.md (https://code.claude.com/docs/en/cli-reference; https://code.claude.com/docs/en/agent-sdk/
 *   claude-code-features, `settingSources: []`), only the policy passed with `--settings`, which excludes every
 *   CLAUDE.md and turns auto memory off; and HOME and CLAUDE_CONFIG_DIR are an empty folder of the run's own.
 * - In an empty folder of its own, under `env -i`-style allow-list from `run.sh` (`CLAUDE_ENV_ALLOWLIST`): the
 *   credential is `CLAUDE_CODE_OAUTH_TOKEN` from the instance repository's secrets (Claude Code GitHub Actions,
 *   https://code.claude.com/docs/en/github-actions), passed in its environment only, never in an argument, the
 *   input, a log line or an error.
 * - The model and the turn cap come from the environment, `BOWER_MODEL` and `BOWER_MAX_TURNS`, starting from the
 *   original's: Sonnet (`run.sh` DEFAULT_MODEL) and the Worker's `DEFAULT_MAX_TURNS` (60, runbook "Rulebook v22
 *   and the turn budget"). A setting that does not pass its check falls back with a warning naming the setting only.
 * - Its reply is intent only (TL-P4-01 P4-2): where each admitted thing goes and its new name (`intentOf`). The
 *   runner builds the run manifest from it with the scripted provider's planner (`planScripted` with `filing`), so
 *   every id, hash and digest is the runner's, then checks it against the contract and against what the run took
 *   (`outsideAdmitted`). A reply that is not intent, ran past its turn cap or size, or names anything not admitted
 *   refuses the plan before any write. The run then ends failed, saying nothing changed (`runTidy`), the truth.
 * - What it is shown (P4-3, `c04-incorporation`): each admitted thing's text, prepared by the runner (`extract.ts`),
 *   and the current text of the notes it may update (Bower's own notes under the main folders, hubs first), each
 *   bounded (`CONTEXT_BOUNDS`) with every cut marked. Its intent may carry note text: a thing's own note (its name,
 *   summary and body), and Timeline lines for the notes it was shown. The runner still builds every operation, id
 *   and digest from it (`planScripted`), and `applyChanges` alone writes a Timeline line, on Bower's notes only.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANIFEST_V2_LIMIT, parseRunManifestV2, recordableName } from '../../src/data/contracts/run-manifest';
import { PILE_NOTE } from '../../src/data/piles';
import type { Admitted, RunProvider } from '../../src/data/spine/provider';
import type { ScriptedRead } from '../../src/data/spine/read';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { planScripted, runKeys, type AuthoredLine, type AuthoredNote, type Filing, type Placement, type ScriptedRun } from '../../src/data/spine/scripted';
import { MAX_NAME } from '../../src/data/contracts/tree';
import { BowerError, PARA_ROOTS } from '../../src/data/types';
import { SYSTEM } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { extract, readable, type Extracted } from './extract';
import { outsideAdmitted } from './spine/admitted';
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
  // No CLAUDE.md or rules from any folder, and no auto memory (https://code.claude.com/docs/en/memory).
  claudeMdExcludes: ['**/CLAUDE.md', '**/CLAUDE.local.md', '**/.claude/**', '**/AGENTS.md'],
  autoMemoryEnabled: false,
} as const;

/** `run.sh`'s CLAUDE_ENV_ALLOWLIST, with the OAuth token as the one credential. */
const ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM', 'CI', 'GITHUB_ACTIONS', 'CLAUDE_CODE_OAUTH_TOKEN'] as const;

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
    // No user, project or local settings (the CLI's form of the Agent SDK's `settingSources: []`): only managed
    // policy, if the machine has one, and the policy passed here apply (cli-reference, settings precedence).
    '--setting-sources', '',
    '--settings', JSON.stringify(CLAUDE_SETTINGS),
  ];
}

/**
 * How much text the model is shown, in characters (about four to a token): each thing's text and all things' text in
 * one run; each note's text, how many notes, and all notes' text. A text past its bound is cut and ends with `CUT`,
 * saying how much was left out; one past the run's budget is not shown, and says so.
 */
export const CONTEXT_BOUNDS = { perThing: 12_000, perRun: 48_000, perNote: 4_000, notes: 12, notesPerRun: 24_000 } as const;
/** What the model may write: a note's summary and body, a Timeline line, and how many lines one reply may add. */
const AUTHORED = { summary: 200, body: 8_000, line: 200, lines: 20 } as const;
const CUT = (left: number): string => `\n[cut here: ${left} more characters not shown]`;

/** A thing as shown: its text (or null, and why), and how many characters of it were left out. */
interface ShownThing { fileId: string; name: string; kind: string; text: string | null; cut: number; why?: string }

/** What the model is shown of the folder: the piles it took, with their words and things, the notes it may update, and the folders there are. */
interface Shown {
  /** Bower's own folder (`.bower`), for the check on what the plan writes; not shown to the model. */
  own?: string;
  piles: Array<{ pileId: string; words: string; things: ShownThing[] }>;
  notes: Array<{ path: string; text: string; cut: number }>;
  folders: string[];
}

/** `text` within `room` characters: whole, cut and marked, or not shown when there is no room left. */
function bounded(text: string, room: number): { text: string | null; cut: number } {
  if (text.length <= room) return { text, cut: 0 };
  if (room <= 0) return { text: null, cut: text.length };
  return { text: text.slice(0, room) + CUT(text.length - room), cut: text.length - room };
}

/**
 * The prompt and the prepared context. The model proposes intent only (TL-P4-01 P4-2): where each admitted thing goes
 * and its new name, and where a pile of words becomes a note; since P4-3 also a thing's own note and Timeline lines.
 * The runner builds the manifest from it, with every id, hash and digest, as the scripted provider does; the model
 * never supplies one.
 */
function prepared(run: ScriptedRun, took: Admitted, shown: Shown): string {
  return [
    'You plan one Bower tidy-up. You have no tools: never try to read, write or run anything.',
    'Reply with one JSON object and nothing else, of exactly this shape:',
    '{"kind":"tidy-intent","v":1,"things":[{"fileId":"<a thing\'s fileId>","to":"<folder path>","name":"<new name>",',
    '  "note":{"name":"<note name>.md","summary":"<one line>","body":"<Markdown>"}}],',
    ' "notes":[{"pileId":"<a pile of words only>","to":"<folder path>","name":"<note name>.md"}],',
    ' "lines":[{"note":"<the path of a note below>","text":"<one line>","cites":"<a thing\'s fileId>"}]}',
    `A folder path starts with one of ${MAIN_FOLDERS.join(', ')}; missing folders are made. A thing keeps its extension`,
    '(a saved link may become a ".md" note). A thing left out stays in the inbox with its whole pile.',
    `"note" is optional: a note beside the thing, saying what it says. Use only facts from its text; invent none.`,
    `Its summary is at most ${AUTHORED.summary} characters, its body at most ${AUTHORED.body}, with no front matter and`,
    'no "## Current state", "## Timeline" or "## Bower\'s note" heading: Bower writes those. A saved link filed as a note takes none.',
    `"lines" is optional: at most ${AUTHORED.lines} Timeline lines, each at most ${AUTHORED.line} characters with no link, added only`,
    'to the notes listed under "notes" below; "cites" (optional) names a thing you file, and Bower links it.',
    'Each thing\'s "text" is what Bower read from it, cut where marked "[cut here: ...]". When "text" is null, "why" says why:',
    'pictures and scanned PDFs are not read yet (OCR comes later), so file them by name and words only.',
    'Name only the things, piles and notes below. Never add ids, hashes or other keys: Bower computes them, checks your',
    'reply, and refuses the whole reply if it names anything else; then nothing changes.',
    '',
    JSON.stringify({ runId: run.runId, admission: took.taken.id, piles: shown.piles, notes: shown.notes, folders: shown.folders }),
  ].join('\n');
}

/** The main folders a model may file into: never the inbox, Bower's own files or the top of the folder. */
const MAIN_FOLDERS: readonly string[] = PARA_ROOTS.filter((root) => root !== 'Inbox');

/**
 * What the run shows the model: the admitted piles (their words, things and each thing's bounded text), the notes it
 * may update with their bounded text, and the folder paths under main folders. A read that fails stops the run as
 * any read does; only a text that cannot be made out is shown as none, with why.
 */
async function shownOf(read: ScriptedRead, run: ScriptedRun, took: Admitted): Promise<Shown> {
  const listing = await read.listAll(run.rootId);
  const ix = VaultIndex.build(run.rootId, listing);
  const inMain = (path: string | undefined): path is string => path !== undefined && MAIN_FOLDERS.includes(path.split('/')[0] ?? '');
  const folders = listing.flatMap((f) => {
    const path = f.folder ? ix.pathOf(f.id) : undefined;
    return inMain(path) ? [path] : [];
  }).sort();
  const words = new Map((await read.piles(run.rootId)).map((p) => [p.id, p]));
  const piles: Shown['piles'] = [];
  const texts: Array<{ thing: ShownThing; text: string }> = [];
  for (const p of took.taken.piles) {
    const pile = words.get(p.pileId);
    const kinds = new Map((pile?.items ?? []).map((i) => [i.id, i.kind]));
    const things: ShownThing[] = [];
    for (const i of thingsOf(p)) {
      const got: Extracted = readable(i.name) ?? (await extract(i.name, await read.readBytes(i.fileId)));
      const thing: ShownThing = { fileId: i.fileId, name: i.name, kind: kinds.get(i.fileId) ?? 'other', text: null, cut: 0 };
      if (got.text === null) thing.why = got.why;
      else texts.push({ thing, text: got.text });
      things.push(thing);
    }
    piles.push({ pileId: p.pileId, words: pile?.text ?? '', things });
  }
  // The run's budget shared out shortest first (water-filling): each text gets an equal share of what is left, at
  // most its own bound, so the short ones are whole and the long ones are cut evenly.
  let room: number = CONTEXT_BOUNDS.perRun;
  const byLength = [...texts].sort((a, b) => a.text.length - b.text.length);
  for (const [n, { thing, text }] of byLength.entries()) {
    const share = Math.floor(room / (byLength.length - n));
    const shown = bounded(text, Math.min(CONTEXT_BOUNDS.perThing, share));
    thing.text = shown.text;
    thing.cut = shown.cut;
    if (shown.text === null) thing.why = "past this run's text budget: not shown";
    room -= text.length - shown.cut;
  }
  return { own: ix.file(SYSTEM.dir)?.id, piles, notes: await notesShown(read, listing, ix), folders };
}

/**
 * The notes a model may add Timeline lines to, with their current text: Bower's own notes under the main folders
 * (marked by Bower, or a hub named as its folder), hubs first, then by path, at most `CONTEXT_BOUNDS.notes`.
 * `applyChanges` still refuses a line on a note that is not Bower's.
 */
async function notesShown(read: ScriptedRead, listing: readonly DriveFile[], ix: VaultIndex): Promise<Shown['notes']> {
  const hubOf = (path: string): boolean => {
    const parts = path.split('/');
    return parts.length > 1 && parts.at(-1) === `${parts.at(-2) ?? ''}.md`;
  };
  const candidates = listing.flatMap((f) => {
    const path = f.folder ? undefined : ix.pathOf(f.id);
    if (path === undefined || !/\.md$/i.test(path) || !MAIN_FOLDERS.includes(path.split('/')[0] ?? '')) return [];
    return f.appProperties?.by === 'bower' || hubOf(path) ? [{ f, path, hub: hubOf(path) }] : [];
  }).sort((a, b) => Number(b.hub) - Number(a.hub) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).slice(0, CONTEXT_BOUNDS.notes);
  let room: number = CONTEXT_BOUNDS.notesPerRun;
  const notes: Shown['notes'] = [];
  for (const { f, path } of candidates) {
    if (room <= 0) break;
    const text = await read.readText(f.id);
    const shown = bounded(text, Math.min(CONTEXT_BOUNDS.perNote, room));
    if (shown.text === null) break;
    room -= text.length - shown.cut;
    notes.push({ path, text: shown.text, cut: shown.cut });
  }
  return notes;
}

/** A pile's things: its admitted files, but a pile folder's notes (its words). */
const thingsOf = (p: Admitted['taken']['piles'][number]): Admitted['taken']['piles'][number]['items'] => p.items.filter((i) => !(p.anchor && i.name === PILE_NOTE));

/** A file name's extension, lower case, with its dot; '' when it has none. */
const extensionOf = (name: string): string => /(\.[^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/**
 * Bidi controls and invisible characters (Unicode UAX #9 explicit formatting; Trojan Source, CVE-2021-42574): a name
 * that shows other than it is.
 */
const HIDDEN_CHARS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;
/** One part of a name as the app allows it: recordable, at most MAX_NAME, not hidden, no edge spaces or hidden marks. */
const partOk = (part: string): boolean =>
  recordableName(part) && part.length <= MAX_NAME && !part.startsWith('.') && part.trim() === part && !HIDDEN_CHARS.test(part);
/** A folder path a model may file into: such parts under a main folder, none named like a note. */
const placeOk = (to: unknown): to is string =>
  typeof to === 'string' && MAIN_FOLDERS.includes(to.split('/')[0] ?? '') && to.split('/').length <= 8 && to.split('/').every((part) => partOk(part) && !/\.md$/i.test(part));
/** A new name a model may give: one such part, its extension not counted (as the app counts it, `contracts/tree.ts`). */
const nameOk = (name: unknown): name is string => typeof name === 'string' && partOk(name.replace(/\.[A-Za-z0-9]{1,5}$/, '')) && partOk(name);

const exactly = (value: unknown, keys: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
  && keys.every((k) => k in value) && Object.keys(value).every((k) => keys.includes(k) || optional.includes(k));

type Intent = { ok: true; filing: Filing; held: Set<string> } | { ok: false; why: string };

/** Bower's sections and front matter: a model's note body never carries one, so it cannot pass for Bower's own. */
const OWN_SECTION = /^(?:---\s*|##\s*(?:current state|timeline|bower's note)\s*)$/im;
/** Control characters (but a body's line breaks and tabs) and lone surrogates: text no note should carry. */
const CONTROL = { test: (text: string): boolean => [...text].some((c) => {
  const n = c.codePointAt(0) ?? 0;
  return (n < 0x20 && c !== '\n' && c !== '\t') || n === 0x7f || (n >= 0xd800 && n <= 0xdfff);
}) };
/** A line of text a model may write: one line, within `max`, with no control character or hidden mark. */
const lineOk = (text: unknown, max: number): text is string =>
  typeof text === 'string' && text.trim() !== '' && text.length <= max && !/[\r\n\t]/.test(text) && !CONTROL.test(text) && !HIDDEN_CHARS.test(text);

/** A thing's own note as the model wrote it, or why it is refused. */
function authoredOf(n: unknown): AuthoredNote | string {
  if (!exactly(n, ['name', 'summary', 'body'])) return 'a note with keys outside the intent';
  if (!nameOk(n.name) || extensionOf(n.name) !== '.md') return 'a note name that is not a note';
  if (!lineOk(n.summary, AUTHORED.summary)) return 'a note summary that is not one short line';
  const body = typeof n.body === 'string' ? n.body.replace(/\r\n?/g, '\n') : null;
  if (body === null || body.length > AUTHORED.body || CONTROL.test(body) || HIDDEN_CHARS.test(body)) return 'a note body past its bound';
  if (OWN_SECTION.test(body)) return "a note body with one of Bower's sections";
  return { name: n.name, summary: n.summary.trim(), body: body.trim() };
}

/**
 * The model's intent, checked against what the run took: only admitted things and piles, only places under a main
 * folder, names that keep their thing's kind, notes and lines within their bounds, lines only on the notes it was
 * shown (`notes`), and no other key (no id, hash or digest of its own). Anything else refuses the whole reply. A pile
 * with a thing left out waits whole for the next run.
 */
export function intentOf(value: unknown, took: Admitted, notes: ReadonlySet<string> = new Set()): Intent {
  if (!exactly(value, ['kind', 'v', 'things'], ['notes', 'lines']) || value.kind !== 'tidy-intent' || value.v !== 1) return { ok: false, why: 'a reply that is not a tidy-up intent' };
  const { things, notes: worded = [], lines = [] } = value;
  if (!Array.isArray(things) || !Array.isArray(worded) || !Array.isArray(lines)) return { ok: false, why: 'a reply that is not a tidy-up intent' };
  const piles = new Map(took.taken.piles.map((p) => [p.pileId, p]));
  const admitted = new Map(took.taken.piles.flatMap((p) => thingsOf(p).map((i) => [i.fileId, { pileId: p.pileId, name: i.name }] as const)));
  const placed = new Map<string, Placement>();
  const authored = new Map<string, AuthoredNote>();
  for (const t of things as unknown[]) {
    if (!exactly(t, ['fileId', 'to', 'name'], ['note'])) return { ok: false, why: 'a thing with keys outside the intent' };
    const thing = typeof t.fileId === 'string' ? admitted.get(t.fileId) : undefined;
    if (!thing || typeof t.fileId !== 'string') return { ok: false, why: 'a thing it was not admitted to take' };
    if (placed.has(t.fileId)) return { ok: false, why: 'a thing placed twice' };
    if (!placeOk(t.to)) return { ok: false, why: 'a place outside the main folders' };
    const was = extensionOf(thing.name);
    if (!nameOk(t.name) || !(extensionOf(t.name) === was || (was === '.url' && extensionOf(t.name) === '.md'))) return { ok: false, why: 'a name that changes what a thing is' };
    placed.set(t.fileId, { to: t.to, name: t.name });
    if ('note' in t) {
      // A saved link filed as a note is that note: it takes no second one.
      if (extensionOf(t.name) === '.md') return { ok: false, why: 'a note for a thing filed as a note' };
      const note = authoredOf(t.note);
      if (typeof note === 'string') return { ok: false, why: note };
      authored.set(t.fileId, note);
    }
  }
  const words = new Map<string, Placement>();
  for (const n of worded as unknown[]) {
    if (!exactly(n, ['pileId', 'to', 'name'])) return { ok: false, why: 'a note with keys outside the intent' };
    if (typeof n.pileId !== 'string' || !piles.has(n.pileId)) return { ok: false, why: 'a pile it was not admitted to take' };
    if (words.has(n.pileId)) return { ok: false, why: 'a pile placed twice' };
    if (!placeOk(n.to)) return { ok: false, why: 'a place outside the main folders' };
    if (!nameOk(n.name) || extensionOf(n.name) !== '.md') return { ok: false, why: 'a note name that is not a note' };
    words.set(n.pileId, { to: n.to, name: n.name });
  }
  if (lines.length > AUTHORED.lines) return { ok: false, why: 'more Timeline lines than one reply may add' };
  const timeline: AuthoredLine[] = [];
  for (const l of lines as unknown[]) {
    if (!exactly(l, ['note', 'text'], ['cites'])) return { ok: false, why: 'a line with keys outside the intent' };
    if (typeof l.note !== 'string' || !notes.has(l.note)) return { ok: false, why: 'a line on a note it was not shown' };
    if (!lineOk(l.text, AUTHORED.line) || /\[\[|\]\]|·/.test(l.text)) return { ok: false, why: 'a Timeline line that is not one short line' };
    if ('cites' in l && (typeof l.cites !== 'string' || !placed.has(l.cites))) return { ok: false, why: 'a line citing a thing it does not file' };
    timeline.push({ path: l.note, text: l.text.trim(), cites: typeof l.cites === 'string' ? l.cites : null });
  }
  const held = new Set(took.taken.piles.filter((p) => thingsOf(p).some((i) => !placed.has(i.fileId))).map((p) => p.pileId));
  return { ok: true, held, filing: { thing: (id) => placed.get(id) ?? null, words: (id) => words.get(id) ?? null, note: (id) => authored.get(id) ?? null, lines: timeline } };
}

/** The runner's environment cut down to the allow-list, with a home of the run's own. */
function claudeEnv(env: Readonly<Record<string, string | undefined>>, home: string): Record<string, string> {
  // HOME and the config folder are an empty folder of the run's own: nothing of the runner's user reaches claude.
  const kept: Record<string, string> = { HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
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
    inputTokens: n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_textsinput_tokens),
    outputTokens: n(u.output_tokens),
  };
}

/** The token said nowhere: each place it shows in `text` replaced. */
const hidden = (text: string, token: string | undefined): string => (token ? text.split(token).join('[hidden]') : text);

export function claudeProvider(setup: ClaudeSetup, run: ScriptedRun, read: ScriptedRead): RunProvider {
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
    const shown = await shownOf(read, run, took);
    const input = prepared(run, took, shown);
    // Its own empty folder, with an empty home in it: no checkout's or person's settings or CLAUDE.md to find.
    const work = await mkdtemp(join(tmpdir(), 'bower-claude-'));
    let exit: ClaudeExit;
    try {
      const home = join(work, 'home');
      const cwd = join(work, 'run');
      await mkdir(home);
      await mkdir(cwd);
      const call = {
        command: 'claude',
        args: claudeArgs(model, maxTurns),
        env: claudeEnv(setup.env, home),
        cwd,
        input,
        timeoutMs: TIME_LIMIT_MS,
        maxBytes: REPLY_LIMIT,
      };
      const ask = (): Promise<ClaudeExit> => (setup.spawn ?? spawnClaude)(call);
      exit = setup.timing ? await setup.timing.time('model', ask) : await ask();
    } catch (e) {
      return refuse(`claude could not start (${e instanceof Error ? e.message : String(e)})`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    const stats = statsOf(exit.stdout);
    if (setup.timing && stats) setup.timing.model = stats;
    const reply = replyOf(exit, maxTurns);
    if (!reply.ok) return refuse(reply.why, exit.stderr);
    const intent = intentOf(reply.value, took, new Set(shown.notes.map((n) => n.path)));
    if (!intent.ok) return refuse(intent.why);
    // The runner builds the manifest, every id, hash and digest its own, exactly as the scripted provider does.
    const t = took.taken;
    const plan = await planScripted(read, run.rootId, { scope: t.scope, allowWeb: run.allowWeb, runId: run.runId, requestId: t.id, requestedAt: t.at, taken: t, mintKey: await runKeys(run.runId), filing: intent.filing, updates: [] }, undefined, intent.held);
    const manifest: RunManifest = plan.manifest;
    const parsed = await parseRunManifestV2((await canonical(manifest)).bytes, run.rootId);
    if (!parsed.ok) return refuse(`outside the run manifest contract (${parsed.reason})`);
    const stray = outsideAdmitted(manifest, took, shown.own);
    if (stray) return refuse(stray);
    console.log(`The Claude provider planned ${manifest.operations.length} operations with ${model}.`);
    return manifest;
  };
}
