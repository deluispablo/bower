// Immutable checked-in source, in-memory transpilation only. No repo build/install/edit.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tokenProvider, validateConfig } from './oauth-local.mjs';
export const APP_SHA = '907c9f806e4e6c6b33e595c33232e27257913fdf';
export const LEGACY_SHA = '7a5b1d0e0c4159ae769abda93cfa6b5362fb4b5f';
const app = '/Users/deluisp/Projects/bower-app';
const legacy = '/Users/deluisp/Projects/bower';
const require = createRequire(import.meta.url);
const ts = require(`${app}/node_modules/typescript`);

export function loadAdapters(onDiagnostic = () => console.error('Adapter diagnostic; sensitive details suppressed.')) {
  const hashes = {};
  function load(repo, sha, path, cache = new Map()) {
    if (cache.has(path)) return cache.get(path).exports;
    const allowed = repo === app ? ['src/data/drive/drive-http.ts', 'src/data/drive/drive-api.ts', 'src/data/types.ts'] : ['api/src/drive-api.ts', 'api/src/errors.ts'];
    if (!allowed.includes(path)) throw new Error('Unexpected immutable source dependency.');
    const source = execFileSync('git', ['show', `${sha}:${path}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    hashes[`${sha}:${path}`] = createHash('sha256').update(source).digest('hex');
    const module = { exports: {} }; cache.set(path, module);
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const localRequire = (name) => {
      if (!name.startsWith('.')) throw new Error('Unexpected runtime dependency.');
      const parent = path.slice(0, path.lastIndexOf('/'));
      const relative = new URL(name.replace(/\.js$/, '.ts'), `file:///${parent}/`).pathname.slice(1);
      return load(repo, sha, relative.endsWith('.ts') ? relative : `${relative}.ts`, cache);
    };
    // The existing app adapter can log an ID-bearing pathname on HTTP errors.
    // Preserve a diagnostic event without exposing its arguments in probe evidence.
    const safeConsole = { ...console, error: () => onDiagnostic({ event: 'adapter_diagnostic' }) };
    new Function('require', 'module', 'exports', 'console', compiled)(localRequire, module, module.exports, safeConsole);
    return module.exports;
  }
  const { DriveHttp } = load(app, APP_SHA, 'src/data/drive/drive-http.ts');
  const { createDriveApi } = load(legacy, LEGACY_SHA, 'api/src/drive-api.ts');
  return { DriveHttp, createDriveApi, hashes };
}

// Default read-only guard. Writes/raw resumable cases require a separately reviewed case shim.
export function readOnlyFetch(manifest, f = fetch, onEvent = () => undefined, config, now = Date.now) {
  const ids = new Set(Object.values(manifest.allowedIds ?? {}));
  if (!ids.size || [...ids].some((id) => !/^[A-Za-z0-9_-]+$/.test(id) || id.startsWith('OWNER_') || id === 'root')) throw new Error('Explicit synthetic resource IDs are required.');
  const limit = manifest.limits;
  if (!Number.isInteger(limit?.requests) || limit.requests < 1 || limit.requests > 80 || !Number.isFinite(limit.minutes) || limit.minutes <= 0 || limit.minutes > 15 || !Number.isInteger(limit.responseBytes) || limit.responseBytes < 1 || limit.responseBytes > 12 * 1024 * 1024) throw new Error('Invalid bounded read budget.');
  let count = 0;
  const until = now() + limit.minutes * 60_000;
  return async (url, init = {}) => {
    const u = new URL(url);
    if (u.origin !== 'https://www.googleapis.com' || u.username || u.password || u.hash || (init.method ?? 'GET') !== 'GET') throw new Error('Only allowlisted Drive GETs are enabled.');
    const file = /^\/drive\/v3\/files\/([A-Za-z0-9_-]+)(?:\/export)?$/.exec(u.pathname);
    if (file) {
      if (!ids.has(file[1])) throw new Error('File is outside the synthetic allowlist.');
    } else if (u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q') ?? '';
      const parents = [...q.matchAll(/'([A-Za-z0-9_-]+)' in parents/g)].map((m) => m[1]);
      // Exactly scoped parent listing grammar; arbitrary ORs/root searches are refused.
      const rest = q.replace(/'([A-Za-z0-9_-]+)' in parents/g, 'P');
      if (!parents.length || parents.some((p) => !ids.has(p)) || !/^\(?P(?: or P)*\)? and trashed = false$/.test(rest)) throw new Error('Only explicit parent-scoped listings are enabled.');
    } else throw new Error('Drive route is outside this read-only scaffold.');
    if (u.searchParams.has('access_token') || [...u.searchParams.keys()].some((k) => !['q', 'fields', 'pageSize', 'pageToken', 'alt', 'mimeType'].includes(k))) throw new Error('Unexpected Drive parameters.');
    if (++count > limit.requests || now() >= until) throw new Error('Read budget exhausted.');
    // This runs on every existing adapter request and retry, including with a cached token.
    validateConfig(config, true, now());
    const start = performance.now();
    let res;
    try { res = await f(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
    catch { throw new Error('Bounded Drive request did not finish.'); }
    // No URL/Location/headers/body/exception details are emitted.
    onEvent({ event: 'drive_read', request: count, status: res.status, milliseconds: Math.round(performance.now() - start) });
    if (!res.ok) return new Response(null, { status: res.status });
    const chunks = [];
    let bytes = 0;
    const reader = res.body?.getReader();
    if (reader) for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > limit.responseBytes) { await reader.cancel(); throw new Error('Response byte bound exceeded.'); }
      chunks.push(item.value);
    }
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const key of ['content-type', 'etag']) if (res.headers.has(key)) headers.set(key, res.headers.get(key));
    return new Response(body, { status: res.status, headers });
  };
}
export async function makeAppAdapter(config, manifest, onEvent = () => undefined) {
  const { DriveHttp, hashes } = loadAdapters(onEvent);
  const token = await tokenProvider(config);
  return { api: new DriveHttp({ token, fetch: readOnlyFetch(manifest, fetch, onEvent, config) }), hashes };
}
