import { makeGuard, newState, BASE } from './guard.mjs';
export function fixture(options = {}) {
  let time = 0, version = 0, body = BASE;
  const config = { approved: true, reference: 'LOCAL_SYNTHETIC', identityAlias: 'A', scopeSet: 'full-drive', expiresAt: 600000, rootName: 'Synthetic R1 root', marker: 'SYNTHETIC_MARKER', limits: { requests: 60, milliseconds: 600000, bytes: 65536 } };
  const saved = [], dispatched = [], events = [], files = new Map();
  const wire = (key, patch = {}) => ({ id: key === 'root' ? 'ROOT_A' : 'FILE_A', name: key === 'root' ? config.rootName : 'fixture.md', mimeType: key === 'root' ? 'application/vnd.google-apps.folder' : 'text/markdown', parents: [key === 'root' ? 'OPAQUE_PARENT_A' : 'ROOT_A'], appProperties: { r1Probe: config.marker }, modifiedTime: new Date(1000 + version).toISOString(), createdTime: new Date(1000).toISOString(), trashed: false, ...patch });
  const validator = (patch = {}) => ({ id: 'FILE_A', etag: `"SYNTHETIC_VERSION_${version}"`, version: String(BigInt(options.versionOffset ?? '0') + BigInt(version)), ...patch });
  const setContent = (value) => { body = value; version++; const file = files.get('file'); if (file) files.set('file', { ...file, modifiedTime: new Date(1000 + version).toISOString() }); };
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', etag: 'SYNTHETIC_VALIDATOR', 'x-secret': 'SECRET_RESPONSE_MARKER' } });
  const forward = async (url, init) => {
    dispatched.push({ url, method: init.method ?? 'GET', request: init, savedBefore: structuredClone(saved.at(-1)) });
    if (options.before) await options.before(url, init, { files, wire, validator, setContent });
    if (options.respond) { const overridden = await options.respond(url, init, { files, wire, response, validator, setContent }); if (overridden) return overridden; }
    const u = new URL(url), method = init.method ?? 'GET';
    if (method === 'POST' && u.pathname === '/drive/v3/files') { const value = wire('root'); files.set('root', value); return response(value); }
    if (method === 'POST' && u.pathname === '/upload/drive/v3/files') { const value = wire('file'); files.set('file', value); return response(value); }
    const key = u.pathname.endsWith('/ROOT_A') ? 'root' : u.pathname.endsWith('/FILE_A') ? 'file' : null;
    if (key === 'file' && u.pathname.startsWith('/drive/v2/') && method === 'GET') return response(validator());
    if (key === 'file' && u.pathname.startsWith('/upload/drive/v2/') && method === 'PUT') {
      if (options.enforceIfMatch && new Headers(init.headers).get('if-match') !== validator().etag) return response({ error: 'SYNTHETIC_PRECONDITION_FAILED' }, 412);
      setContent(init.body); return response(validator());
    }
    if (key && method === 'GET') return u.searchParams.get('alt') === 'media' ? new Response(body) : response(files.get(key));
    if (key === 'file' && method === 'PATCH' && u.pathname.startsWith('/upload/')) { setContent(init.body); return response(files.get('file')); }
    if (key && method === 'PATCH') { const value = { ...files.get(key), trashed: true }; files.set(key, value); return response(value); }
    if (method === 'GET' && u.pathname === '/drive/v3/files') return response({ files: [...files.values()].filter((v) => v.parents[0] === 'ROOT_A' && !v.trashed) });
    throw new Error('Unexpected literal synthetic route.');
  };
  const state = newState(0);
  const guard = makeGuard({ config, state, now: () => time, forward, persist: async (value) => { if (options.persist) await options.persist(value); saved.push(structuredClone(value)); }, tokenSource: options.tokenSource ?? (async () => 'LOCAL_TOKEN'), onEvent: (event) => events.push(event), pause: async (ms) => { if (options.pause) await options.pause(ms); else time += ms; } });
  return { config, state, guard, saved, dispatched, events, wire, files, advance: (value) => { time = value; }, validator, setContent, body: () => body };
}
