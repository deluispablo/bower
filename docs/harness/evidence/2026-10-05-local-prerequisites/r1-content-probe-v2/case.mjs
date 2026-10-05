import { BASE, A, B, FIELDS, hash, unresolvedCreate } from './guard.mjs';
export async function runCase({ DriveHttp, guard, cleanupOnly = false }) {
  const clients = Object.fromEntries(['A', 'B', 'O'].map((actor) => [actor, new DriveHttp({ token: guard.token, fetch: (url, init) => guard.fetch(actor, url, init) })]));
  const op = (actor, name, fn) => guard.operation(actor, name, () => fn(clients[actor]));
  const observe = (name) => op('O', name, async (client) => {
    const id = guard.state.resources.file.id;
    const metadata = await client.get(id); const content = await client.readText(id);
    return { metadata, content };
  });
  let verdict = 'inconclusive', pendingA, finalHash = null, bHash = null;
  try {
    if (!cleanupOnly) {
      if (guard.state.intents.root_create || guard.state.resources.root) throw new Error('Existing create intent requires cleanup only.');
      const mark = { r1Probe: guard.state.marker };
      await op('A', 'root_create', (client) => client.createFolder('root', guard.state.rootName, mark));
      await op('O', 'root_verify', (client) => client.get(guard.state.resources.root.id));
      await op('A', 'file_create', (client) => client.createText(guard.state.resources.root.id, 'fixture.md', BASE, mark));
      await observe('file_verify');
      const initial = await op('A', 'A_initial', async (client) => ({ metadata: await client.get(guard.state.resources.file.id), content: await client.readText(guard.state.resources.file.id) }));
      pendingA = op('A', 'A_write', (client) => client.writeText(guard.state.resources.file.id, A, initial.metadata.modifiedTime)).then((value) => ({ ok: true, value }), () => ({ ok: false }));
      await Promise.race([guard.waitA(), pendingA.then(() => { throw new Error('A never reached the barrier.'); })]);
      const currentB = await op('B', 'B_initial', (client) => client.get(guard.state.resources.file.id));
      await op('B', 'B_write', (client) => client.writeText(guard.state.resources.file.id, B, currentB.modifiedTime));
      const observedB = await observe('B_observe'); bHash = hash(observedB.content);
      await guard.releaseA(); const completedA = await pendingA;
      const final = await observe('final_observe'); finalHash = hash(final.content);
      if (bHash === hash(B) && finalHash === hash(A) && completedA.ok) verdict = 'observed-refuted';
      else {
        const patches = guard.state.records.filter((r) => r.actor === 'A' && r.operation === 'A_write' && r.kind === 'write');
        const refusal = patches.length === 1 && patches[0].complete && [409, 412].includes(patches[0].status);
        if (bHash === hash(B) && finalHash === hash(B) && !completedA.ok && refusal) verdict = 'observed-supported-one-case';
      }
      await guard.stop(verdict === 'observed-refuted' ? 'refuted' : 'case_complete');
    }
  } catch { await guard.stop(guard.state.stop ?? 'case_incomplete'); guard.cancelA(); if (pendingA) await pendingA; }
  await guard.cleanupMode();
  // Raw reads bypass only DriveHttp.get's trashed-file refusal, never the transport guard.
  const rawMetadata = (name, id) => op('O', name, async () => {
    const authorization = `Bearer ${await guard.token(false)}`;
    return (await guard.fetch('O', `https://www.googleapis.com/drive/v3/files/${id}?fields=${FIELDS}`, { headers: { authorization } })).json();
  });
  try {
    const file = guard.state.resources.file;
    if (file && !guard.state.fileBinned) {
      if (guard.state.intents.cleanup_file_bin?.complete && guard.state.intents.cleanup_file_bin.status >= 200 && guard.state.intents.cleanup_file_bin.status < 300) {
        await rawMetadata('cleanup_file_verify', file.id);
      } else {
      await op('O', 'cleanup_file', (client) => client.get(file.id));
      await op('O', 'cleanup_file_bin', (client) => client.trash(file.id));
      await rawMetadata('cleanup_file_verify', file.id);
      }
    }
    const root = guard.state.resources.root;
    if (root && !guard.state.rootBinned) {
      if (guard.state.intents.cleanup_root_bin?.complete && guard.state.intents.cleanup_root_bin.status >= 200 && guard.state.intents.cleanup_root_bin.status < 300) {
        await rawMetadata('cleanup_root_verify', root.id);
      } else {
      await op('O', 'cleanup_inventory', async () => {
        const parameters = new URLSearchParams({ q: `'${root.id}' in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
        return (await guard.fetch('O', `https://www.googleapis.com/drive/v3/files?${parameters}`, { headers: { authorization: `Bearer ${await guard.token(false)}` } })).json();
      });
      await op('O', 'cleanup_root', (client) => client.get(root.id));
      await op('O', 'cleanup_root_bin', (client) => client.trash(root.id));
      await rawMetadata('cleanup_root_verify', root.id);
      }
    }
  } catch { guard.state.cleanupRefused = true; await guard.stop(guard.state.stop ?? 'cleanup_refused'); }
  const residual = [];
  if (guard.state.resources.file && !unresolvedCreate(guard.state, 'file_create') && !guard.state.fileBinned) residual.push('R1_FILE');
  if (guard.state.resources.root && !unresolvedCreate(guard.state, 'root_create') && !guard.state.rootBinned) residual.push('R1_ROOT');
  if (unresolvedCreate(guard.state, 'root_create')) residual.push('R1_ROOT_UNKNOWN');
  if (unresolvedCreate(guard.state, 'file_create')) residual.push('R1_FILE_UNKNOWN');
  return { verdict, cleanup: { completed: residual.length === 0, residual }, hashes: { baseline: hash(BASE), external: hash(B), app: hash(A), observedB: bHash, final: finalHash }, attempts: guard.state.attempts, bytes: guard.state.bytes };
}
