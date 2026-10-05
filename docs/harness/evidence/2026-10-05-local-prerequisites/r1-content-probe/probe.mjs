import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeGuard, newState, publicEvent, hash, BASE, A, B } from './guard.mjs';
import { declarations, readPrivate, privateLocation, privateWriter } from './private-store.mjs';
import { loadReviewed } from './reviewed.mjs';
import { runCase } from './case.mjs';

export async function runPrivate(mode, packetPath) {
  if (!['run', 'cleanup'].includes(mode)) throw new Error('Invalid R1 mode.');
  await privateLocation(packetPath);
  const packet = await readPrivate(packetPath);
  if (packet.v !== 1 || packet.case !== 'R1_CONTENT_INTERLEAVE' || packet.identityAlias !== 'A' || packet.scopeSet !== 'full-drive' || typeof packet.caseId !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(packet.caseId)) throw new Error('Invalid R1 execution packet.');
  if (packet.rootName !== `Bower R1 probe ${packet.caseId}` || packet.marker !== packet.caseId) throw new Error('Invalid synthetic fixture binding.');
  const paths = { config: packetPath, oauthConfig: packet.oauthConfigFile, manifest: packet.manifestFile };
  declarations(paths); const oauthConfig = await readPrivate(packet.oauthConfigFile);
  Object.assign(paths, { client: oauthConfig.clientFile, session: oauthConfig.sessionFile }); declarations(paths);
  for (const path of Object.values(paths)) await privateLocation(path, path !== packet.manifestFile || mode === 'cleanup');
  const emit = (event) => console.log(JSON.stringify(publicEvent(event)));
  const reviewed = await loadReviewed(paths, emit);
  reviewed.validateConfig(oauthConfig, true);
  if (oauthConfig.identityAlias !== packet.identityAlias || oauthConfig.scopeSet !== packet.scopeSet || oauthConfig.remoteAuthorization.reference !== packet.reference || Date.parse(oauthConfig.remoteAuthorization.expiresAt) !== packet.expiresAt) throw new Error('Grant/packet authority mismatch.');
  let state;
  if (mode === 'cleanup') state = await readPrivate(packet.manifestFile);
  else {
    // Existing manifest never becomes permission to recreate a fixture.
    try { await readPrivate(packet.manifestFile); throw new Error('Existing manifest requires cleanup-only recovery.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    state = { ...newState(Date.now()), caseId: packet.caseId, nonce: randomUUID() };
  }
  if (state.caseId !== packet.caseId) throw new Error('Private case mismatch.');
  const persist = privateWriter(packet.manifestFile);
  let provider;
  const guard = makeGuard({ config: packet, state, persist, forward: fetch, tokenSource: (fresh) => provider(fresh), onEvent: emit, authorize: async () => {
    const current = await readPrivate(packetPath);
    for (const key of ['caseId', 'case', 'identityAlias', 'scopeSet', 'oauthConfigFile', 'manifestFile']) if (current[key] !== packet[key]) throw new Error('Current execution binding changed.');
    for (const path of Object.values(paths)) await privateLocation(path, path !== packet.manifestFile);
    return current;
  } });
  await guard.eligible(mode === 'cleanup');
  await persist(state);
  provider = await reviewed.tokenProvider(oauthConfig, guard.refresh);
  state.sourceHashes = reviewed.hashes; state.moduleHashes = reviewed.moduleHashes;
  state.payloadHashes = { baseline: hash(BASE), external: hash(B), app: hash(A) }; await persist(state);
  const result = await runCase({ DriveHttp: reviewed.DriveHttp, guard, cleanupOnly: mode === 'cleanup' });
  console.log(JSON.stringify({ event: 'result', ...result }));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrivate(process.argv[2], process.argv[3]).then((result) => { if ((!result.cleanup.completed) || (process.argv[2] !== 'cleanup' && result.verdict !== 'observed-supported-one-case')) process.exitCode = 2; }).catch(() => {
    console.error(JSON.stringify({ event: 'stopped', reason: 'R1 setup or operation refused; retain the private manifest.' })); process.exitCode = 1;
  });
}
