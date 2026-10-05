import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseValidator, createBinding, validateBinding, changedValidator } from './binding.mjs';
export const BASE = 'user: base\ncompiled: base\n';
export const B = 'user: external\ncompiled: base\n';
export const A = 'user: base\ncompiled: app\n';
export const CONTROL = 'user: base\ncompiled: control\n';
export const V2_FIELDS = 'id,etag,version';
export const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const PUBLIC = ['/private/tmp/bower-google-probe-setup', '/private/tmp/bower-google-probe-setup-v2', '/private/tmp/bower-google-probe-setup-v3', '/private/tmp/bower-google-probe-setup-v4', '/private/tmp/bower-r1-content-probe', '/private/tmp/bower-r1-content-probe-v2', '/private/tmp/bower-r1-etag-v2-probe', '/private/tmp/bower-run-v1-reproduction', '/private/tmp/bower-run-v1-implementation', '/Users/deluisp/Projects/bower', '/Users/deluisp/Projects/bower-app', '/private/tmp/bower-p2-journal-ack', '/Users/deluisp/SecondBrain'];
const fail = () => { throw new Error('R1 bounded operation refused.'); };
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function privatePathAllowed(path) { return typeof path === 'string' && resolve(path) === path && !PUBLIC.some((p) => path === p || path.startsWith(`${p}/`)); }
const operations = ['root_create', 'root_verify', 'file_create', 'file_verify', 'base_read', 'control_write', 'control_read', 'conditional_A', 'B_initial', 'B_write', 'B_read', 'final_observe', 'cleanup_file', 'cleanup_file_bin', 'cleanup_file_verify', 'cleanup_inventory', 'cleanup_root', 'cleanup_root_bin', 'cleanup_root_verify', 'refresh', 'metadata'];
export function publicEvent(input) {
  if (!['request', 'barrier_waiting', 'barrier_release', 'adapter_diagnostic', 'stopped', 'result'].includes(input.event)) fail();
  const out = { event: input.event };
  if (input.actor !== undefined) { if (!['A', 'B', 'O', 'T'].includes(input.actor)) fail(); out.actor = input.actor; }
  if (input.operation !== undefined) { if (!operations.includes(input.operation)) fail(); out.operation = input.operation; }
  for (const key of ['status', 'attempt', 'bytes', 'milliseconds']) if (input[key] !== undefined) { if (!Number.isFinite(input[key]) || input[key] < 0) fail(); out[key] = input[key]; }
  return out;
}
export const unresolvedCreate = (state, operation) => !!state.intents[operation] && state.intents[operation].kind === 'create' && state.intents[operation].effect !== 'registered';
export const newState = (started) => ({ v: 1, started, attempts: 0, bytes: 0, refreshes: 0, resources: {}, intents: {}, records: [], stop: null, phase: 'normal' });
export function makeGuard({ config, state = newState(Date.now()), now = Date.now, monotonic = () => performance.now(), resumed = false, authorize = async () => config, persist, forward, tokenSource = async () => 'LOCAL_TOKEN', onEvent = () => {} }) {
  if (typeof persist !== 'function' || typeof forward !== 'function' || state.v !== 1 || !Number.isFinite(state.started) || !Number.isSafeInteger(state.attempts) || !Number.isSafeInteger(state.bytes) || !state.resources || !state.intents || !Array.isArray(state.records)) fail();
  // A new process cannot reconstruct this runtime's monotonic anchor safely.
  // Never reset an old case's elapsed budget using a fresh runtime or wall clock.
  if (resumed || state.clock) fail();
  const initialWall = now(), initialMonotonic = monotonic();
  if (!Number.isFinite(initialWall) || initialWall < state.started || !Number.isFinite(initialMonotonic)) fail();
  let previousMonotonic = initialMonotonic, wallHighWater = initialWall;
  state.clock = { originalStarted: state.started, elapsed: initialWall - state.started };
  function tick() {
    const value = monotonic();
    if (!Number.isFinite(value) || value < previousMonotonic) fail();
    previousMonotonic = value;
    state.clock.elapsed = initialWall - state.started + value - initialMonotonic;
    return value;
  }
  const binding = structuredClone(config);
  if ((state.rootName !== undefined && state.rootName !== binding.rootName) || (state.marker !== undefined && state.marker !== binding.marker)) fail();
  state.rootName = binding.rootName; state.marker = binding.marker;
  const active = new Map();
  let mb, aPrechecked = false, controlVerified = false, bWritten = false, bObserved = false, release, waitingResolve;
  state.bindings = {};
  const waiting = new Promise((yes) => { waitingResolve = yes; });
  const held = new Promise((yes) => { release = yes; });
  let released = false, cancelled = false;
  const save = async () => persist(structuredClone(state));
  const emit = (e) => onEvent(publicEvent(e));
  async function eligible(cleanup = state.phase === 'cleanup', admitted = false) {
    const current = await authorize();
    tick();
    const wall = now();
    if (!Number.isFinite(wall) || wall < wallHighWater) fail();
    wallHighWater = wall;
    const limits = binding.limits;
    if (!same({ rootName: current.rootName, marker: current.marker, limits: current.limits, reference: current.reference, identityAlias: current.identityAlias, scopeSet: current.scopeSet }, { rootName: binding.rootName, marker: binding.marker, limits, reference: binding.reference, identityAlias: binding.identityAlias, scopeSet: binding.scopeSet })) fail();
    if (current.approved !== true || typeof current.reference !== 'string' || !current.reference.trim() || !Number.isFinite(current.expiresAt) || now() >= current.expiresAt) fail();
    if (!Number.isSafeInteger(limits?.requests) || limits.requests < 11 || limits.requests > 60 || !Number.isFinite(limits.milliseconds) || limits.milliseconds <= 120000 || limits.milliseconds > 600000 || !Number.isSafeInteger(limits.bytes) || limits.bytes < 8193 || limits.bytes > 65536) fail();
    if (typeof binding.rootName !== 'string' || !binding.rootName.trim() || binding.rootName.length > 100 || !id(binding.marker)) fail();
    const deadline = Math.min(state.started + limits.milliseconds, current.expiresAt, binding.expiresAt);
    if (state.clock.elapsed >= limits.milliseconds - (cleanup ? 0 : 120000) || now() >= deadline - (cleanup ? 0 : 120000) || state.attempts > limits.requests - (cleanup ? 0 : 10) || (!admitted && state.attempts === limits.requests - (cleanup ? 0 : 10)) || state.bytes > limits.bytes - (cleanup ? 0 : 8192) || (!admitted && state.bytes === limits.bytes - (cleanup ? 0 : 8192))) fail();
    if (!cleanup && state.stop) fail();
  }
  function context() { return { fileId: resource('file').id, folderId: resource('root').id, account: binding.identityAlias, scopeSet: binding.scopeSet, strategy: 'drive-v2-etag-if-match' }; }
  async function token(fresh) { await eligible(); const value = await tokenSource(fresh); await eligible(); if (typeof value !== 'string' || !value) fail(); return value; }
  function resource(key) { const v = state.resources[key]; if (!v || !id(v.id) || v.invalid) fail(); return v; }
  function ownership(w, key, allowTrashed = false) {
    const r = resource(key);
    if (!w || w.id !== r.id || w.name !== r.name || !same(w.parents, [r.parent]) || !same(w.appProperties, { r1Probe: binding.marker }) || w.mimeType !== (key === 'root' ? 'application/vnd.google-apps.folder' : 'text/markdown') || (!allowTrashed && w.trashed === true) || typeof w.modifiedTime !== 'string' || !Number.isFinite(Date.parse(w.modifiedTime)) || typeof w.createdTime !== 'string' || !Number.isFinite(Date.parse(w.createdTime))) { state.resources[key].invalid = true; fail(); }
  }
  function params(u, pairs) { if (!same([...u.searchParams.entries()].sort(), Object.entries(pairs).sort())) fail(); }
  async function requestShape(actor, url, init, operation) {
    const u = new URL(url);
    if (u.origin !== 'https://www.googleapis.com' || u.username || u.password || u.hash) fail();
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    if ([...headers.keys()].some((k) => !['authorization', 'content-type', 'if-match'].includes(k)) || !/^Bearer [^\r\n]+$/.test(headers.get('authorization') ?? '')) fail();
    if (headers.has('if-match') && !(['control_write', 'conditional_A'].includes(operation.name) && method === 'PUT' && u.pathname.startsWith('/upload/drive/v2/files/'))) fail();
    const body = init.body === undefined ? Buffer.alloc(0) : Buffer.from(typeof init.body === 'string' ? init.body : init.body instanceof Blob ? await init.body.arrayBuffer() : fail());
    if (method === 'GET' && (body.length || headers.has('content-type'))) fail();
    const r = state.resources.root, f = state.resources.file;
    const metadata = (key) => {
      const target = resource(key);
      if (method !== 'GET' || u.pathname !== `/drive/v3/files/${target.id}`) fail(); params(u, { fields: FIELDS }); return { kind: 'metadata', key, body };
    };
    const media = () => { const target = resource('file'); if (method !== 'GET' || u.pathname !== `/drive/v3/files/${target.id}`) fail(); params(u, { alt: 'media' }); return { kind: 'media', key: 'file', body }; };
    if (operation.name === 'root_create') {
      if (actor !== 'A' || method !== 'POST' || u.pathname !== '/drive/v3/files' || state.intents.root_create || r) fail();
      params(u, { fields: FIELDS });
      if (headers.get('content-type') !== 'application/json; charset=UTF-8' || body.toString() !== JSON.stringify({ name: binding.rootName, mimeType: 'application/vnd.google-apps.folder', parents: ['root'], appProperties: { r1Probe: binding.marker } })) fail();
      return { kind: 'create', key: 'root', body };
    }
    if (operation.name === 'file_create') {
      const root = resource('root');
      if (actor !== 'A' || method !== 'POST' || u.pathname !== '/upload/drive/v3/files' || state.intents.file_create || f) fail();
      params(u, { uploadType: 'multipart', fields: FIELDS });
      const boundary = /^multipart\/related; boundary=([A-Za-z0-9]{1,70})$/.exec(headers.get('content-type') ?? '')?.[1]; if (!boundary) fail();
      const expected = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: 'fixture.md', parents: [root.id], mimeType: 'text/markdown', appProperties: { r1Probe: binding.marker } })}\r\n--${boundary}\r\ncontent-type: text/markdown\r\n\r\n${BASE}\r\n--${boundary}--`;
      if (!body.equals(Buffer.from(expected))) fail();
      return { kind: 'create', key: 'file', body };
    }
    if (['base_read', 'control_read', 'B_read'].includes(operation.name)) {
      if ((operation.name === 'base_read' ? actor !== 'A' : actor !== 'O')) fail();
      const offset = operation.name === 'base_read' ? 0 : 1;
      if (offset && operation.stage === 0) return metadata('file');
      const stage = operation.stage - offset;
      if (stage === 1) return media();
      if (![0, 2].includes(stage) || method !== 'GET' || u.pathname !== `/drive/v2/files/${resource('file').id}`) fail();
      params(u, { fields: V2_FIELDS }); return { kind: 'validator', key: 'file', body };
    }
    if (['control_write', 'conditional_A'].includes(operation.name)) {
      const expected = operation.name === 'control_write' ? BASE : CONTROL;
      const token = state.bindings[operation.name === 'control_write' ? 'base' : 'control'];
      validateBinding(operation.readToken, context(), expected);
      if (!same(operation.readToken, token) || actor !== 'A' || operation.stage !== 0 || method !== 'PUT' || u.pathname !== `/upload/drive/v2/files/${resource('file').id}` || state.intents[operation.name]) fail();
      params(u, { uploadType: 'media', fields: V2_FIELDS });
      if (headers.get('content-type') !== 'text/markdown' || headers.get('if-match') !== operation.readToken.etag || !body.equals(Buffer.from(operation.name === 'control_write' ? CONTROL : A))) fail();
      if (operation.name === 'conditional_A') { if (!controlVerified) fail(); aPrechecked = true; }
      return { kind: 'conditional_write', key: 'file', body };
    }
    if (operation.name === 'B_write') {
      if (actor !== 'B') fail();
      if (operation.stage === 0) return metadata('file');
      if (operation.stage !== 1 || method !== 'PATCH' || u.pathname !== `/upload/drive/v3/files/${resource('file').id}` || state.intents.B_write) fail();
      params(u, { uploadType: 'media', fields: FIELDS });
      if (headers.get('content-type') !== 'text/markdown' || !body.equals(Buffer.from(B))) fail();
      return { kind: 'write', key: 'file', body };
    }
    if (['file_verify', 'final_observe'].includes(operation.name)) {
      if (actor !== 'O' || operation.stage > 1) fail(); return operation.stage === 0 ? metadata('file') : media();
    }
    if (operation.name === 'root_verify') { if (actor !== 'O') fail(); return metadata('root'); }
    if (operation.name === 'B_initial') { if (actor !== 'B') fail(); return metadata('file'); }
    if (operation.name.startsWith('cleanup_')) {
      if (state.phase !== 'cleanup' || actor !== 'O') fail();
      if (operation.name === 'cleanup_inventory') {
        if (method !== 'GET' || u.pathname !== '/drive/v3/files') fail();
        params(u, { q: `'${resource('root').id}' in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
        return { kind: 'inventory', body };
      }
      const key = operation.name.includes('_file') ? 'file' : 'root';
      if (operation.name.endsWith('_bin')) {
        if (state.foreignContent || state.stop === 'unknown_effect' || (key === 'root' && unresolvedCreate(state, 'file_create')) || !state[`${key}CleanupChecked`] || state.intents[operation.name] || (key === 'root' && !state.inventoryClear)) fail();
        if (method !== 'PATCH' || u.pathname !== `/drive/v3/files/${resource(key).id}` || headers.get('content-type') !== 'application/json; charset=UTF-8' || body.toString() !== '{"trashed":true}') fail();
        params(u, { fields: FIELDS }); return { kind: 'bin', key, body };
      }
      return metadata(key);
    }
    fail();
  }
  async function fetch(actor, url, init = {}) {
    const operation = active.get(actor); if (!operation) fail();
    const shape = await requestShape(actor, url, init, operation);
    await eligible();
    if (new Headers(init.headers).get('authorization') !== `Bearer ${await token(false)}`) fail();
    if (operation.name === 'conditional_A' && shape.kind === 'conditional_write') {
      emit({ event: 'barrier_waiting', actor, operation: operation.name }); waitingResolve();
      await held;
      if (cancelled || !released || !bWritten || !bObserved) fail();
      await eligible();
      // Preserve the unchanged queued request; a changed token requires stopping, not substitution.
      if (new Headers(init.headers).get('authorization') !== `Bearer ${await token(false)}`) fail();
      await requestShape(actor, url, init, operation);
      await eligible(); emit({ event: 'barrier_release', actor, operation: operation.name });
    }
    const mutation = ['create', 'write', 'conditional_write', 'bin'].includes(shape.kind);
    if (mutation) { state.intents[operation.name] = { kind: shape.kind, status: 'unknown', effect: 'unresolved', dispatchReserved: true }; await save(); }
    await eligible();
    const ceiling = binding.limits.bytes - (state.phase === 'cleanup' ? 0 : 8192);
    if (state.bytes + shape.body.length > ceiling) fail();
    state.attempts++; state.bytes += shape.body.length; await save(); await eligible(state.phase === 'cleanup', true);
    // This specific already-admitted attempt may consume the final available slot.
    const start = tick(); let response, bytes;
    try {
      response = await forward(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (response.status >= 300 && response.status < 400) fail();
      const chunks = []; const reader = response.body?.getReader();
      if (reader) for (;;) {
        const part = await reader.read(); if (part.done) break;
        state.bytes += part.value.byteLength;
        if (state.bytes > ceiling) { await reader.cancel(); fail(); }
        chunks.push(Buffer.from(part.value));
      }
      bytes = Buffer.concat(chunks);
    } catch {
      state.stop = mutation ? 'unknown_effect' : 'transport'; await save();
      throw new Error('R1 request outcome requires reconciliation.');
    }
    const privateHeaders = {};
    for (const [key, value] of response.headers) { if (!['content-type', 'etag', 'last-modified', 'x-goog-generation', 'x-goog-metageneration'].includes(key)) continue; if (value.length > 2048 || JSON.stringify(privateHeaders).length > 8192) fail(); privateHeaders[key] = value; }
    state.records.push({ actor, operation: operation.name, kind: shape.kind, status: response.status, complete: true, bodyHash: hash(bytes), responseHeaders: privateHeaders, milliseconds: tick() - start });
    if (mutation) Object.assign(state.intents[operation.name], { status: response.status, complete: true });
    if (response.ok) {
      let w;
      if (shape.kind !== 'media') { try { w = JSON.parse(bytes); } catch { state.stop = shape.kind === 'conditional_write' ? 'unknown_effect' : 'shape'; await save(); fail(); } }
      if (['validator', 'conditional_write'].includes(shape.kind)) {
        try {
          const parsed = parseValidator(w, resource('file').id);
          state.records.at(-1).validator = parsed;
          if (shape.kind === 'conditional_write') state.intents[operation.name].effect = 'validated_response';
          else {
            const offset = operation.name === 'base_read' ? 0 : 1;
            if (operation.stage - offset === 0) operation.before = w;
            else {
              const expected = operation.name === 'base_read' ? BASE : operation.name === 'control_read' ? CONTROL : B;
              const token = createBinding(operation.before, operation.readBytes, w, expected, context());
              const name = operation.name === 'base_read' ? 'base' : operation.name === 'control_read' ? 'control' : 'external';
              if (name !== 'base') changedValidator(state.bindings[name === 'control' ? 'base' : 'control'], token);
              state.bindings[name] = token;
              if (name === 'control') controlVerified = true;
              if (name === 'external') { if (!bWritten) fail(); bObserved = true; }
            }
          }
        } catch { state.stop = shape.kind === 'conditional_write' ? 'unknown_effect' : 'validator'; await save(); fail(); }
      } else if (shape.kind === 'create') {
        // Retain any returned ID privately even when ownership validation fails.
        state.resources[shape.key] = { id: id(w?.id) ? w.id : null, parent: shape.key === 'root' ? w?.parents?.[0] ?? null : resource('root').id, name: shape.key === 'root' ? binding.rootName : 'fixture.md', invalid: false };
        const target = state.resources[shape.key];
        if (!id(target.id) || target.id === 'root' || !Array.isArray(w?.parents) || w.parents.length !== 1 || !id(w.parents[0]) || (shape.key === 'file' && (w.parents[0] !== target.parent || target.id === resource('root').id))) { target.invalid = true; state.stop = 'ownership'; await save(); fail(); }
        try { ownership(w, shape.key); } catch { state.stop = 'ownership'; await save(); fail(); }
        state.intents[operation.name].effect = 'registered';
      } else if (['metadata', 'write', 'bin'].includes(shape.kind)) {
        try { ownership(w, shape.key, shape.kind === 'bin' || (operation.name.endsWith('_verify') && operation.name.startsWith('cleanup_'))); } catch { state.stop = 'ownership'; await save(); fail(); }
        if (operation.name.endsWith('_bin') && w.trashed !== true) { state.stop = 'cleanup'; await save(); fail(); }
        if (operation.name.startsWith('cleanup_') && operation.name.endsWith('_verify')) {
          if (w.trashed !== true) { state.stop = 'cleanup'; await save(); fail(); } state[`${shape.key}Binned`] = true;
        }
        if (operation.name === 'cleanup_file') state.fileCleanupChecked = true;
        if (operation.name === 'cleanup_root') state.rootCleanupChecked = true;
        if (operation.name === 'B_initial') mb = w.modifiedTime;
        if (operation.name === 'B_write' && shape.kind === 'metadata' && w.modifiedTime !== mb) fail();
        if (shape.kind === 'write' || shape.kind === 'bin') state.intents[operation.name].effect = 'owned_response';
        if (operation.name === 'B_write' && shape.kind === 'write') bWritten = true;
      } else if (shape.kind === 'media') {
        if (![BASE, CONTROL, B, A].some((literal) => bytes.equals(Buffer.from(literal)))) state.foreignContent = true;
        if (operation.name === 'file_verify') { if (!bytes.equals(Buffer.from(BASE))) fail(); }
        if (['base_read', 'control_read', 'B_read'].includes(operation.name)) operation.readBytes = bytes;
      } else if (shape.kind === 'inventory') {
        if (!Array.isArray(w?.files) || w.files.length || w.nextPageToken) { state.stop = 'unexpected_children'; await save(); fail(); } state.inventoryClear = true;
      }
      if (w && !['inventory', 'validator', 'conditional_write'].includes(shape.kind)) state.records.at(-1).metadata = Object.fromEntries(['id', 'name', 'mimeType', 'parents', 'modifiedTime', 'createdTime', 'size', 'appProperties', 'trashed'].filter((key) => w[key] !== undefined).map((key) => [key, w[key]]));
      operation.stage++;
    }
    await save(); emit({ event: 'request', actor, operation: operation.name, status: response.status, attempt: state.attempts, bytes: bytes.length, milliseconds: tick() - start });
    return new Response(response.status === 204 ? null : bytes, { status: response.status, headers: response.headers });
  }
  async function refresh(url, init) {
    await eligible();
    const u = new URL(url); const headers = new Headers(init.headers); const body = new URLSearchParams(init.body);
    if (u.href !== 'https://oauth2.googleapis.com/token' || init.method !== 'POST' || !same([...headers.keys()], ['content-type']) || headers.get('content-type') !== 'application/x-www-form-urlencoded' || !same([...body.keys()].sort(), ['client_id', 'client_secret', 'grant_type', 'refresh_token']) || body.get('grant_type') !== 'refresh_token' || [...body.values()].some((v) => !v) || state.refreshes >= 2) fail();
    const bodyBytes = Buffer.byteLength(body.toString()); const ceiling = binding.limits.bytes - (state.phase === 'cleanup' ? 0 : 8192);
    if (state.bytes + bodyBytes > ceiling) fail(); state.refreshes++; state.attempts++; state.bytes += bodyBytes; await save(); await eligible(state.phase === 'cleanup', true);
    const start = tick();
    const res = await forward(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400) fail();
    const chunks = []; const reader = res.body?.getReader();
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; state.bytes += part.value.byteLength; if (state.bytes > ceiling) { await reader.cancel(); fail(); } chunks.push(Buffer.from(part.value)); }
    const milliseconds = tick() - start;
    state.records.push({ actor: 'T', operation: 'refresh', kind: 'refresh', status: res.status, complete: true, milliseconds });
    await save(); emit({ event: 'request', actor: 'T', operation: 'refresh', status: res.status, attempt: state.attempts, milliseconds });
    // Refresh body/header/token values are returned only to reviewed tokenProvider, never persisted.
    return new Response(Buffer.concat(chunks), { status: res.status, headers: res.headers });
  }
  return {
    state, fetch, refresh, token, eligible, context,
    binding(name) { const value = state.bindings[name]; if (!value) fail(); return Object.freeze(structuredClone(value)); },
    async operation(actor, name, action, readToken) { if (active.has(actor) || !operations.includes(name)) fail(); active.set(actor, { name, stage: 0, readToken }); try { return await action(); } finally { active.delete(actor); } },
    async releaseA() { await eligible(); if (!aPrechecked || !bWritten || !bObserved || released) fail(); released = true; release(); },
    cancelA() { cancelled = true; release(); },
    waitA: () => waiting,
    async cleanupMode() { state.phase = 'cleanup'; await save(); },
    async stop(reason) { state.stop = reason; await save(); },
  };
}
