/** What the admission tests share: a pile as the app adds it, a signed-in person holding the lease, one press of Tidy up. */
import { env as testEnv, runInDurableObject } from 'cloudflare:test';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { sha256 } from '../../src/data/contracts/hashes.js';
import type { Declaration } from '../../src/data/contracts/pile-declaration.js';
import { declarationRecord } from '../../src/data/pile-readiness.js';
import type { AdmissionManifest } from '../../src/data/spine/admission.js';
import type { DriveFolder } from './drive-v3.js';
import { dispatchOf, pretendGitHubForFile } from './github-support.js';

const env = testEnv as unknown as Env;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';
const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

/** The GitHub the runtime's own alarm reaches in a file that presses (the dispatch is due at the press). */
export const pressGitHub = (): ReturnType<typeof pretendGitHubForFile> => pretendGitHubForFile(env);

/** A pile as the app adds it: its declaration in `.bower/piles`, then its folder, its note and its two things. */
export async function declaredPile(folder: DriveFolder, piles: string, n: number): Promise<void> {
  const { drive, root, inbox } = folder;
  const content = async (text: string) => ({ size: new TextEncoder().encode(text).byteLength, sha256: await sha256(new Blob([text])) });
  const note = `Papers ${n} from Alex`;
  const things = [`a${n}.pdf`, `b${n}.pdf`].map((name, i) => ({ name, key: `member-${n}-${i}`, text: `%PDF ${name}` }));
  const declaration: Declaration = {
    v: 1,
    kind: 'pile-declaration',
    scope: { rootId: root },
    declarationId: `decl-${n}`,
    pileId: `pile-${n}`,
    createdAt: Date.UTC(2026, 9, 7, 8, n),
    anchor: { kind: 'folder', inboxId: inbox, name: `Papers ${n}`, createKey: `anchor-${n}` },
    members: await Promise.all(things.map(async (t) => ({ memberKey: t.key, name: t.name, kind: 'pdf' as const, origin: 'From this computer', content: { encoding: 'blob' as const, ...(await content(t.text)) } }))),
    context: { kind: 'text', memberKey: `context-${n}`, originalText: note, content: { encoding: 'utf8', ...(await content(note)) } },
  };
  const record = await declarationRecord(declaration, root);
  if (!record) throw new Error('the declaration was refused');
  await drive.createText(piles, record.name, record.text);
  const made = await drive.createFolder(inbox, `Papers ${n}`, { pile: declaration.pileId, bowerDeclaration: declaration.declarationId });
  await drive.createText(made.id, 'Pile note.md', note, { bowerItem: `context-${n}` });
  for (const t of things) await drive.createText(made.id, t.name, t.text, { bowerItem: t.key });
}

/** A signed-in person holding the lease, whose folder is `folder`, with a cached Drive token. */
export async function holderOf(folder: DriveFolder): Promise<{ sub: string; headers: Record<string, string> }> {
  const sub = `admission-reads-${crypto.randomUUID()}`;
  await env.BOWER_KV.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, env.SESSION_SECRET)}`;
  const epoch = (await person(sub).session('laptop', 'check', 0, Date.now())).epoch;
  await person(sub).pointFolder(generation, null, folder.root);
  await person(sub).cacheDriveToken({ accessToken: 'access-cached', expiresAt: Date.now() + 3600_000 });
  return { sub, headers: { cookie, origin: APP, 'content-type': 'application/json', 'x-bower-place': 'laptop', 'x-bower-epoch': String(epoch) } };
}

/** One press; a run it admits is dispatched by the alarm before it returns, so nothing is left in flight. */
export async function press(fetchImpl: DriveFolder['fetchImpl'], headers: Record<string, string>, gh: ReturnType<typeof pretendGitHubForFile>): Promise<Response> {
  const body = JSON.stringify({ scope: 'all', allowWeb: false, requestId: 'press-1' });
  const r = await createApp({ fetchImpl }).request(`${APP}/process`, { method: 'POST', headers, body }, env);
  if (r.status === 200) await dispatchOf(gh, ((await r.clone().json()) as { run: { id: string } }).run.id);
  return r;
}

export async function storedManifest(sub: string): Promise<AdmissionManifest> {
  const rows = await runInDurableObject(person(sub), (_instance, state) => state.storage.sql.exec('SELECT manifest FROM runs').toArray());
  return JSON.parse(String((rows[0] as { manifest?: unknown } | undefined)?.manifest)) as AdmissionManifest;
}

