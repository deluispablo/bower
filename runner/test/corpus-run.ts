/**
 * Runs a corpus case with the scripted provider over the runner's pretend Drive v3 (as `main.test.ts` does) and
 * returns what the scorer needs: the folder after the run and the parsed `last-run.json`.
 */
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import { PILE_NOTE } from '../../src/data/piles';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { main } from '../src/main';
import type { ClaudeSpawn } from '../src/claude';
import type { LoadedCase } from '../src/corpus';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';

export const AT = Date.UTC(2026, 9, 7, 9);

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
  const drive = fixedDrive();
  const root = await seedCase(drive, c, props);
  await before?.(drive, root);
  let scripted = claude;
  if (!scripted) {
    try { scripted = replySequence(JSON.parse(await readFile(join(c.dir, 'replies.json'), 'utf8')) as unknown[]); }
    catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; }
  }
  const first = await runOnDrive(c, drive, root, { around, realTokens, ...(scripted ? { claude: scripted } : {}), env: more }, 1);
  if (!c.between) return first;
  for (const step of c.between) {
    const seen = await snapshot(drive, root);
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
  const second = await runOnDrive(c, drive, root, { around, realTokens, ...(scripted ? { claude: scripted } : {}), env: more }, 2);
  return { ...second, runs: [first] };
}

/** Each press admits the current folder and uses the production runner/planner/write path. */
export async function runOnDrive(c: LoadedCase, drive: FakeDrive, root: string, { around, realTokens = false, claude, env: more = {} }: CaseOptions, press: number): Promise<CaseRun> {
  const current = await snapshot(drive, root);
  if (press > 1) {
    const changes = Object.entries(current.pathsById).find(([, path]) => path === SYSTEM.changes)?.[0];
    if (!changes) throw new Error('The changes folder is missing.');
    await drive.createText(changes, `press-${press}.json`, JSON.stringify({ v: 1, id: `press-${press}`, device: 'device-1', at: AT + press, kind: 'request', what: 'Asked Bower to update the notes', text: 'Update these notes.' }));
  }
  const scope = press > 1 && !Object.keys(current.after).some((p) => p.startsWith('Inbox/')) ? 'instructions' : c.scope;
  const admitted = await planAdmission(fakeRead(drive), root, { scope: scope === 'undo' ? 'instructions' : scope, clock: () => AT + press - 1, newId: () => `admission-${press}` });
  const runId = press === 1 ? RUN_ID : `${RUN_ID}-${press}`;
  const wire = driveV3(drive, 1, runId);
  wire.folderId = root;
  // The token route's expiry on the real clock, as the Worker's is, so the runner keeps a token as it does on Actions.
  if (realTokens) wire.now = Date.now();
  if (admitted.kind !== 'manifest') return { ...(await snapshot(drive, root)), lastRun: null, code: -1, drive, root };
  wire.manifest = admitted.manifest;
  const dir = await mkdtemp(join(tmpdir(), 'bower-corpus-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: runId, attempt: 1, ticket: TICKET, scope, allow_web: c.allowWeb } }));
  const env = claude ? { BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' } : {};
  const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: file, ...env, ...more }, { fetch: around ? around(wire.fetch) : wire.fetch, ...(claude ? { claude } : {}) });
  const { after, props: kept, pathsById } = await snapshot(drive, root);
  const lastRun: unknown = after[SYSTEM.lastRun] ? JSON.parse(after[SYSTEM.lastRun] ?? 'null') : null;
  return { after, props: kept, pathsById, lastRun, code, drive, root };
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
export function replySequence(replies: unknown[]): ClaudeSpawn {
  let turn = -1;
  let cwd: string | undefined;
  return async (call) => {
    // A provider retry belongs to the same press and must receive the same case reply.
    if (cwd !== call.cwd) { cwd = call.cwd; turn++; }
    const ctx = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ name: string; fileId: string }> }> };
    const ids = new Map(ctx.piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    const bind = (value: unknown): unknown => {
      if (typeof value === 'string' && value.startsWith('$file:')) {
        const id = ids.get(value.slice(6));
        if (!id) throw new Error(`Scripted reply names an unshown file: ${value}`);
        return id;
      }
      if (Array.isArray(value)) return value.map(bind);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bind(v)]));
      return value;
    };
    const intent = bind(replies[Math.min(turn, replies.length - 1)]);
    return { code: 0, stderr: '', cut: null, stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } }) };
  };
}

export function caseReplies(id: string): ClaudeSpawn {
  let spawn: ClaudeSpawn | undefined;
  return async (call) => {
    spawn ??= replySequence(JSON.parse(await readFile(join(import.meta.dirname, '../../harness/corpus', id, 'replies.json'), 'utf8')) as unknown[]);
    return spawn(call);
  };
}
