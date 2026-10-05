import { readFile } from 'node:fs/promises';
import { hash } from './guard.mjs';
import { declarations } from './private-store.mjs';
export const MODULE_HASHES = { 'adapter.mjs': '4dad67460fc4c81e0c448123769b86e57d2e92961a01b41e0779f00870c4c3d8', 'oauth-local.mjs': '4c002cd4650214350cc5a653e4f0a70f00f6f41ba8782300acb5650bf2f573aa' };
export const APP_HASHES = { 'src/data/drive/drive-http.ts': '340134b45909b1f263a56942538447720e079a78ed9f4e170be6e9d25a7a8e21', 'src/data/drive/drive-api.ts': 'e57343a528bb8ef72739b7277593f5b0f9caa569becbac7b4272c35b2bf27c6b', 'src/data/types.ts': '6f16991fb2b2c314ff26cafb3a4938083cbdb998677171bfed64b84ad7a3f121' };
export async function loadReviewed(paths, onDiagnostic, importFn = (path) => import(path)) {
  // Own new packet exclusion runs BEFORE accessing either reviewed module.
  declarations(paths);
  const directory = '/private/tmp/bower-google-probe-setup-v4';
  for (const [name, expected] of Object.entries(MODULE_HASHES)) if (hash(await readFile(`${directory}/${name}`)) !== expected) throw new Error('Reviewed module identity changed.');
  const adapter = await importFn(`${directory}/adapter.mjs`);
  const oauth = await importFn(`${directory}/oauth-local.mjs`);
  const loaded = adapter.loadAdapters(onDiagnostic);
  for (const [path, expected] of Object.entries(APP_HASHES)) if (loaded.hashes[`${adapter.APP_SHA}:${path}`] !== expected) throw new Error('Immutable app source drift.');
  return { DriveHttp: loaded.DriveHttp, tokenProvider: oauth.tokenProvider, validateConfig: oauth.validateConfig, hashes: loaded.hashes, moduleHashes: MODULE_HASHES };
}
