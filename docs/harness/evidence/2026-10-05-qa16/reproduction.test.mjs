import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPublic, sourceHashes, diagnostics } from './load-public.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
const { FakeDrive } = loadPublic('src/data/drive/fake-drive.ts');
const { DriveVault } = loadPublic('src/data/vault/drive-vault.ts');
const { FakeWorker } = loadPublic('src/data/fake/fake-worker.ts');
const { BowerError } = loadPublic('src/data/types.ts');
const { isJournalRecord } = loadPublic('src/data/vault/journal.ts');
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const records = [];
const digest = (text) => createHash('sha256').update(text).digest('hex');
async function outcome(call) {
  try { return { kind: 'resolved', value: await call() }; }
  catch (e) { return { kind: 'rejected', readable: e instanceof BowerError, code: e.code, message: e.message, name: e.name }; }
}
async function consumer(snapshot, rootId, fileId, kind) {
  localStorage.clear(); sessionStorage.clear();
  const drive = FakeDrive.restore(snapshot, { clock: () => 1000 });
  const before = await drive.snapshot(); let changes = 0;
  drive.onChange = () => { changes++; };
  const diagnosticsFrom = diagnostics.length;
  const called = kind === 'vault'
    ? await outcome(() => new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'DEVICE_A' }).lastRun())
    : await outcome(() => new FakeWorker({ drive, rootId, scenario: 'default', scale: 'instant', fresh: false }).status());
  const after = await drive.snapshot();
  const bytes = await drive.readText(fileId);
  const tree = Object.fromEntries(drive.dump(rootId));
  return { outcome: called, before, after, unchanged: before === after, changes, bytes, tree, diagnostics: diagnostics.slice(diagnosticsFrom), runningPiles: kind === 'worker' ? 'status only; no process called' : undefined };
}
for (const fixture of fixtures) {
  test(`persisted v1 run fixtures agree across current recovery consumers (${fixture.name})`, async () => {
    const literal = readFileSync(new URL(fixture.path, import.meta.url), 'utf8');
    const original = new FakeDrive({ clock: () => 1000 });
    const rootId = (await original.createFolder('root', 'Synthetic Bower')).id;
    const sys = (await original.createFolder(rootId, '.bower')).id;
    const inbox = (await original.createFolder(rootId, 'Inbox')).id;
    await original.createText(inbox, 'Untouched.txt', 'SYNTHETIC_PENDING_INPUT\n');
    const changes = (await original.createFolder(sys, 'changes')).id;
    const journalLiteral = '{ "v": 1, "id": "CHANGE_A", "device": "DEVICE_A", "at": 1, "kind": "task", "what": "Completed the example task.", "path": "Resources/Example.md", "text": "Done" }\n';
    assert.equal(isJournalRecord(JSON.parse(journalLiteral)), true);
    await original.createText(changes, 'change-A.json', journalLiteral);
    const fileId = (await original.createText(sys, 'last-run.json', literal)).id;
    const snapshot = await original.snapshot();
    const vault = await consumer(snapshot, rootId, fileId, 'vault');
    const worker = await consumer(snapshot, rootId, fileId, 'worker');
    // Repair a copy of the actual post-read state using its current read modifiedTime.
    // Original and changed bytes remain archived separately before deliberate repair.
    const repaired = FakeDrive.restore(worker.after, { clock: () => 1000 });
    const current = await repaired.get(fileId);
    const repairedLiteral = readFileSync(new URL('./fixtures/valid-done.json', import.meta.url), 'utf8');
    await repaired.writeText(fileId, repairedLiteral, current.modifiedTime);
    const repairSnapshot = await repaired.snapshot();
    const recoveryVault = await consumer(repairSnapshot, rootId, fileId, 'vault');
    const recoveryWorker = await consumer(repairSnapshot, rootId, fileId, 'worker');
    records.push({ fixture, literal, literalHash: digest(literal), rootId, fileId, snapshot, vault, worker, repair: { usedModifiedTime: current.modifiedTime, literal: repairedLiteral, vault: recoveryVault, worker: recoveryWorker } });
    writeFileSync(new URL('./observations.json', import.meta.url), JSON.stringify({ sourceHashes, records }, null, 2) + '\n');
    assert.equal(recoveryVault.outcome.kind, 'resolved');
    assert.equal(recoveryWorker.outcome.kind, 'resolved');
    assert.equal(recoveryWorker.outcome.value.phase, 'done');
    assert.equal(recoveryVault.unchanged, true); assert.equal(recoveryWorker.unchanged, true);
    assert.equal(vault.unchanged, true);
    assert.equal(vault.bytes, literal);
    if (fixture.valid) {
      const expected = JSON.parse(literal);
      assert.deepEqual(vault.outcome, { kind: 'resolved', value: expected });
      const { report, ...wire } = expected.run;
      assert.deepEqual(worker.outcome, { kind: 'resolved', value: wire });
      assert.equal(worker.unchanged, true); assert.equal(worker.bytes, literal);
      assert.equal(worker.changes, 0);
    } else {
      assert.equal(vault.outcome.kind, 'rejected'); assert.equal(vault.outcome.readable, true);
      assert.equal(vault.outcome.message, 'Bower could not read its latest update. Try again.');
      assert.equal(worker.outcome.kind, 'rejected', 'fresh FakeWorker.status must refuse the same invalid durable bytes visibly');
      assert.equal(worker.outcome.readable, true);
      assert.equal(worker.bytes, literal, 'invalid durable bytes must not be normalized or overwritten');
      assert.equal(worker.unchanged, true); assert.equal(worker.changes, 0);
    }
  });
}
