/**
 * Runs a corpus case with the scripted provider over the runner's pretend Drive v3 (as `main.test.ts` does) and
 * returns what the scorer needs: the folder after the run and the parsed `last-run.json`.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
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
  /** Each file's appProperties after the run, by the same paths (none: no entry). */
  props: Record<string, Record<string, string>>;
  lastRun: unknown;
  code: number;
  /** The pretend Drive the run worked on, and the folder's id in it, for what a test does after the run (an undo). */
  drive: FakeDrive;
  root: string;
}

export async function runScripted(c: LoadedCase, around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch, realTokens = false): Promise<CaseRun> {
  return runCase(c, { around, realTokens });
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

async function runCase(c: LoadedCase, { around, realTokens = false, claude, props = {}, before }: CaseOptions): Promise<CaseRun> {
  const drive = fixedDrive();
  const root = await seedCase(drive, c, props);
  await before?.(drive, root);
  const admitted = await planAdmission(fakeRead(drive), root, { scope: c.scope === 'undo' ? 'instructions' : c.scope, clock: () => AT, newId: () => 'admission-1' });
  const wire = driveV3(drive);
  wire.folderId = root;
  // The token route's expiry on the real clock, as the Worker's is, so the runner keeps a token as it does on Actions.
  if (realTokens) wire.now = Date.now();
  if (admitted.kind !== 'manifest') return { ...(await snapshot(drive, root)), lastRun: null, code: -1, drive, root };
  wire.manifest = admitted.manifest;
  const dir = await mkdtemp(join(tmpdir(), 'bower-corpus-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: c.scope, allow_web: c.allowWeb } }));
  const env = claude ? { BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' } : {};
  const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: file, ...env }, { fetch: around ? around(wire.fetch) : wire.fetch, ...(claude ? { claude } : {}) });
  const { after, props: kept } = await snapshot(drive, root);
  const lastRun: unknown = after[SYSTEM.lastRun] ? JSON.parse(after[SYSTEM.lastRun] ?? 'null') : null;
  return { after, props: kept, lastRun, code, drive, root };
}

async function snapshot(drive: FakeDrive, root: string): Promise<{ after: Record<string, string>; props: Record<string, Record<string, string>> }> {
  const all = await drive.listAll(root);
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: Record<string, string> = {};
  const props: Record<string, Record<string, string>> = {};
  for (const f of all) {
    if (f.folder) continue;
    const parts: string[] = [];
    for (let x = byId.get(f.id); x; x = byId.get(x.parents[0] ?? '')) {
      parts.unshift(x.name);
      if (x.parents[0] === root) break;
    }
    out[parts.join('/')] = await drive.readText(f.id);
    if (f.appProperties) props[parts.join('/')] = f.appProperties;
  }
  return { after: out, props };
}
