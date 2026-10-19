/**
 * Runs a corpus case with the scripted provider over the runner's pretend Drive v3 (as `main.test.ts` does) and
 * returns what the scorer needs: the folder after the run and the parsed `last-run.json`.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { Pacing } from '../../src/data/drive/transport';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { isJournalRecord } from '../../src/data/contracts/journal-record';
import type { Question, RunState } from '../../src/data/contracts/types';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { main } from '../src/main';
import { phaseAwareClaude, type PlanningFixture } from './b1-planning-support';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { CORPUS_EXECUTION, matchesSubject, scoreCase, type CorpusBetween, type CorpusPress, type LoadedCase, type Score } from '../src/corpus';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

export const AT = Date.UTC(2026, 9, 7, 9);

/** The one complete scorer lives in `runner/src/corpus.ts` (corpus-scorer-home); the driver's consumers import it here too. */
export { scoreCase };

/**
 * What the model reads on a call (c12-prefix): its `--system-prompt-file`, then `\n`, then stdin; stdin alone for a call
 * that names none. Call it inside the spawn: the file is removed with the run's folder.
 */
export function promptOf(call: ClaudeCall): string {
  const system = systemOf(call);
  return system === null ? call.input : `${system}\n${call.input}`;
}

/** A call's `--system-prompt-file` text, or `null` when it names none; read inside the spawn, as `promptOf`. */
export function systemOf(call: ClaudeCall): string | null {
  const at = call.args.indexOf('--system-prompt-file');
  return at < 0 ? null : readFileSync(call.args[at + 1] ?? '', 'utf8');
}

/**
 * A prompt (`promptOf`) as instructions and data: the fixed text above the boundary and every line below it that is not
 * JSON (the type table, the call's task, a retry note), then the JSON lines below it (the run context, the call text).
 */
export function splitPrompt(prompt: string): { instructions: string; data: string } {
  const [fixed = '', below = prompt] = prompt.includes('\n__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__\n') ? prompt.split('\n__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__\n') : ['', prompt];
  const lines = below.split('\n');
  return { instructions: [fixed, ...lines.filter((l) => !l.startsWith('{'))].join('\n'), data: lines.filter((l) => l.startsWith('{')).join('\n') };
}

/** The JSON lines of a prompt (`promptOf`), the run context's and the call's, as one record; what `frameOf` gives in the spawn. */
export const dataOf = <T = Record<string, unknown>>(prompt: string): T =>
  withCards(Object.assign({}, ...splitPrompt(prompt).data.split('\n').filter(Boolean).map((l) => JSON.parse(l) as object))) as T;

/** The test view (c12-map-cards ruling 2): each `sources[].candidates` id is resolved to its card from `cards`. */
function withCards<T extends object>(data: T): T {
  const { cards, sources } = data as { cards?: Array<{ id: string }>; sources?: Array<{ candidates: unknown[] }> };
  if (!Array.isArray(cards) || !Array.isArray(sources)) return data;
  return { ...data, sources: sources.map((s) => ({ ...s, candidates: s.candidates.map((id) => cards.find((c) => c.id === id) ?? { id }) })) };
}

/** The last JSON line of a text, parsed: a retry note comes after it (c12-prefix). */
export const lastJson = <T = Record<string, unknown>>(text: string): T =>
  JSON.parse(text.split('\n').findLast((l) => l.startsWith('{')) ?? '{}') as T;

/**
 * The JSON the model reads on a call, the run context's line (the prompt file's last) and the call's own, as one record;
 * typed as the caller reads it, as `JSON.parse` is.
 */
export function frameOf<T = Record<string, unknown>>(call: ClaudeCall): T {
  const system = systemOf(call);
  return withCards({ ...(system === null ? {} : lastJson<object>(system)), ...lastJson<object>(call.input) }) as T;
}

/** The planner's two phases are told apart for `claude`; a synopsis call (B10) goes to it as it is, in no phase. */
function withPhases(claude: ClaudeSpawn, fixture: () => PlanningFixture): ClaudeSpawn {
  const phased = phaseAwareClaude(claude, fixture);
  return (call) => 'synopsis' in (lastJson(call.input) as object) ? claude(call) : phased(call);
}

async function ensureFolder(drive: FakeDrive, root: string, cache: Map<string, string>, path: string): Promise<string> {
  let parent = root;
  let at = '';
  for (const part of path.split('/').filter(Boolean)) {
    at = at ? `${at}/${part}` : part;
    let id = cache.get(at);
    if (!id) {
      id = (await drive.createFolder(parent, part)).id;
      cache.set(at, id);
    }
    parent = id;
  }
  return parent;
}

/** What the app records on a thing it adds: its name as added, and for a pasted link its kind. */
function asAdded(name: string): Record<string, string> {
  return /\.url$/i.test(name) ? { asAdded: name.replace(/\.url$/i, ''), kind: 'link' } : { asAdded: name };
}

export interface CaseRun {
  /** Test observations for same-run redispatch; never used by production or by the scorer. */
  dispatch?: { runId: string; scope: 'all' | 'instructions'; admission: AdmissionManifest };
  wire?: DriveV3;
  /** Request records actually admitted to this press, retaining each journal line's identity. */
  requests?: Array<{ id: string; text: string }>;
  /** How a later explicit or default request reached the active journal before admission. */
  requestAction?: { kind: 'replay'; id: string; outcome: 'redispatched' } | { kind: 'tidy'; id: string };
  /** The final expectations and, when supplied, every press's expectations. */
  score?: Score;
  /** The folder after the run, path to text; folders and the Bin are left out. */
  after: Record<string, string>;
  pathsById: Record<string, string>;
  /** Prior runs over this same Drive, for ownership and lifecycle assertions. */
  runs?: CaseRun[];
  /** Each file's appProperties after the run, by the same paths (none: no entry). */
  props: Record<string, Record<string, string>>;
  lastRun: unknown;
  code: number;
  /** The pretend Drive the run worked on, and the folder's id in it, for what a test does after the run (an undo). */
  drive: FakeDrive;
  root: string;
}

export async function runScripted(c: LoadedCase, around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch, realTokens = false, before?: Before, env?: Record<string, string>): Promise<CaseRun> {
  return runCase(c, { around, realTokens, ...(before ? { before } : {}), ...(env ? { env } : {}) });
}

/**
 * Runs a case through the Claude provider with `claude` answering in place of the model: a recorded reply, or
 * scripted proposals in the same intent shape (P4-3). No live call.
 */
export async function runWithClaude(c: LoadedCase, claude: ClaudeSpawn, props?: Record<string, Record<string, string>>, before?: Before): Promise<CaseRun> {
  return runCase(c, { claude, ...(props ? { props } : {}), ...(before ? { before } : {}) });
}

/** What a test does to the folder once the case is in it and before admission (the person binning a file). */
export type Before = (drive: FakeDrive, root: string) => Promise<void>;

interface CaseOptions {
  pacing?: Partial<Pacing>;
  /** A valid Worker admission for feed-only/no-item runs, fixed by the test before main. */
  admission?: AdmissionManifest;
  request?: CorpusPress['request'];
  /** The immutable run to redispatch for an explicit replay; never restore archived bytes. */
  replayOf?: CaseRun;
  /** A yes schedules the next press through answerQuestion, with the app's scope and idempotency key. */
  answerStart?: { scope: 'all' | 'instructions'; subject?: string; requestId: string };
  around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch;
  realTokens?: boolean;
  claude?: ClaudeSpawn;
  /** More appProperties for some of the case's folder files, by path (as an older run or the original app left them). */
  props?: Record<string, Record<string, string>>;
  before?: Before;
  /** More environment for the runner (what the executor provides, for example the region). */
  env?: Record<string, string>;
}

/**
 * Puts a case's folder on `drive` as `runCase` does (its notes, Bower's files, questions, journal and inbox) under a new
 * `Bower` folder in `parent`; its id. The real-adapter world seeds a case with it (`real-world.ts`).
 */
export async function seedCase(drive: FakeDrive, c: LoadedCase, props: Record<string, Record<string, string>> = {}, parent = 'root'): Promise<string> {
  const root = (await drive.createFolder(parent, 'Bower')).id;
  const folders = new Map<string, string>();
  const inbox = await ensureFolder(drive, root, folders, 'Inbox');
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await ensureFolder(drive, root, folders, name);
  const sys = await ensureFolder(drive, root, folders, SYSTEM.dir);
  const changes = await ensureFolder(drive, root, folders, SYSTEM.changes);
  await drive.createText(sys, 'questions.json', `${JSON.stringify({ v: 1, questions: c.questions })}\n`);
  for (const [path, text] of Object.entries(c.folder)) {
    const parts = path.split('/');
    const name = parts.pop() ?? path;
    const parent = await ensureFolder(drive, root, folders, parts.join('/'));
    const own = c.bowerOwned.includes(path) || /^by: bower$/m.test(text) ? { by: 'bower' } : undefined;
    await drive.createText(parent, name, text, own || props[path] ? { ...own, ...props[path] } : undefined);
  }
  for (const [path, bytes] of Object.entries(c.folderBinary)) {
    const parts = path.split('/');
    const name = parts.pop() ?? path;
    await drive.upload(await ensureFolder(drive, root, folders, parts.join('/')), name, new Blob([bytes.slice()]));
  }
  for (const [i, line] of c.journal.entries()) {
    const rec = { v: 1, id: `change-${i + 1}`, device: 'device-1', at: AT - 60_000 + i, kind: line.kind, what: line.kind === 'answer' ? 'Answered a question' : line.kind === 'rule' ? 'A rule' : `Asked Bower: "${line.text}"`, text: line.text, ...(line.questionId ? { questionId: line.questionId } : {}) };
    await drive.createText(changes, `change-${i + 1}.json`, `${JSON.stringify(rec)}\n`);
  }
  for (const [i, pile] of c.inbox.entries()) {
    const props = { pile: `p-${i + 1}` };
    // A file of the case's inbox as it is (a PDF or a picture by its bytes); a name with no file, made-up text.
    const add = async (parent: string, name: string, extra: Record<string, string>): Promise<void> => {
      const bytes = c.inboxBinary[name];
      if (bytes) await drive.upload(parent, name, new Blob([bytes.slice()]), undefined, { ...extra, ...asAdded(name) });
      else await drive.createText(parent, name, c.inboxFiles[name] ?? `made-up content of ${name}`, { ...extra, ...asAdded(name) });
    };
    if (!pile.line && pile.files.length === 1) {
      await add(inbox, pile.files[0] ?? '', props);
      continue;
    }
    const folder = (await drive.createFolder(inbox, pile.line.slice(0, 40) || `Pile ${i + 1}`, props)).id;
    if (pile.line) await drive.createText(folder, PILE_NOTE, `${pile.line}\n`);
    for (const f of pile.files) await add(folder, f, {});
  }
  return root;
}

async function runCase(c: LoadedCase, { around, realTokens = false, claude, props = {}, before, env: more = {} }: CaseOptions): Promise<CaseRun> {
  // An excluded case is refused before anything is seeded or dispatched (corpus-registry AC3).
  const execution = CORPUS_EXECUTION[c.id];
  if (execution?.mode === 'excluded') throw new Error(`${c.id} is not run: ${execution.reason}.`);
  const drive = fixedDrive();
  const root = await seedCase(drive, c, props);
  await before?.(drive, root);
  let scripted = claude;
  if (!scripted) {
    try { scripted = replySequence(JSON.parse(await readFile(join(c.dir, 'replies.json'), 'utf8')) as unknown[]); }
    catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  }
  const options = { around, realTokens, ...(scripted ? { claude: scripted } : {}), env: more };
  const first = await runOnDrive(c, drive, root, options, 1);
  const runs = [first];
  const presses = c.presses ?? (c.between ? [{ between: c.between }] : []);
  // Do not silently discard legacy edits when a case also adds further presses.
  if (c.presses && c.between) throw new Error('Use between or presses, not both.');
  for (const [i, press] of presses.entries()) {
    let answerStart: CaseOptions['answerStart'];
    let words = 0;
    for (const step of press.between ?? []) {
      if (step.kind === 'words') await addWords(drive, root, step.line, `p-${i + 2}-${++words}`);
      else if (step.kind === 'answer') {
        const scheduled = await submitAnswer(c, runs.at(-1) ?? first, step);
        if (scheduled) {
          if (answerStart) throw new Error('A press can start only one answer run.');
          answerStart = scheduled;
        }
      } else await changeBetween(drive, root, step);
    }
    if (answerStart && press.request) throw new Error('An answer run and an explicit request need separate presses.');
    runs.push(await runOnDrive(c, drive, root, { ...options, request: press.request, answerStart, replayOf: runs.at(-1) }, i + 2));
  }
  const last = runs.at(-1) ?? first;
  const result = runs.length === 1 ? last : { ...last, runs: runs.slice(0, -1) };
  return { ...result, score: scoreCase(c, result) };
}

/** A words pile added to the Inbox between presses, as `seedCase` adds the case's piles. */
async function addWords(drive: FakeDrive, root: string, line: string, pile: string): Promise<void> {
  const inbox = Object.entries((await snapshot(drive, root)).pathsById).find(([, path]) => path === 'Inbox')?.[0];
  if (!inbox) throw new Error('between: missing Inbox');
  const folder = (await drive.createFolder(inbox, line.slice(0, 40).trim(), { pile })).id;
  await drive.createText(folder, PILE_NOTE, `${line}\n`);
}

async function changeBetween(drive: FakeDrive, root: string, step: Exclude<CorpusBetween, { kind: 'answer' | 'words' }>): Promise<void> {
  const seen = await snapshot(drive, root);
  if (step.kind === 'create') {
    const name = step.path.split('/').pop() ?? step.path;
    const parent = Object.entries(seen.pathsById).find(([, path]) => path === step.path.slice(0, -name.length - 1))?.[0];
    if (!parent) throw new Error(`between: missing the folder of ${step.path}`);
    await drive.createText(parent, name, step.text);
    return;
  }
  const id = Object.entries(seen.pathsById).find(([, path]) => path === step.path)?.[0];
  if (!id) throw new Error(`between: missing ${step.path}`);
  const file = await drive.get(id);
  if (step.kind === 'edit') await drive.writeText(id, step.text, file.modifiedTime);
  else {
    const parts = step.to.split('/');
    const name = parts.pop() ?? step.to;
    const folders = new Map((await drive.listAll(root)).filter((f) => f.folder).map((f) => [seen.pathsById[f.id] ?? '', f.id]));
    const parent = await ensureFolder(drive, root, folders, parts.join('/'));
    await drive.update(id, { name, addParent: parent, removeParent: file.parents[0] });
  }
}

/** Minimal runtime ports, as ask-answer-loop.test.ts uses: the app modules need browser types, not runner types. */
interface AnswerVault { questions(): Promise<Question[]>; answer(id: string, yes: boolean): Promise<void> }
type AnswerVaultClass = new (opts: { drive: FakeDrive; rootId: () => Promise<string>; runningPiles: () => ReadonlySet<string>; device: string }) => AnswerVault;
type AnswerLoop = (vault: AnswerVault, runs: { start(scope: 'all' | 'instructions', opts: { requestId: string; subject?: string }): Promise<RunState> },
  id: string, yes: boolean, opts: { allowWeb: boolean }) => Promise<{ outcome: { kind: string; error?: unknown } } | null>;

async function submitAnswer(c: LoadedCase, previous: CaseRun, step: Extract<CorpusBetween, { kind: 'answer' }>): Promise<CaseOptions['answerStart']> {
  const questions = JSON.parse(previous.after[SYSTEM.questions] ?? '{"questions":[]}') as { questions: Question[] };
  const matches = questions.questions.filter((q) => 'id' in step.question ? q.id === step.question.id : matchesSubject(q, step.question, previous.pathsById));
  if (matches.length !== 1) throw new Error(`between: expected one question from the previous press, found ${matches.length}`);
  const id = matches[0]?.id;
  if (!id) throw new Error('between: the previous question has no id');
  const loopPath = new URL('../../src/data/answer-loop.ts', import.meta.url).pathname;
  const vaultPath = new URL('../../src/data/vault/drive-vault.ts', import.meta.url).pathname;
  const { answerQuestion } = await import(/* @vite-ignore */ loopPath) as { answerQuestion: AnswerLoop };
  const { DriveVault } = await import(/* @vite-ignore */ vaultPath) as { DriveVault: AnswerVaultClass };
  const vault = new DriveVault({ drive: previous.drive, rootId: async () => previous.root, runningPiles: () => new Set(), device: 'device-1' });
  let scheduled: CaseOptions['answerStart'];
  const answered = await answerQuestion(vault, { start: async (scope, opts) => {
    // The fake Worker queues the scheduled run at the next corpus press; it never authors a note or report here.
    scheduled = { scope, requestId: opts.requestId, ...(opts.subject ? { subject: opts.subject } : {}) };
    return { id: opts.requestId, scope, phase: 'reading', requestedAt: AT, phaseAt: AT, seen: false };
  } }, id, step.yes, { allowWeb: c.allowWeb });
  if (answered?.outcome.kind === 'failed') throw answered.outcome.error;
  return scheduled;
}

/** Replay never writes a request; tidy-up creates a fresh journal record. */
async function addRequest(drive: FakeDrive, root: string, press: number, request: CorpusPress['request']): Promise<NonNullable<CaseRun['requestAction']>> {
  if (request?.kind === 'replay') return { kind: 'replay', id: request.id, outcome: 'redispatched' };
  const seen = await snapshot(drive, root);
  const changes = Object.entries(seen.pathsById).find(([, path]) => path === SYSTEM.changes)?.[0];
  if (!changes) throw new Error('The changes folder is missing.');
  await drive.createText(changes, `press-${press}.json`, JSON.stringify({ v: 1, id: `press-${press}`, device: 'device-1', at: AT + press,
    kind: 'request', what: 'Asked Bower to update the notes', text: request?.text ?? 'Update these notes.' }));
  return { kind: 'tidy', id: `press-${press}` };
}

/** Each press admits the current folder and uses the production runner/planner/write path. */
export async function runOnDrive(c: LoadedCase, drive: FakeDrive, root: string, { around, realTokens = false, claude, env: more = {}, request, replayOf, answerStart, pacing, admission }: CaseOptions, press: number): Promise<CaseRun> {
  if (request?.kind === 'replay') {
    if (!replayOf || replayOf.drive !== drive || replayOf.root !== root
      || !replayOf.requests?.some((r) => r.id === request.id)) throw new Error(`replay: missing run for request ${request.id}`);
    const requestAction = await addRequest(drive, root, press, request);
    return { ...await redispatchCase(c, replayOf, press, { around, claude, pacing }), requests: replayOf.requests, requestAction };
  }
  const current = await snapshot(drive, root);
  const requestAction = press > 1 && !answerStart ? await addRequest(drive, root, press, request) : undefined;
  const scope = answerStart?.scope ?? (press > 1 && !Object.keys(current.after).some((p) => p.startsWith('Inbox/')) ? 'instructions' : c.scope);
  const admitted = admission ? { kind: 'manifest' as const, manifest: admission } : await planAdmission(fakeRead(drive), root, { scope,
    clock: () => AT + press - 1, newId: () => `admission-${press}`, ...(answerStart?.subject ? { subject: answerStart.subject } : {}) });
  const runId = answerStart?.requestId ?? (press === 1 ? RUN_ID : `${RUN_ID}-${press}`);
  const wire = driveV3(drive, 1, runId);
  wire.folderId = root;
  // The token route's expiry on the real clock, as the Worker's is, so the runner keeps a token as it does on Actions.
  if (realTokens) wire.now = Date.now();
  if (admitted.kind !== 'manifest') return { ...(await snapshot(drive, root)), lastRun: null, code: -1, drive, root, requestAction };
  wire.manifest = admitted.manifest;
  const requests = (await Promise.all(admitted.manifest.journal.map((f) => drive.readText(f.fileId))))
    .map((text) => JSON.parse(text) as unknown).filter(isJournalRecord).filter((r) => r.kind === 'request')
    .map((r) => ({ id: r.id, text: r.text ?? '' }));
  const dir = await mkdtemp(join(tmpdir(), 'bower-corpus-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: runId, attempt: 1, ticket: TICKET, scope, allow_web: c.allowWeb } }));
  const env = claude ? { BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' } : {};
  const model = claude ? withPhases(claude, () => ({ drive, root, admission: admitted.manifest })) : undefined;
  const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: file, ...env, ...more }, { fetch: around ? around(wire.fetch) : wire.fetch, ...(model ? { claude: (call: ClaudeCall) => model(Object.assign(call, { fixture: { drive, root, admission: admitted.manifest } })) } : {}), ...(pacing ? { pacing } : {}) });
  const { after, props: kept, pathsById } = await snapshot(drive, root);
  const lastRun: unknown = after[SYSTEM.lastRun] ? JSON.parse(after[SYSTEM.lastRun] ?? 'null') : null;
  return { after, props: kept, pathsById, lastRun, code, drive, root, requests, requestAction, wire,
    dispatch: { runId, scope, admission: admitted.manifest } };
}

/** Redispatch the exact run over its existing Drive and immutable admission; no admission or planning here. */
export async function redispatchCase(c: LoadedCase, previous: CaseRun, attempt: number, options: Pick<CaseOptions, 'around' | 'claude' | 'pacing'> = {}): Promise<CaseRun> {
  const dispatch = previous.dispatch;
  if (!dispatch) throw new Error('A corpus run must have reached main before redispatch.');
  const wire = driveV3(previous.drive, attempt, dispatch.runId);
  wire.folderId = previous.root;
  wire.manifest = dispatch.admission;
  const dir = await mkdtemp(join(tmpdir(), 'bower-corpus-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: dispatch.runId, attempt, ticket: TICKET, scope: dispatch.scope, allow_web: c.allowWeb } }));
  const claude = options.claude;
  const env = claude ? { BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' } : {};
  const model = claude ? withPhases(claude, () => ({ drive: previous.drive, root: previous.root, admission: dispatch.admission })) : undefined;
  const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: file, ...env }, {
    fetch: options.around ? options.around(wire.fetch) : wire.fetch,
    ...(model ? { claude: (call: ClaudeCall) => model(Object.assign(call, { fixture: { drive: previous.drive, root: previous.root, admission: dispatch.admission } })) } : {}), ...(options.pacing ? { pacing: options.pacing } : {}),
  });
  const observed = await snapshot(previous.drive, previous.root);
  return { ...observed, code, lastRun: JSON.parse(observed.after[SYSTEM.lastRun] ?? 'null') as unknown,
    drive: previous.drive, root: previous.root, dispatch, wire };
}

async function snapshot(drive: FakeDrive, root: string): Promise<{ after: Record<string, string>; props: Record<string, Record<string, string>>; pathsById: Record<string, string> }> {
  const all = await drive.listAll(root);
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: Record<string, string> = {};
  const pathsById: Record<string, string> = {};
  const props: Record<string, Record<string, string>> = {};
  for (const f of all) {
    const parts: string[] = [];
    for (let x = byId.get(f.id); x; x = byId.get(x.parents[0] ?? '')) {
      parts.unshift(x.name);
      if (x.parents[0] === root) break;
    }
    pathsById[f.id] = parts.join('/');
    if (f.folder) continue;
    out[parts.join('/')] = await drive.readText(f.id);
    if (f.appProperties) props[parts.join('/')] = f.appProperties;
  }
  return { after: out, props, pathsById };
}

/** Bind only exact admitted names to ids; the intent still passes the existing Claude provider's validation. */
export function replySequence(all: unknown[]): ClaudeSpawn {
  // B10 (R15): `{"kind": "synopsis", "name"}` entries answer a long text's synopsis call by name; the execution turns skip them.
  type Statement = { text: string; parts: unknown[] };
  const isSynopsis = (r: unknown): r is { name: string; statements: Statement[] } => (r as { kind?: string } | null)?.kind === 'synopsis';
  const replies = all.filter((r) => !isSynopsis(r));
  const exit = (value: unknown) => ({ code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(value), usage: { input_tokens: 10, output_tokens: 10 } }) });
  /** `$part:<phrase>` is the first part holding the phrase; no part holding it is a failure, never another part. A text with no entry is refused empty. */
  const synopsis = (ask: { name: string; parts: Array<{ n: number; text: string }> }) => exit({
    statements: all.find((r): r is { name: string; statements: Statement[] } => isSynopsis(r) && r.name === ask.name)?.statements.map((st) => ({ text: st.text,
      parts: st.parts.map((part) => {
        if (typeof part !== 'string' || !part.startsWith('$part:')) return part;
        const n = ask.parts.find((x) => x.text.includes(part.slice(6)))?.n;
        if (!n) throw new Error(`Scripted synopsis names a phrase no part holds: ${part}`);
        return n;
      }) })) ?? [],
  });
  const execution = async (call: ClaudeCall, turn: number) => {
    const ctx = lastJson(call.input) as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    // B11 selectors (R13): `$note:<path>` and `$folder:<path>` by the seeded Drive's paths, `$request:<record id>` by the
    // journal file holding that record.
    const fixture = (call as ClaudeCall & { fixture?: PlanningFixture }).fixture;
    const files = fixture && JSON.stringify(replies).includes('"$') ? await fixture.drive.listAll(fixture.root) : [];
    const byPath = new Map(files.map((f) => [fixture?.drive.pathOf(f.id, fixture.root) ?? '', f.id]));
    const records = new Map<string, string>();
    for (const [path, id] of byPath) if (path.startsWith(`${SYSTEM.changes}/`) && path.endsWith('.json')) {
      const rec: unknown = JSON.parse(await fixture?.drive.readText(id) ?? '{}');
      if (isJournalRecord(rec)) records.set(rec.id, id);
    }
    const bind = (value: unknown): unknown => {
      if (typeof value === 'string' && value.startsWith('$file:')) {
        const id = ids.get(value.slice(6));
        if (!id) throw new Error(`Scripted reply names an unshown file: ${value}`);
        return id;
      }
      const selector = typeof value === 'string' ? /^\$(note|folder|request):(.+)$/.exec(value) : null;
      if (selector) {
        const id = selector[1] === 'request' ? records.get(selector[2] ?? '') : byPath.get(selector[2] ?? '');
        if (!id) throw new Error(`Scripted reply names nothing seeded: ${String(value)}`);
        return id;
      }
      if (Array.isArray(value)) return value.map(bind);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bind(v)]));
      return value;
    };
    // c12-corpus K3, the corpus form of S18: a call that shows only some of the admitted things gets the rows of its own.
    const unshown = (fixture?.admission?.piles ?? []).flatMap((p) => p.items.map((i) => i.name)).filter((n) => !ids.has(n));
    const names = (row: unknown): string[] => typeof row === 'string' ? (row.startsWith('$file:') ? [row.slice(6)] : [])
      : row && typeof row === 'object' ? Object.values(row).flatMap(names) : [];
    const reply = replies[Math.min(turn, replies.length - 1)];
    const own = unshown.length && reply && typeof reply === 'object' ? Object.fromEntries(Object.entries(reply).map(([key, rows]) =>
      [key, Array.isArray(rows) ? rows.filter((row) => !names(row).some((n) => unshown.includes(n))) : rows])) : reply;
    const intent = bind(own);
    return exit(intent);
  };
  const phased = phaseAwareClaude(execution, (call) => {
    const fixture = (call as ClaudeCall & { fixture?: PlanningFixture }).fixture;
    if (!fixture) throw new Error('A scripted reply needs its seeded fixture.');
    return fixture;
  });
  const started = new Set<string>();
  return async (call) => {
    const context = lastJson(call.input) as { admission?: string; selection?: unknown; synopsis?: Parameters<typeof synopsis>[0] };
    if (context.synopsis) return synopsis(context.synopsis);
    const key = `${call.cwd}/${context.admission ?? ''}`;
    // A redispatch test can supply selection itself; an execution-only sequence then begins at execution.
    if (context.selection !== undefined && !started.has(key)) return execution(call, 0);
    started.add(key);
    return phased(call);
  };
}

/** `claude` with its model calls counted per press: a call that shows no selection is the planner's first, and opens a press. */
export function perPress(claude: ClaudeSpawn): { claude: ClaudeSpawn; calls: number[] } {
  const calls: number[] = [];
  return { calls, claude: (call) => {
    if ((lastJson(call.input) as { selection?: unknown }).selection === undefined) calls.push(0);
    calls[calls.length - 1] = (calls.at(-1) ?? 0) + 1;
    return claude(call);
  } };
}

/** A file left in the Inbox after `run` as it is (bytes and appProperties) beside the same file as seeded, by name; `now` is undefined when it is gone. */
export async function inboxAsSeeded(c: LoadedCase, run: CaseRun, name: string): Promise<{ now?: { text: string; props?: Record<string, string> }; was: { text: string; props?: Record<string, string> } }> {
  const drive = fixedDrive();
  const seeded = (await drive.listAll(await seedCase(drive, c))).find((f) => f.name === name);
  const at = Object.keys(run.after).find((p) => p.startsWith('Inbox/') && p.split('/').at(-1) === name);
  return { was: { text: await drive.readText(seeded?.id ?? ''), props: seeded?.appProperties }, ...(at ? { now: { text: run.after[at] ?? '', props: run.props[at] } } : {}) };
}

export function caseReplies(id: string): ClaudeSpawn {
  let spawn: ClaudeSpawn | undefined;
  return async (call) => {
    spawn ??= replySequence(JSON.parse(await readFile(join(import.meta.dirname, '../../testing/corpus', id, 'replies.json'), 'utf8')) as unknown[]);
    return spawn(call);
  };
}
