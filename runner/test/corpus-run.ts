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
  lastRun: unknown;
  code: number;
}

export async function runScripted(c: LoadedCase, around?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch, realTokens = false): Promise<CaseRun> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
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
    await drive.createText(parent, name, text, c.bowerOwned.includes(path) || /^by: bower$/m.test(text) ? { by: 'bower' } : undefined);
  }
  for (const [i, line] of c.journal.entries()) {
    const rec = { v: 1, id: `change-${i + 1}`, device: 'device-1', at: AT - 60_000 + i, kind: line.kind, what: line.kind === 'answer' ? 'Answered a question' : line.kind === 'rule' ? 'A rule' : `Asked Bower: "${line.text}"`, text: line.text, ...(line.questionId ? { questionId: line.questionId } : {}) };
    await drive.createText(changes, `change-${i + 1}.json`, `${JSON.stringify(rec)}\n`);
  }
  for (const [i, pile] of c.inbox.entries()) {
    const props = { pile: `p-${i + 1}` };
    const text = (name: string): string => c.inboxFiles[name] ?? `made-up content of ${name}`;
    if (!pile.line && pile.files.length === 1) {
      await drive.createText(inbox, pile.files[0] ?? '', text(pile.files[0] ?? ''), { ...props, ...asAdded(pile.files[0] ?? '') });
      continue;
    }
    const folder = (await drive.createFolder(inbox, pile.line.slice(0, 40) || `Pile ${i + 1}`, props)).id;
    if (pile.line) await drive.createText(folder, PILE_NOTE, `${pile.line}\n`);
    for (const f of pile.files) await drive.createText(folder, f, text(f), asAdded(f));
  }
  const admitted = await planAdmission(fakeRead(drive), root, { scope: c.scope === 'undo' ? 'instructions' : c.scope, clock: () => AT, newId: () => 'admission-1' });
  const wire = driveV3(drive);
  wire.folderId = root;
  // The token route's expiry on the real clock, as the Worker's is, so the runner keeps a token as it does on Actions.
  if (realTokens) wire.now = Date.now();
  if (admitted.kind !== 'manifest') return { after: await snapshot(drive, root), lastRun: null, code: -1 };
  wire.manifest = admitted.manifest;
  const dir = await mkdtemp(join(tmpdir(), 'bower-corpus-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: c.scope, allow_web: c.allowWeb } }));
  const code = await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: file }, { fetch: around ? around(wire.fetch) : wire.fetch });
  const after = await snapshot(drive, root);
  const lastRun: unknown = after[SYSTEM.lastRun] ? JSON.parse(after[SYSTEM.lastRun] ?? 'null') : null;
  return { after, lastRun, code };
}

async function snapshot(drive: FakeDrive, root: string): Promise<Record<string, string>> {
  const all = await drive.listAll(root);
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: Record<string, string> = {};
  for (const f of all) {
    if (f.folder) continue;
    const parts: string[] = [];
    for (let x = byId.get(f.id); x; x = byId.get(x.parents[0] ?? '')) {
      parts.unshift(x.name);
      if (x.parents[0] === root) break;
    }
    out[parts.join('/')] = await drive.readText(f.id);
  }
  return out;
}
