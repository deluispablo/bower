import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const repo = '/Users/deluisp/Projects/bower-app';
const output = '/private/tmp/bower-draft-lifecycle-reproduction';
const sourcePins = {
  'src/features/piles/draft-files.ts': '74915d6259d173835cf1d1d6012e31267734ab9487d4fc3ff932266519573099',
  'src/data/device.ts': '12abec7ba3bf500ab940bf1b55638eac33a05a48a10836b73171563b86e0d1be',
  'src/data/live/session.ts': 'aaa0af4bd2a5e124b1ee9c49e8424c99faa5abcbd1f58dcd11a158d1f780bd88',
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const observations = [];
const event = (value) => { observations.push(value); process.stdout.write(`${JSON.stringify(value)}\n`); };

// Storage alone is a test platform stand-in. Production Map/cleanup are never mocked.
class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

let phase = 'load';
try {
  await mkdir(`${output}/sources`, { recursive: true });
  const require = createRequire(`${repo}/package.json`);
  const ts = require('typescript');
  const sources = new Map();
  const manifest = {
    planningRevision: '2026-10-05-contracts-2', phase: 'P2', capabilityIds: ['C01', 'C02'], policy: 'D02',
    targetSha: 'e5cb57d', sourceSha: '1c1e60c0c6dee4b610cd845ee0a3c393f265370f',
    assignmentRecord: 'fd13a21 (docs only)', runtime: process.version, typescript: ts.version,
    snapshotHashes: sourcePins, execution: 'public keep/get/forget and forgetThisPerson; LiveSession inspected only',
  };
  for (const [path, digest] of Object.entries(sourcePins)) {
    const bytes = await readFile(`${repo}/${path}`);
    assert.equal(hash(bytes), digest, `Unexpected source bytes: ${path}`);
    const filename = path.replaceAll('/', '__');
    await writeFile(`${output}/sources/${filename}`, bytes, { flag: 'wx' });
    sources.set(path, bytes.toString('utf8'));
  }
  await writeFile(`${output}/source-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const diagnostics = [];
  const context = vm.createContext({ Blob, localStorage: local, sessionStorage: session,
    console: { error: (...args) => diagnostics.push(args.map((item) => String(item))) } });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    assert.ok(path === 'src/features/piles/draft-files.ts' || path === 'src/data/device.ts', 'Unexpected execution dependency');
    const compiled = ts.transpileModule(sources.get(path), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, strict: true,
    }, reportDiagnostics: true });
    const errors = (compiled.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, 'Transpilation failed');
    const module = { exports: {} };
    const execute = vm.runInContext(`(function(require,module,exports){${compiled.outputText}\n})`, context, { filename: path });
    execute(() => { throw new Error('Unexpected module import'); }, module, module.exports);
    modules.set(path, module.exports);
    return module.exports;
  }
  const draft = load('src/features/piles/draft-files.ts');
  const device = load('src/data/device.ts');
  event({ event: 'source_loaded', hashesMatched: true, productionModules: 2, runtime: process.version, typescript: ts.version });

  phase = 'positive-control';
  const literal = 'Synthetic pending bytes A.\n';
  const blob = new Blob([literal], { type: 'text/plain' });
  const blobHash = hash(await blob.arrayBuffer().then((bytes) => Buffer.from(bytes)));
  assert.equal(draft.get('DRAFT_A'), undefined);
  draft.keep('DRAFT_A', blob);
  assert.equal(draft.get('DRAFT_A'), blob);
  assert.equal(await draft.get('DRAFT_A').text(), literal);
  assert.equal(draft.get('DRAFT_A'), blob);
  draft.keep('CONTROL_REMOVE', new Blob(['Synthetic control.\n']));
  assert.ok(draft.get('CONTROL_REMOVE') instanceof Blob);
  draft.forget('CONTROL_REMOVE');
  assert.equal(draft.get('CONTROL_REMOVE'), undefined);
  event({ event: 'same_visit_positive', passed: true, repeatedIdentityMatch: true, bytes: blob.size, sha256: blobHash,
    explicitForgetControlPassed: true });

  // Expected cleanup comes from AGENTS/D02, independently of implementation output.
  const localPersonKeys = ['bower:seen', 'bower:dismissed', 'bower:run-seen', 'bower:bookmarks', 'bower:open', 'bower:stopped-away'];
  const sessionPersonKeys = ['bower:add-draft', 'bower:add-items', 'bower:toured', 'bower:tabs'];
  for (const key of localPersonKeys) local.setItem(key, 'Synthetic person metadata.');
  session.setItem('bower:add-draft', 'Synthetic pending context A.');
  session.setItem('bower:add-items', JSON.stringify([{ key: 'DRAFT_A', name: 'Synthetic.txt', kind: 'text', origin: 'device' }]));
  session.setItem('bower:toured', '1');
  session.setItem('bower:tabs', 'Synthetic tabs.');
  const outboxKey = 'bower:outbox:FOLDER_A';
  const outbox = '[{"v":1,"id":"CHANGE_A","device":"DEVICE_A","at":1,"kind":"create","what":"Synthetic note","fileId":"FILE_A"}]';
  local.setItem(outboxKey, outbox);
  local.setItem('synthetic:device-setting', 'dark');
  assert.equal(local.getItem(outboxKey), outbox);
  assert.equal(local.getItem('bower:outbox:FOLDER_B'), null);
  assert.ok(session.getItem('bower:add-items').includes('DRAFT_A'));
  assert.ok(session.getItem('bower:add-draft'));
  assert.equal(draft.get('DRAFT_A'), blob);
  event({ event: 'cleanup_preconditions', passed: true, personLocalKeys: localPersonKeys.length,
    personSessionKeys: sessionPersonKeys.length, outboxAlias: 'FOLDER_A', outboxSha256: hash(outbox) });

  phase = 'production-cleanup';
  device.forgetThisPerson();
  for (const key of localPersonKeys) assert.equal(local.getItem(key), null, `Local metadata not forgotten: ${key}`);
  for (const key of sessionPersonKeys) assert.equal(session.getItem(key), null, `Session metadata not forgotten: ${key}`);
  assert.equal(local.getItem(outboxKey), outbox, 'Original-folder outbox must stay');
  assert.equal(local.getItem('bower:outbox:FOLDER_B'), null, 'No B outbox retargeting');
  assert.equal(local.getItem('synthetic:device-setting'), 'dark', 'Unrelated device setting must stay');
  assert.equal(diagnostics.length, 0, 'Storage cleanup unexpectedly diagnosed failure');
  const retained = draft.get('DRAFT_A');
  const post = {
    event: 'after_actual_forgetThisPerson', metadataForgotten: true, originalOutboxExactBytesPreserved: true,
    outboxSha256: hash(local.getItem(outboxKey)), bOutboxAbsent: true, deviceSettingPreserved: true,
    diagnostics: diagnostics.length, blobPresent: retained instanceof Blob, sameBlobIdentity: retained === blob,
    retainedBytesHash: retained === undefined ? null : hash(Buffer.from(await retained.arrayBuffer())),
  };
  event(post);

  phase = 'expected-cleanup-assertion';
  let genuineRed = false;
  try {
    assert.equal(retained, undefined, 'Sign-out device cleanup must forget unsent selected Blob bytes');
    event({ event: 'expected_cleanup_assertion', result: 'green' });
  } catch (error) {
    assert.equal(error.code, 'ERR_ASSERTION');
    genuineRed = true;
    event({ event: 'expected_cleanup_assertion', result: 'genuine-assertion-red', code: error.code,
      expected: 'undefined', actual: 'same synthetic Blob retained', message: error.message.split('\n')[0] });
  }

  phase = 'explicit-recovery-control';
  draft.forget('DRAFT_A');
  assert.equal(draft.get('DRAFT_A'), undefined);
  assert.equal(local.getItem(outboxKey), outbox);
  draft.keep('DRAFT_NEW', new Blob(['Synthetic new visit bytes.\n']));
  assert.equal(await draft.get('DRAFT_NEW').text(), 'Synthetic new visit bytes.\n');
  assert.equal(draft.get('DRAFT_A'), undefined);
  draft.forget('DRAFT_NEW');
  event({ event: 'explicit_forget_recovery_control', passed: true, oldKeyAbsent: true,
    originalOutboxPreserved: true, newKeepGetWorks: true, productionRepair: false });
  await writeFile(`${output}/observations.json`, `${JSON.stringify(observations, null, 2)}\n`, { flag: 'wx' });
  process.exitCode = genuineRed ? 1 : 0;
} catch (error) {
  event({ event: 'setup_or_control_failure', phase, code: error.code ?? null, message: error.message });
  process.exitCode = 2;
}
