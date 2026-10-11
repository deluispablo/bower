import { RUNNER_WRITES } from '../vault/layout';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseRunManifest, parseRunManifestV2, type Content, type Manifest, type ManifestRefusal, type Operation, type ReportContribution, type SeenFile, type VerifiedContent } from './run-manifest';
import { parseRunCheckpoint } from './run-checkpoint';

const dir = 'docs/harness/evidence/2026-10-05-local-prerequisites/run-recovery-contract/';
const fixture = (file: string): Record<string, unknown> => JSON.parse(readFileSync(dir + file, 'utf8')) as Record<string, unknown>;
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (value: unknown): Uint8Array => utf8(JSON.stringify(value));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Independent oracle (not the module under test, not record-json): the contract's C/H written
// directly over node:crypto. It is itself checked against the literal fixture digests below.
const C = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(C).join(',')}]`;
  const node = value as Record<string, unknown>;
  return `{${Object.keys(node).sort().map((key) => `${JSON.stringify(key)}:${C(node[key])}`).join(',')}}`;
};
const H = (value: unknown): string => createHash('sha256').update(C(value), 'utf8').digest('hex');
/** Raw text content per the contract: SHA-256 and size of the exact UTF-8 bytes, never C(string). */
const raw = (text: string): Content => {
  const encoded = Buffer.from(text, 'utf8');
  return { encoding: 'utf8', size: encoded.byteLength, sha256: createHash('sha256').update(encoded).digest('hex') };
};

// Literal digests copied from the ratified fixtures; never computed by the code under test.
const manifest01Hash = '9badff317145d753071b77cb70bd17c13ac745047180d0e0b6e341c1a1eef088';
const capture01Id = 'ae3b36b25031ccb1c4003080e90e08e146df73b93a9e74941db58909a1046314';
const operation01Id = 'ffc686d1c2d38997ab8d92f0fd566b21a1989fd900b8ba38c5b9f5a1cd1ac1da';
const manifest04Hash = '109ccdb48872207b5125ac2f4db2844af31c0ec55328de644ab7957f407e4d86';
const capture04Id = '3686529180d812b27dc18b309ba211d87390c4a1923d4a707125aad740aff193';
const operation04First = '5ca60524fdf569e4c4c5ee985058989f9679107b5289720503f1dd0d2b099331';

const input = (file: string): Record<string, unknown> => fixture(file).input as Record<string, unknown>;
const manifest01 = (): Manifest => input('01-admission-reopen.json').manifest as Manifest;
const cases05 = (): Record<string, unknown>[] => fixture('05-invalid-new-records.json').inputCases as Record<string, unknown>[];

const time = '2026-10-05T10:00:00.000Z';
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile => ({ fileId, name, parents: [parent], folder, modifiedTime: time });
const verified = (size: number, sha256: string, encoding: 'utf8' | 'blob' = 'utf8'): VerifiedContent => ({ encoding, size, sha256, provenance: 'fake-stored', observedModifiedTime: time });
const digest = (char: string): string => char.repeat(64);
const verifiedText = (text: string): VerifiedContent => ({ ...raw(text), provenance: 'fake-stored', observedModifiedTime: time });
const contextText = ' Edited\r\n é😀  ';
const noteText = 'Receipts\r\n é ';
const runnerText = '[]\n';

/** Recompute captureId and operation IDs with the oracle, carrying references to renamed operations. */
function seal(value: Manifest): Manifest {
  value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  const ref = (id: string): string => renamed.get(id) ?? id;
  for (const op of value.operations) {
    op.dependsOn = op.dependsOn.map(ref);
    if ('parent' in op.effect && 'createdBy' in op.effect.parent) op.effect.parent = { createdBy: ref(op.effect.parent.createdBy) };
    const next = H({ runId: value.runId, captureId: value.captureId, ordinal: op.ordinal, effect: op.effect });
    renamed.set(op.operationId, next);
    op.operationId = next;
  }
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return value;
}

/** Synthetic manifest exercising every effect kind, reference kind and report field. */
function rich(): Manifest {
  const value = clone(manifest01());
  value.capture.piles.push(
    { pileId: 'pile-folder', source: { kind: 'declared', ref: { declarationId: 'decl-folder', sha256: digest('b') } },
      anchor: seen('pile-folder-id', 'Receipts', 'inbox-folder', true), memberKeys: ['member-a', null],
      childFileIds: ['child-a', 'context-file'],
      context: { kind: 'text', memberKey: 'member-context', file: seen('context-file', 'context.md', 'pile-folder-id'),
        text: contextText, content: verifiedText(contextText) } },
    { pileId: 'legacy-pile', source: { kind: 'observed' }, anchor: null, memberKeys: [null, null], childFileIds: [], context: { kind: 'absent' } },
  );
  value.capture.members.push({ pileId: 'pile-folder', memberKey: 'member-a', file: seen('child-a', 'a.txt', 'pile-folder-id'), content: verified(3, digest('d'), 'blob') });
  value.capture.journal.push({ recordId: '2026-10-05T10-00-00.000Z-abc123', sha256: digest('e'), fileIds: ['journal-file'] });
  value.capture.places.push({ file: seen('bower-system', '.bower', 'fake-root', true), path: '.bower' });
  value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const ids: string[] = [];
  const add = (effect: Operation['effect'], dependsOn: number[]): void => {
    const ordinal = ids.length;
    const operationId = H({ runId: value.runId, captureId: value.captureId, ordinal, effect });
    ids.push(operationId);
    value.operations[ordinal] = { operationId, ordinal, dependsOn: dependsOn.map((at) => ids[at] ?? ''), effect };
  };
  const [first] = manifest01().operations;
  if (!first) throw new Error('Fixture 01 must contain one operation');
  add(first.effect, []);
  add({ kind: 'create-folder', parent: { fileId: 'areas-home' }, name: 'Receipts', createKey: 'folder-new' }, []);
  add({ kind: 'create-text', parent: { createdBy: ids[1] ?? '' }, name: 'Receipts note.md', createKey: 'note-new',
    text: noteText, content: raw(noteText), purpose: 'generated' }, [1]);
  add({ kind: 'write-runner-json', before: seen('questions-file', 'questions.json', 'bower-system'),
    beforeContent: verified(3, digest('1')), path: '.bower/questions.json', text: runnerText, content: raw(runnerText) }, []);
  add({ kind: 'move', before: seen('child-a', 'a.txt', 'pile-folder-id'), parent: { createdBy: ids[1] ?? '' }, name: 'a.txt',
    properties: { by: 'bower', bowerNew: null, asAdded: 'a.txt', origin: null, kind: 'other', pile: 'pile-folder', bowerItem: 'member-a', bowerDeclaration: 'decl-folder' } }, [1]);
  add({ kind: 'bin', before: seen('pile-folder-id', 'Receipts', 'inbox-folder', true), capturedChildIds: ['child-a', 'context-file'] }, [4]);
  const plan = (requires: number[], when: ReportContribution['when'], report: Partial<ReportContribution['value']>): ReportContribution => ({
    requires: requires.map((at) => ids[at] ?? ''), when, value: { filed: [], created: [], updated: [], setAside: [], questions: [], ...report },
  });
  value.reportPlan = [
    plan([0], 'applied', { filed: [{ name: 'receipt.txt', title: 'Receipt', kind: 'other', to: 'Areas/Home' }] }),
    plan([4, 2], 'applied', { filed: [{ name: 'a.txt', title: 'A', kind: 'other', to: 'Areas/Home/Receipts', note: 'Areas/Home/Receipts/Receipts note.md' }],
      created: [{ path: 'Areas/Home/Receipts/Receipts note.md', what: 'A short note' }], yourChanges: 1, requests: ['Tidy the receipts'], rulesWorded: 0 }),
    plan([3], 'applied', { updated: [{ path: '.bower/questions.json', what: 'One question' }],
      questions: [{ id: 'q-one', text: 'Keep it?', yes: 'Keep', no: 'Bin', askedAt: 1791194400002, about: 'a.txt' }] }),
    plan([5], 'rejected', { setAside: [{ name: 'Receipts', why: 'Something new arrived.' }] }),
  ];
  return value;
}
const variant = (change: (value: Manifest) => void): Manifest => { const value = rich(); change(value); return seal(value); };

const b5Table = (): unknown => ({ v: 1, rows: [{ id: 'lease', match: ['lease'], template: 'source',
  properties: { rent: { type: 'money' } }, table: ['rent'] }] });
function b5RunnerWrite(path: string, payload: unknown): Manifest {
  return variant((value) => {
    const text = JSON.stringify(payload);
    set(value, ['operations', 3, 'effect', 'path'], path);
    set(value, ['operations', 3, 'effect', 'text'], text);
    set(value, ['operations', 3, 'effect', 'content'], raw(text));
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    set(value, ['operations', 3, 'effect', 'before', 'name'], fileName);
  });
}

it('B5a contracts: versioned type table uses write-runner-json and rejects invalid new rows', async () => {
  expect(await parseRunManifestV2(bytes(rich()), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
  const value = b5RunnerWrite('.bower/type-table.json', b5Table());
  expect(op(value, 3).effect.kind).toBe('write-runner-json');
  expect(await parseRunManifestV2(bytes(value), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true, value });
  const invalid = b5RunnerWrite('.bower/type-table.json', { v: 1, rows: [{ id: 'Invalid slug' }] });
  expect((await parseRunManifestV2(bytes(invalid), 'fake-root', RUNNER_WRITES)).ok).toBe(false);
  expect((await parseRunManifestV2(bytes(b5RunnerWrite('.bower/arbitrary.json', b5Table())),
    'fake-root', RUNNER_WRITES)).ok).toBe(false);
});

it('B5a contracts: immutable proposal and stored question share one exact payload identity', async () => {
  expect(await parseRunManifestV2(bytes(rich()), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true });
  const payload = { kind: 'type-row', row: (b5Table() as { rows: unknown[] }).rows[0] };
  const proposal = { v: 1, id: 'lease-1', payload };
  const question = { id: 'q-proposal-lease-1', text: 'Add a lease type?', yes: 'Add', no: 'Keep as is', askedAt: 1,
    proposal: { id: 'lease-1', payload } };
  const value = variant((manifest) => {
    manifest.capture.places.push({ file: seen('proposals-dir', 'proposals', 'bower-system', true), path: '.bower/proposals' });
    const text = JSON.stringify(proposal);
    op(manifest, 3).effect = { kind: 'create-text', parent: { fileId: 'proposals-dir' }, name: 'lease-1.json',
      createKey: 'proposal-lease-1', text, content: raw(text), purpose: 'runner-json' };
    set(manifest, ['reportPlan', 2, 'value', 'questions'], [question]);
  });
  expect(await parseRunManifestV2(bytes(value), 'fake-root', RUNNER_WRITES)).toMatchObject({ ok: true, value });
  // The artifact is create-once, never an overwrite of a previously proposed payload.
  expect((await parseRunManifestV2(bytes(b5RunnerWrite('.bower/proposals/lease-1.json', proposal)),
    'fake-root', RUNNER_WRITES)).ok).toBe(false);
  const wrong = clone(value);
  set(wrong, ['reportPlan', 2, 'value', 'questions', 0, 'proposal', 'payload'],
    { kind: 'type-row', row: { id: 'different', table: [] } });
  expect((await parseRunManifestV2(bytes(seal(wrong)), 'fake-root', RUNNER_WRITES)).ok).toBe(false);
});

it('B5a contracts: old manifest fixtures read with their original hashes and operations', async () => {
  const value = manifest01();
  expect(await parseRunManifest(bytes(value), 'fake-root', RUNNER_WRITES)).toEqual({
    ok: true, value, sha256: manifest01Hash,
  });
  expect(await parseRunManifestV2(bytes(value), 'fake-root', RUNNER_WRITES)).toEqual({
    ok: true, value, sha256: manifest01Hash,
  });
  expect(value.captureId).toBe(capture01Id);
  expect(value.operations[0]?.operationId).toBe(operation01Id);
});

it('B5a contracts: old checkpoint fixture retains its run identity and operation outcome', async () => {
  const value = manifest01();
  expect((await parseRunManifest(bytes(value), 'fake-root', RUNNER_WRITES)).ok).toBe(true);
  const checkpoint = input('01-admission-reopen.json').checkpoint0;
  const result = await parseRunCheckpoint(bytes(checkpoint), {
    rootId: 'fake-root', runId: 'run-one', captureId: capture01Id,
    manifestHash: manifest01Hash, operationIds: [operation01Id],
  });
  expect(result).toEqual({ ok: true, value: checkpoint,
    sha256: '2331ffc91a81ef0c0cb90aed68fd9f70263205cf6b99a9c6c22d6e9d27af287b' });
});
function op(value: Manifest, index: number): Operation {
  const found = value.operations[index];
  if (!found) throw new Error('Synthetic manifest must contain this operation');
  return found;
}
function contribution(value: Manifest, index: number): ReportContribution {
  const found = value.reportPlan[index];
  if (!found) throw new Error('Synthetic manifest must contain this contribution');
  return found;
}

type Path = (string | number)[];
const at = (value: unknown, path: Path): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], value);
function set(value: unknown, path: Path, next: unknown): void {
  const parent = at(value, path.slice(0, -1)) as Record<string | number, unknown>;
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('A field path is required');
  parent[key] = next;
}
async function refuse(source: Uint8Array, reason: ManifestRefusal, root = 'fake-root'): Promise<void> {
  const before = source.slice();
  const result = await parseRunManifest(source, root, RUNNER_WRITES);
  expect(result).toEqual({ ok: false, reason });
  expect(result).not.toHaveProperty('value');
  expect(result).not.toHaveProperty('sha256');
  expect(source).toEqual(before);
}
async function accept(value: Manifest, root = value.scope.rootId): Promise<void> {
  const source = bytes(value);
  const before = source.slice();
  expect(await parseRunManifest(source, root, RUNNER_WRITES)).toEqual({ ok: true, value, sha256: H(value) });
  expect(source).toEqual(before);
}

const shapes: { label: string; path: Path; nullable?: string[]; optional?: string[] }[] = [
  { label: 'manifest', path: [] },
  { label: 'scope', path: ['scope'] },
  { label: 'capture', path: ['capture'] },
  { label: 'declared pile', path: ['capture', 'piles', 1], nullable: ['anchor'] },
  { label: 'declared source', path: ['capture', 'piles', 1, 'source'] },
  { label: 'declaration ref', path: ['capture', 'piles', 1, 'source', 'ref'] },
  { label: 'pile anchor', path: ['capture', 'piles', 1, 'anchor'] },
  { label: 'text context', path: ['capture', 'piles', 1, 'context'], nullable: ['memberKey'] },
  { label: 'context file', path: ['capture', 'piles', 1, 'context', 'file'] },
  { label: 'context content', path: ['capture', 'piles', 1, 'context', 'content'] },
  { label: 'absent context', path: ['capture', 'piles', 0, 'context'] },
  { label: 'observed source', path: ['capture', 'piles', 2, 'source'] },
  { label: 'member', path: ['capture', 'members', 1], nullable: ['memberKey'] },
  { label: 'member file', path: ['capture', 'members', 1, 'file'] },
  { label: 'member content', path: ['capture', 'members', 1, 'content'] },
  { label: 'journal', path: ['capture', 'journal', 0] },
  { label: 'place', path: ['capture', 'places', 0] },
  { label: 'place file', path: ['capture', 'places', 0, 'file'] },
  { label: 'operation', path: ['operations', 0] },
  { label: 'move', path: ['operations', 0, 'effect'] },
  { label: 'move before', path: ['operations', 0, 'effect', 'before'] },
  { label: 'file target', path: ['operations', 0, 'effect', 'parent'] },
  { label: 'short properties', path: ['operations', 0, 'effect', 'properties'], nullable: ['bowerNew'], optional: ['bowerNew'] },
  { label: 'full properties', path: ['operations', 4, 'effect', 'properties'],
    nullable: ['bowerNew', 'asAdded', 'origin', 'kind', 'pile', 'bowerItem', 'bowerDeclaration'],
    optional: ['by', 'bowerNew', 'asAdded', 'origin', 'kind', 'pile', 'bowerItem', 'bowerDeclaration'] },
  { label: 'create-folder', path: ['operations', 1, 'effect'] },
  { label: 'create-text', path: ['operations', 2, 'effect'] },
  { label: 'created target', path: ['operations', 2, 'effect', 'parent'] },
  { label: 'create content', path: ['operations', 2, 'effect', 'content'] },
  { label: 'write-runner-json', path: ['operations', 3, 'effect'] },
  { label: 'write before', path: ['operations', 3, 'effect', 'before'] },
  { label: 'write before content', path: ['operations', 3, 'effect', 'beforeContent'] },
  { label: 'write content', path: ['operations', 3, 'effect', 'content'] },
  { label: 'bin', path: ['operations', 5, 'effect'] },
  { label: 'contribution', path: ['reportPlan', 1] },
  { label: 'report', path: ['reportPlan', 1, 'value'], optional: ['yourChanges', 'requests', 'rulesWorded'] },
  { label: 'filed row', path: ['reportPlan', 1, 'value', 'filed', 0], optional: ['note'] },
  { label: 'created row', path: ['reportPlan', 1, 'value', 'created', 0] },
  { label: 'updated row', path: ['reportPlan', 2, 'value', 'updated', 0] },
  { label: 'question', path: ['reportPlan', 2, 'value', 'questions', 0], optional: ['about'] },
  { label: 'set-aside row', path: ['reportPlan', 3, 'value', 'setAside', 0] },
];

describe('run manifests fix capture and operation identity', () => {
  it('checks the independent test oracle against the literal fixture digests first', () => {
    const one = manifest01();
    expect(H(one)).toBe(manifest01Hash);
    expect(H({ scope: one.scope, runScope: one.runScope, capture: one.capture })).toBe(capture01Id);
    const four = input('04-report-publication-retry.json');
    expect(four.manifestHash).toBe(manifest04Hash);
    expect(H(four.manifest)).toBe(manifest04Hash);
  });

  it.each([
    ['01-admission-reopen.json', (): unknown => input('01-admission-reopen.json').manifest, manifest01Hash, capture01Id, operation01Id, 1],
    ['04-report-publication-retry.json', (): unknown => input('04-report-publication-retry.json').manifest, manifest04Hash, capture04Id, operation04First, 15],
    ['05-invalid-new-records.json canonical copy', (): unknown => cases05()[0]?.record, manifest01Hash, capture01Id, operation01Id, 1],
    ['05-invalid-new-records.json conflicting original', (): unknown => cases05()[1]?.original, manifest01Hash, capture01Id, operation01Id, 1],
  ] as const)('parses the manifest portion of %s with its literal identities', async (_label, take, hash, captureId, firstOperation, count) => {
    const portion = take();
    const source = utf8(` \r\n${JSON.stringify(portion, null, 2)}\t`);
    const before = source.slice();
    const result = await parseRunManifest(source, 'fake-root', RUNNER_WRITES);
    expect(result).toEqual({ ok: true, value: portion, sha256: hash });
    if (result.ok) {
      expect(result.value.captureId).toBe(captureId);
      expect(result.value.operations).toHaveLength(count);
      expect(result.value.operations[0]?.operationId).toBe(firstOperation);
    }
    expect(source).toEqual(before);
    // Admission, claim, dispatch, publication and recovery events in these fixtures are not executed.
  });

  it('validates each conflicting same-run copy alone without claiming discovery conflict resolution', async () => {
    const original = cases05()[1]?.original as Manifest;
    const changed = clone(original); changed.allowWeb = true;
    expect(H(changed)).not.toBe(manifest01Hash);
    await accept(changed);
  });

  it.each([
    ['unsupported version', (): Uint8Array => bytes(cases05()[2]?.record), 'shape'],
    ['corrupt JSON', (): Uint8Array => utf8(String(cases05()[3]?.exactStoredText)), 'syntax'],
    ['duplicate JSON key', (): Uint8Array => utf8(String(cases05()[4]?.exactStoredText)), 'duplicate-key'],
    ['checkpoint record', (): Uint8Array => bytes(cases05()[6]?.record), 'shape'],
    ['declaration record', (): Uint8Array => bytes(input('01-admission-reopen.json').declaration), 'shape'],
    ['control row', (): Uint8Array => bytes(input('01-admission-reopen.json').control), 'shape'],
  ] as const)('refuses fixture %s', async (_label, source, reason) => { await refuse(source(), reason); });

  it('accepts a synthetic manifest with every effect, target and report field, preserving text bytes', async () => {
    const value = rich();
    await accept(value);
    const result = await parseRunManifest(bytes(value), 'fake-root', RUNNER_WRITES);
    if (!result.ok) throw new Error('Synthetic manifest must parse');
    const text = result.value.operations[2]?.effect;
    expect(text).toMatchObject({ kind: 'create-text', text: 'Receipts\r\n é ' });
    expect(result.value.capture.piles[1]?.context).toMatchObject({ kind: 'text', text: ' Edited\r\n é😀  ' });
  });
  it('accepts an empty capture with no operations or report plan', async () => {
    await accept(variant((value) => { value.capture = { piles: [], members: [], journal: [], places: [] }; value.operations = []; value.reportPlan = []; }));
  });

  for (const { label, path, nullable = [], optional = [] } of shapes) {
    const fields = Object.keys(at(rich(), path) as object);
    for (const field of fields) {
      it.each(['missing', 'null', 'wrong type'])('handles %s ' + label + '.' + field, async (mode) => {
        const value = rich();
        const node = at(value, path) as Record<string, unknown>;
        if (mode === 'missing') {
          Reflect.deleteProperty(node, field);
          if (optional.includes(field)) { await accept(seal(value)); return; }
        } else if (mode === 'null') {
          node[field] = null;
          if (nullable.includes(field)) { await accept(seal(value)); return; }
        } else node[field] = typeof node[field] === 'number' ? '1' : 7;
        await refuse(bytes(value), 'shape');
      });
    }
    it.each(['extra', '__proto__', 'constructor'])('refuses unknown %s on ' + label, async (key) => {
      const value = rich();
      Object.defineProperty(at(value, path), key, { value: true, enumerable: true });
      await refuse(bytes(value), 'shape');
    });
    it('refuses array in place of ' + label, async () => {
      if (path.length === 0) { await refuse(bytes([]), 'shape'); return; }
      const value = rich(); set(value, path, []); await refuse(bytes(value), 'shape');
    });
  }

  it.each([
    [['v'], 0], [['v'], 2], [['kind'], 'run-checkpoint'], [['kind'], 'pile-declaration'], [['runScope'], 'inbox'],
    [['capture', 'piles', 1, 'source', 'kind'], 'external'], [['capture', 'piles', 0, 'context', 'kind'], 'empty'],
    [['capture', 'piles', 1, 'context', 'kind'], 'absent'], [['capture', 'piles', 2, 'source', 'kind'], 'declared'],
    [['capture', 'members', 1, 'content', 'encoding'], 'base64'], [['capture', 'members', 1, 'content', 'provenance'], 'metadata'],
    [['operations', 0, 'effect', 'kind'], 'rename'], [['operations', 0, 'effect', 'kind'], 'bin'], [['operations', 1, 'effect', 'kind'], 'create-text'],
    [['operations', 2, 'effect', 'purpose'], 'note'], [['operations', 3, 'effect', 'path'], '.bower/last-run.json'],
    [['operations', 3, 'effect', 'path'], 'questions.json'], [['operations', 4, 'effect', 'properties', 'by'], 'person'],
    [['operations', 4, 'effect', 'properties', 'bowerNew'], '0'], [['operations', 4, 'effect', 'properties', 'bowerNew'], 1],
    [['operations', 0, 'effect', 'parent'], { fileId: 'areas-home', createdBy: digest('a') }], [['operations', 0, 'effect', 'parent'], {}],
    [['reportPlan', 1, 'when'], 'unresolved'], [['reportPlan', 1, 'value', 'filed', 0, 'kind'], 'folder'],
  ] as [Path, unknown][])('refuses unsupported version, kind or enum at %j = %j', async (path, next) => {
    const value = rich(); set(value, path, next); await refuse(bytes(value), 'shape');
  });

  it.each([
    ['instructions scope', (value: Manifest): void => { value.runScope = 'instructions'; }],
    ['web allowed', (value: Manifest): void => { value.allowWeb = true; }],
    ['adapter-read provenance', (value: Manifest): void => { set(value, ['capture', 'members', 0, 'content', 'provenance'], 'adapter-read'); }],
    // Was 'blob create content'; create-text content is now utf8 only (Unit G), refused in the consistency suite.
    ['blob member content', (value: Manifest): void => { set(value, ['capture', 'members', 0, 'content', 'encoding'], 'blob'); }],
    ['runner-json purpose', (value: Manifest): void => { set(value, ['operations', 2, 'effect', 'purpose'], 'runner-json'); }],
    ['requests.json write', (value: Manifest): void => { set(value, ['operations', 3, 'effect', 'path'], '.bower/requests.json'); }],
    ['hashes.json write', (value: Manifest): void => { set(value, ['operations', 3, 'effect', 'path'], '.bower/hashes.json'); }],
    ['empty properties', (value: Manifest): void => { set(value, ['operations', 0, 'effect', 'properties'], {}); }],
    ['rejected contribution with no rows', (value: Manifest): void => { set(value, ['reportPlan', 3, 'value', 'setAside'], []); }],
    ['pile without members', (value: Manifest): void => { set(value, ['capture', 'piles', 2, 'memberKeys'], []); }],
    ['folder pile parented elsewhere', (value: Manifest): void => { set(value, ['capture', 'piles', 1, 'anchor', 'parents'], ['inbox-folder', 'second-parent']); }],
    ...(['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] as const).map((kind) => [
      `filed kind ${kind}`, (value: Manifest): void => { set(value, ['reportPlan', 1, 'value', 'filed', 0, 'kind'], kind); }] as const),
  ] as const)('accepts supported variant: %s', async (_label, change) => { await accept(variant(change)); });

  const idPaths: Path[] = [['runId'], ['requestId'], ['capture', 'piles', 1, 'pileId'], ['capture', 'piles', 1, 'source', 'ref', 'declarationId'],
    ['capture', 'piles', 1, 'memberKeys', 0], ['capture', 'piles', 1, 'context', 'memberKey'], ['capture', 'members', 1, 'pileId'],
    ['capture', 'members', 1, 'memberKey'], ['operations', 1, 'effect', 'createKey'], ['operations', 2, 'effect', 'createKey'],
    ['operations', 4, 'effect', 'properties', 'pile'], ['operations', 4, 'effect', 'properties', 'bowerItem'],
    ['operations', 4, 'effect', 'properties', 'bowerDeclaration']];
  // Both ends of one capture identity; a boundary rename keeps the other end equal (Unit G member keys).
  const linked: Record<string, Path[]> = {
    'capture.piles.1.pileId': [['capture', 'members', 1, 'pileId']], 'capture.members.1.pileId': [['capture', 'piles', 1, 'pileId']],
    'capture.piles.1.memberKeys.0': [['capture', 'members', 1, 'memberKey']], 'capture.members.1.memberKey': [['capture', 'piles', 1, 'memberKeys', 0]],
  };
  for (const path of idPaths) {
    it.each(['', 'x'.repeat(129), 'a b', 'a/b', 'é', 'a.', 'a\n', '\u0000'])('refuses invalid logical ID %j at ' + path.join('.'), async (id) => {
      const value = rich(); set(value, path, id); await refuse(bytes(value), 'shape');
    });
    it.each(['Z', 'A_0-z'.repeat(25) + 'xyz'])('accepts logical ID boundary %s at ' + path.join('.'), async (id) => {
      await accept(variant((value) => { for (const end of [path, ...linked[path.join('.')] ?? []]) set(value, end, id); }));
    });
  }

  const driveIdPaths: Path[] = [['scope', 'rootId'], ['capture', 'members', 1, 'file', 'fileId'], ['capture', 'members', 1, 'file', 'parents', 0],
    ['capture', 'piles', 1, 'childFileIds', 0], ['capture', 'journal', 0, 'fileIds', 0], ['operations', 0, 'effect', 'parent', 'fileId'],
    ['operations', 5, 'effect', 'capturedChildIds', 0], ['capture', 'places', 0, 'file', 'parents', 0]];
  for (const path of driveIdPaths) {
    it.each(['', 'a\n', 'a\u0000', '\u007f', '😀'.repeat(257)])('refuses opaque Drive ID %j at ' + path.join('.'), async (id) => {
      const value = rich(); set(value, path, id); await refuse(bytes(value), 'shape', value.scope.rootId);
    });
    it.each(['opaque:/+ space.é', '\u0080\u009f', '😀'.repeat(256), 'x'.repeat(1024)])('accepts opaque Drive ID punctuation/UTF8 boundary at ' + path.join('.'), async (id) => {
      await accept(variant((value) => { set(value, path, id); }));
    });
  }

  const namePaths: Path[] = [['capture', 'members', 1, 'file', 'name'], ['capture', 'piles', 1, 'anchor', 'name'], ['operations', 0, 'effect', 'name'],
    ['operations', 1, 'effect', 'name'], ['operations', 2, 'effect', 'name'], ['operations', 5, 'effect', 'before', 'name']];
  for (const path of namePaths) {
    it.each(['', '.', '..', '/x', 'x/', 'x/y', 'x\\y', '\u0000', '\r', '\u007f'])('refuses noncomponent name %j at ' + path.join('.'), async (name) => {
      const value = rich(); set(value, path, name); await refuse(bytes(value), 'shape');
    });
    it.each(['.hidden', ' a  ', 'é😀.txt', 'a:b', '\u0080\u009f', '...'])('keeps valid name %j at ' + path.join('.'), async (name) => {
      await accept(variant((value) => { set(value, path, name); }));
    });
  }

  it.each(['', '/Areas', 'Areas/', 'Areas//Home', './Areas', 'Areas/./Home', 'Areas/../Home', '..', 'Areas\\Home', 'Areas/\u0000', 'Areas/\n'])('refuses invalid place path %j', async (path) => {
    const value = rich(); set(value, ['capture', 'places', 1, 'path'], path); await refuse(bytes(value), 'shape');
  });
  it.each(['Areas', 'Areas/Home é/😀 x', '.bower/runs', '.../a.b', ' a /b '])('keeps valid place path %j', async (path) => {
    await accept(variant((value) => { set(value, ['capture', 'places', 1, 'path'], path); }));
  });

  const timePaths: Path[] = [['capture', 'members', 1, 'file', 'modifiedTime'], ['capture', 'members', 1, 'content', 'observedModifiedTime'],
    ['operations', 3, 'effect', 'beforeContent', 'observedModifiedTime'], ['operations', 5, 'effect', 'before', 'modifiedTime']];
  for (const path of timePaths) {
    it.each(['', 'yesterday', '2026-10-05', '2026-10-05T10:00:00', '2026-13-01T00:00:00Z', '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
      '2026-10-05T24:00:00Z', '2026-10-05T10:60:00Z', '2026-10-05T10:00:61Z', '2026-10-05T10:00:00+2:00', '2026-10-05T10:00:00+24:00',
      '2026-10-05T10:00:00.Z', ' 2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z\n', '１２３４-10-05T10:00:00Z',
      '2026-10-05T10:00:60Z', '2026-10-30T23:59:60Z', '2026-10-31T23:58:60Z', '2026-10-31T23:59:60+01:00', '2024-02-29T23:59:60.123456789+05:30'])('refuses non-RFC3339 time %j at ' + path.join('.'), async (stamp) => {
      const value = rich(); set(value, path, stamp); await refuse(bytes(value), 'shape');
    });
    it.each(['2026-10-05T10:00:00Z', '2016-12-31T23:59:60.123456789Z', '2017-01-01T05:29:60+05:30', '2024-02-29T15:59:60-08:00',
      '2026-10-05t10:00:00z', '0000-01-01T00:00:00-23:59'])('keeps RFC3339 time %j at ' + path.join('.'), async (stamp) => {
      await accept(variant((value) => { set(value, path, stamp); }));
    });
  }

  const hashPaths: Path[] = [['captureId'], ['operations', 0, 'operationId'], ['operations', 2, 'dependsOn', 0], ['operations', 2, 'effect', 'parent', 'createdBy'],
    ['reportPlan', 0, 'requires', 0], ['capture', 'piles', 1, 'source', 'ref', 'sha256'], ['capture', 'members', 1, 'content', 'sha256'],
    ['capture', 'journal', 0, 'sha256'], ['operations', 2, 'effect', 'content', 'sha256']];
  for (const path of hashPaths) {
    it.each(['', 'f'.repeat(63), 'f'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ' '.repeat(64)])('refuses invalid digest %j at ' + path.join('.'), async (value) => {
      const manifest = rich(); set(manifest, path, value); await refuse(bytes(manifest), 'shape');
    });
  }

  for (const path of [['requestedAt'], ['operations', 1, 'ordinal'], ['capture', 'members', 1, 'content', 'size'], ['operations', 2, 'effect', 'content', 'size'],
    ['reportPlan', 2, 'value', 'questions', 0, 'askedAt'], ['reportPlan', 1, 'value', 'yourChanges'], ['reportPlan', 1, 'value', 'rulesWorded']] satisfies Path[]) {
    it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses unsafe integer %s at ' + path.join('.'), async (number) => {
      const value = rich(); set(value, path, number); await refuse(bytes(value), 'number');
    });
  }
  it('accepts nonnegative safe integer boundaries', async () => {
    await accept(variant((value) => { value.requestedAt = 0; set(value, ['capture', 'members', 1, 'content', 'size'], Number.MAX_SAFE_INTEGER); }));
    await accept(variant((value) => { value.requestedAt = Number.MAX_SAFE_INTEGER; set(value, ['reportPlan', 1, 'value', 'yourChanges'], Number.MAX_SAFE_INTEGER); }));
  });

  it.each([
    ['file parents', ['capture', 'members', 1, 'file', 'parents'], ['pile-folder-id', 'pile-folder-id']],
    ['pile child IDs', ['capture', 'piles', 1, 'childFileIds'], ['child-a', 'child-a']],
    ['pile member keys', ['capture', 'piles', 1, 'memberKeys'], ['member-a', null, 'member-a']],
    ['journal file IDs', ['capture', 'journal', 0, 'fileIds'], ['journal-file', 'journal-file']],
    ['bin captured children', ['operations', 5, 'effect', 'capturedChildIds'], ['child-a', 'child-a']],
    ['empty parents', ['capture', 'members', 1, 'file', 'parents'], []],
    ['empty journal file IDs', ['capture', 'journal', 0, 'fileIds'], []],
  ] as [string, Path, unknown][])('refuses duplicate or empty identity array: %s', async (_label, path, next) => {
    const value = rich(); set(value, path, next); await refuse(bytes(value), 'shape');
  });
  it('refuses duplicate dependsOn and requires entries', async () => {
    const depends = rich(); const two = op(depends, 2); two.dependsOn = [op(depends, 1).operationId, op(depends, 1).operationId];
    await refuse(bytes(depends), 'shape');
    const requires = rich(); contribution(requires, 1).requires = [op(requires, 4).operationId, op(requires, 4).operationId];
    await refuse(bytes(requires), 'shape');
    const none = rich(); contribution(none, 1).requires = [];
    await refuse(bytes(none), 'shape');
  });
  it('keeps repeated null member keys for observed piles and empty optional identity arrays', async () => {
    await accept(variant((value) => { set(value, ['capture', 'piles', 2, 'memberKeys'], [null, null, null]); set(value, ['operations', 5, 'effect', 'capturedChildIds'], []); }));
  });

  it.each(['2026-10-05T10-00-00.000Z-abc123', 'legacy id: a/b c.é', '😀', '\u0080\u009f', 'x'.repeat(1024), 'é'.repeat(512), '😀'.repeat(256)])('keeps opaque legacy journal record ID %j up to 1024 UTF-8 bytes', async (recordId) => {
    await accept(variant((value) => { set(value, ['capture', 'journal', 0, 'recordId'], recordId); }));
  });
  it.each([
    ['empty', ''],
    ['a newline', 'a\n'],
    ['a null', '\u0000'],
    ['a delete character', 'a\u007f'],
    ['1025 ASCII bytes', 'x'.repeat(1025)],
    ['1025 bytes of two-byte letters', 'é'.repeat(512) + 'x'],
    ['1025 bytes of four-byte emoji', '😀'.repeat(256) + 'x'],
    ['a megabyte', 'x'.repeat(1024 * 1024)],
  ])('refuses empty, control or over-1024-byte journal record ID: %s', async (_what, recordId) => {
    await refuse(bytes(variant((value) => { set(value, ['capture', 'journal', 0, 'recordId'], recordId); })), 'shape');
  });

  it.each([
    ['identical pile copy', (value: Manifest): void => { value.capture.piles.push(...value.capture.piles.slice(1, 2).map(clone)); }],
    ['conflicting piles sharing a pileId', (value: Manifest): void => { set(value, ['capture', 'piles', 2, 'pileId'], 'pile-folder'); }],
    ['identical member copy', (value: Manifest): void => { value.capture.members.push(...value.capture.members.slice(1, 2).map(clone)); }],
    ['conflicting members sharing a file ID', (value: Manifest): void => { set(value, ['capture', 'members', 0, 'file', 'fileId'], 'child-a'); }],
    ['identical place copy', (value: Manifest): void => { value.capture.places.push(...value.capture.places.slice(1, 2).map(clone)); }],
    ['conflicting places sharing a file ID', (value: Manifest): void => { set(value, ['capture', 'places', 1, 'file', 'fileId'], 'areas-folder'); }],
    ['identical journal copy', (value: Manifest): void => { value.capture.journal.push(...value.capture.journal.slice(0, 1).map(clone)); }],
    ['conflicting journal entries sharing a record ID', (value: Manifest): void => {
      value.capture.journal.push({ recordId: '2026-10-05T10-00-00.000Z-abc123', sha256: digest('9'), fileIds: ['journal-file-2'] });
    }],
  ] as const)('refuses duplicate capture identity with resealed identities: %s', async (_label, change) => {
    const value = variant(change);
    expect(value.captureId).toBe(H({ scope: value.scope, runScope: value.runScope, capture: value.capture }));
    await refuse(bytes(value), 'shape');
  });
  it('keeps distinct capture identities that share names, parents or content', async () => {
    await accept(variant((value) => {
      value.capture.journal.push({ recordId: '2026-10-05T10-00-00.000Z-abc124', sha256: digest('e'), fileIds: ['journal-file'] });
      value.capture.places.push({ file: seen('areas-home-2', 'Home', 'areas-folder', true), path: 'Areas/Home' });
    }));
  });

  it.each([
    ['captureId of another valid digest', (value: Manifest): void => { value.captureId = digest('a'); }],
    ['captureId over capture alone', (value: Manifest): void => { value.captureId = H({ capture: value.capture }); }],
    ['captureId including runId', (value: Manifest): void => { value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture, runId: value.runId }); }],
    ['capture changed after identity', (value: Manifest): void => { set(value, ['capture', 'members', 0, 'file', 'name'], 'other.txt'); }],
    ['run scope changed after identity', (value: Manifest): void => { value.runScope = 'instructions'; }],
  ] as const)('refuses capture identity mismatch: %s', async (_label, change) => {
    const value = rich(); change(value); await refuse(bytes(value), 'capture-id');
  });
  it('refuses scope change after identity with a matching expected root', async () => {
    const value = rich(); value.scope.rootId = 'other-root'; await refuse(bytes(value), 'capture-id', 'other-root');
  });

  it.each([
    ['operationId of another valid digest', (value: Manifest): void => { op(value, 0).operationId = digest('a'); }],
    ['operationId including dependsOn', (value: Manifest): void => {
      const two = op(value, 2); two.operationId = H({ runId: value.runId, captureId: value.captureId, ordinal: two.ordinal, effect: two.effect, dependsOn: two.dependsOn });
    }],
    ['operationId without runId', (value: Manifest): void => {
      const zero = op(value, 0); zero.operationId = H({ captureId: value.captureId, ordinal: zero.ordinal, effect: zero.effect });
    }],
    ['effect changed after identity', (value: Manifest): void => { set(value, ['operations', 0, 'effect', 'name'], 'Other.txt'); }],
    ['run changed after identity', (value: Manifest): void => { value.runId = 'run-two'; }],
  ] as const)('refuses operation identity mismatch: %s', async (_label, change) => {
    const value = rich(); change(value); await refuse(bytes(value), 'operation-id');
  });
  it.each([
    ['request', (value: Manifest): void => { value.requestId = 'request-two'; }],
    ['requested time', (value: Manifest): void => { value.requestedAt = 1; }],
    ['dependency list', (value: Manifest): void => { op(value, 3).dependsOn = [op(value, 0).operationId]; }],
    ['report wording', (value: Manifest): void => { set(value, ['reportPlan', 0, 'value', 'filed', 0, 'title'], 'Other receipt'); }],
  ] as const)('keeps identities when only non-identity input changes: %s', async (_label, change) => {
    const value = rich(); change(value); await accept(value);
  });

  it.each([
    ['ordinals starting at one', (value: Manifest): void => { value.operations.forEach((item, index) => { item.ordinal = index + 1; }); }],
    ['ordinal gap', (value: Manifest): void => { op(value, 5).ordinal = 6; }],
    ['duplicate ordinal', (value: Manifest): void => { op(value, 5).ordinal = 4; }],
    ['operations out of order', (value: Manifest): void => { const [a, b] = [op(value, 0), op(value, 1)]; value.operations[0] = b; value.operations[1] = a; }],
  ] as const)('refuses non-consecutive ordinals: %s', async (_label, change) => {
    await refuse(bytes(variant(change)), 'order');
  });
  it('refuses swapped operations even when each keeps its own valid identity', async () => {
    const value = rich(); const [a, b] = [op(value, 0), op(value, 3)]; value.operations[0] = b; value.operations[3] = a;
    await refuse(bytes(value), 'order');
  });

  it.each([
    ['self dependency', (value: Manifest): void => { op(value, 3).dependsOn = [op(value, 3).operationId]; }],
    ['later dependency', (value: Manifest): void => { op(value, 3).dependsOn = [op(value, 4).operationId]; }],
    ['unknown dependency', (value: Manifest): void => { op(value, 3).dependsOn = [digest('e')]; }],
    ['one unknown among earlier dependencies', (value: Manifest): void => { op(value, 5).dependsOn = [op(value, 4).operationId, digest('e')]; }],
  ] as const)('refuses dependsOn that does not resolve to an earlier operation: %s', async (_label, change) => {
    const value = rich(); change(value); await refuse(bytes(value), 'order');
  });
  it('refuses createdBy that names a later operation', async () => {
    const value = rich(); op(value, 0).effect = { ...op(value, 0).effect, parent: { createdBy: op(value, 1).operationId } } as Operation['effect'];
    await refuse(bytes(seal(value)), 'order');
  });
  it('refuses createdBy that names no operation in this manifest', async () => {
    await refuse(bytes(variant((value) => { set(value, ['operations', 2, 'effect', 'parent'], { createdBy: digest('e') }); })), 'order');
  });
  it('accepts dependsOn naming several earlier operations', async () => {
    await accept(variant((value) => { op(value, 5).dependsOn = [op(value, 0).operationId, op(value, 2).operationId, op(value, 4).operationId]; }));
  });

  it.each([
    ['unknown operation', (value: Manifest): void => { contribution(value, 0).requires = [digest('e')]; }],
    ['one unknown among known operations', (value: Manifest): void => { contribution(value, 1).requires = [op(value, 4).operationId, digest('e')]; }],
    ['duplicate question in one contribution', (value: Manifest): void => {
      const report = contribution(value, 2).value; const [question] = report.questions;
      if (question) report.questions.push({ ...question, text: 'Another?' });
    }],
    ['identical question across contributions', (value: Manifest): void => {
      const [question] = contribution(value, 2).value.questions;
      if (question) contribution(value, 1).value.questions.push({ ...question });
    }],
  ] as const)('refuses report plan that is not structurally grounded: %s', async (_label, change) => {
    const value = rich(); change(value); await refuse(bytes(value), 'report');
  });
  it('keeps distinct question IDs that differ only by case and contributions sharing operations', async () => {
    await accept(variant((value) => {
      const [question] = contribution(value, 2).value.questions;
      if (question) contribution(value, 1).value.questions.push({ ...question, id: 'Q-one' });
      contribution(value, 3).requires = [op(value, 3).operationId, op(value, 5).operationId];
    }));
  });

  it.each(['other-root', '', '😀'.repeat(257), '\uD800', 'fake-root\n'])('refuses independently supplied mismatched or invalid expected root %j', async (root) => {
    await refuse(bytes(rich()), 'scope', root);
  });
  it('accepts a matching expected root that is not the default', async () => {
    await accept(variant((value) => { value.scope.rootId = 'other-root'; }), 'other-root');
  });

  it.each([['runId'], ['capture', 'piles', 1, 'context', 'text'], ['capture', 'journal', 0, 'recordId'], ['operations', 2, 'effect', 'text'],
    ['reportPlan', 1, 'value', 'requests', 0], ['reportPlan', 0, 'value', 'filed', 0, 'title'], ['operations', 4, 'effect', 'properties', 'asAdded']] satisfies Path[])('refuses invalid Unicode at %j', async (...path) => {
    const value = rich(); set(value, path, 'a\uD800'); await refuse(bytes(value), 'unicode');
  });
  it('refuses decoded duplicate JSON keys inside nested records', async () => {
    const source = JSON.stringify(rich()).replace('"bowerNew":"1"', '"bowerNew":"1","bower\\u004eew":"1"');
    await refuse(utf8(source), 'duplicate-key');
  });
  it.each([[0xff], [0xed, 0xa0, 0x80], [0xc0, 0xaf]])('refuses invalid source UTF8 %j', async (...literal) => { await refuse(Uint8Array.from(literal), 'encoding'); });
  it.each([['', 'syntax'], ['{}', 'shape'], ['null', 'shape'], ['[]', 'shape'], ['{"v":1,"kind":"run-manifest"}', 'shape'], ['{}x', 'syntax']] as const)('refuses malformed or partial source %j', async (text, reason) => {
    await refuse(utf8(text), reason);
  });

  it('uses only the supplied byte view and returns independent values on every parse', async () => {
    const source = bytes(rich());
    const all = Uint8Array.from([0xff, ...source, 0xff]);
    const before = all.slice();
    const one = await parseRunManifest(all.subarray(1, -1), 'fake-root', RUNNER_WRITES);
    const two = await parseRunManifest(all.subarray(1, -1), 'fake-root', RUNNER_WRITES);
    if (!one.ok || !two.ok) throw new Error('Synthetic manifest must parse');
    one.value.runId = 'changed';
    one.value.capture.piles.length = 0;
    expect(two.value).toEqual(rich());
    expect(all).toEqual(before);
    expect(await parseRunManifest(source, 'fake-root', RUNNER_WRITES)).toEqual(two);
  });
  it('propagates unexpected platform hash errors and leaves source bytes intact', async () => {
    const source = bytes(rich()); const before = source.slice();
    const failure = new Error('Synthetic platform hash failure');
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(failure);
    try { await expect(parseRunManifest(source, 'fake-root', RUNNER_WRITES)).rejects.toBe(failure); }
    finally { spy.mockRestore(); }
    expect(source).toEqual(before);
  });
});

// Unit G (guard 6 and the effect shapes): text against its content, observed piles, member keys, createdBy targets.
const textSites: { label: string; text: Path; content: Path }[] = [
  { label: 'captured context', text: ['capture', 'piles', 1, 'context', 'text'], content: ['capture', 'piles', 1, 'context', 'content'] },
  { label: 'create-text', text: ['operations', 2, 'effect', 'text'], content: ['operations', 2, 'effect', 'content'] },
  { label: 'write-runner-json', text: ['operations', 3, 'effect', 'text'], content: ['operations', 3, 'effect', 'content'] },
];
/**
 * Replace a site's text and give its content the exact raw description of that text, then apply only the
 * given overrides, so a size override keeps the right digest and a digest override keeps the right size.
 * Verified provenance fields stay.
 */
function write(value: Manifest, site: (typeof textSites)[number], text: string, content: Partial<Content> = {}): void {
  set(value, site.text, text);
  Object.assign(at(value, site.content) as Content, raw(text), content);
}
/** Append an operation with a distinct placeholder identity; seal() gives it its real one and renames references. */
function append(value: Manifest, effect: Operation['effect']): void {
  const ordinal = value.operations.length;
  value.operations.push({ operationId: H({ placeholder: ordinal }), ordinal, dependsOn: [], effect });
}

describe('run manifests keep captured and written text consistent', () => {
  it('checks the independent raw-content oracle against literal SHA-256 vectors first', () => {
    expect(raw('')).toEqual({ encoding: 'utf8', size: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
    expect(raw('abc')).toEqual({ encoding: 'utf8', size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
    expect(raw('é😀').size).toBe(6);
    expect(raw('x').sha256).not.toBe(H('x'));
  });

  for (const site of textSites) {
    const other = 'é😀\r\n';
    it.each([
      ['text edited after its content was taken', (value: Manifest): void => { set(value, site.text, `${String(at(value, site.text))}x`); }],
      ['size one byte larger', (value: Manifest): void => { write(value, site, other, { size: raw(other).size + 1 }); }],
      ['size one byte smaller', (value: Manifest): void => { write(value, site, other, { size: raw(other).size - 1 }); }],
      ['size counted in UTF-16 code units', (value: Manifest): void => { write(value, site, other, { size: other.length }); }],
      ['digest of other text', (value: Manifest): void => { write(value, site, other, { sha256: raw(`${other}x`).sha256 }); }],
      ['digest of the canonical JSON string', (value: Manifest): void => { write(value, site, other, { sha256: H(other) }); }],
      ['content of the trimmed text', (value: Manifest): void => { write(value, site, ' a\r\n', raw('a')); }],
      ['content of the NFD-normalized text', (value: Manifest): void => { write(value, site, 'é', raw('é'.normalize('NFD'))); }],
      ['content of CRLF turned into LF', (value: Manifest): void => { write(value, site, 'a\r\nb', raw('a\nb')); }],
      ['empty text with nonempty content', (value: Manifest): void => { write(value, site, '', raw(' ')); }],
      ['text with the content of empty text', (value: Manifest): void => { write(value, site, ' ', raw('')); }],
      ['blob encoding over the exact bytes', (value: Manifest): void => { write(value, site, other, { encoding: 'blob' }); }],
      ['same-size digest of other bytes (Receiptz for Receipts)', (value: Manifest): void => { write(value, site, 'Receipts', { sha256: raw('Receiptz').sha256 }); }],
      ['same-size digest of other bytes ({} for [])', (value: Manifest): void => { write(value, site, '{}\n', { sha256: raw('[]\n').sha256 }); }],
      ['text edited in place keeping its size', (value: Manifest): void => {
        const before = String(at(value, site.text)); set(value, site.text, `${before.slice(0, -1)}x`);
      }],
    ] as const)(`refuses ${site.label} whose content does not describe its text, with resealed identities: %s`, async (_label, change) => {
      const value = variant(change);
      expect(value.captureId).toBe(H({ scope: value.scope, runScope: value.runScope, capture: value.capture }));
      expect(value.operations.map((item) => item.operationId)).toEqual(value.operations.map((item) =>
        H({ runId: value.runId, captureId: value.captureId, ordinal: item.ordinal, effect: item.effect })));
      await refuse(bytes(value), 'content');
    });
    it.each(['', ' ', 'a\r\nb\r', ' é😀\t\u0085  ', 'é'.normalize('NFD'), '{"a":[1,2]}\n', 'x'.repeat(4096)])(
      `accepts ${site.label} text %j with the exact UTF-8 size and raw digest, preserving its bytes`, async (text) => {
        const value = variant((change) => { write(change, site, text); });
        await accept(value);
        const result = await parseRunManifest(bytes(value), 'fake-root', RUNNER_WRITES);
        expect(result.ok && at(result.value, site.text)).toBe(text);
      });
  }
  it('refuses inconsistent content even when the identities were not resealed', async () => {
    const value = rich(); set(value, ['operations', 2, 'effect', 'content', 'size'], raw(noteText).size + 1);
    await refuse(bytes(value), 'content');
  });

  it.each([
    ['observed pile with a member key', (value: Manifest): void => { set(value, ['capture', 'piles', 2, 'memberKeys'], ['legacy-key']); }],
    ['observed pile with one key among nulls', (value: Manifest): void => { set(value, ['capture', 'piles', 2, 'memberKeys'], [null, 'legacy-key', null]); }],
    ['declared pile turned observed keeping its keys', (value: Manifest): void => { set(value, ['capture', 'piles', 1, 'source'], { kind: 'observed' }); }],
    ['observed pile whose member keeps a key', (value: Manifest): void => {
      set(value, ['capture', 'piles', 1, 'source'], { kind: 'observed' }); set(value, ['capture', 'piles', 1, 'memberKeys'], [null, null]);
      set(value, ['capture', 'piles', 1, 'context', 'memberKey'], null);
    }],
    ['observed pile whose context keeps a key', (value: Manifest): void => {
      set(value, ['capture', 'piles', 1, 'source'], { kind: 'observed' }); set(value, ['capture', 'piles', 1, 'memberKeys'], [null, null]);
      set(value, ['capture', 'members', 1, 'memberKey'], null);
    }],
    ['keyed member added to an observed pile', (value: Manifest): void => {
      value.capture.members.push({ pileId: 'legacy-pile', memberKey: 'legacy-key', file: seen('legacy-file', 'old.txt', 'inbox-folder'), content: verified(1, digest('7'), 'blob') });
    }],
    ['observed pile with a keyed text context', (value: Manifest): void => {
      set(value, ['capture', 'piles', 2, 'context'], { kind: 'text', memberKey: 'legacy-key', file: seen('legacy-context', 'context.md', 'inbox-folder'), text: 'Old', content: verifiedText('Old') });
    }],
    ['two files under one member key of a pile', (value: Manifest): void => {
      value.capture.members.push({ pileId: 'pile-folder', memberKey: 'member-a', file: seen('child-b', 'b.txt', 'pile-folder-id'), content: verified(3, digest('d'), 'blob') });
    }],
    ['member key missing from its pile', (value: Manifest): void => { set(value, ['capture', 'members', 1, 'memberKey'], 'member-b'); }],
    ['member key of another pile', (value: Manifest): void => { set(value, ['capture', 'members', 1, 'memberKey'], 'member-receipt'); }],
    ['context key used as a member key', (value: Manifest): void => { set(value, ['capture', 'members', 1, 'memberKey'], 'member-context'); }],
    ['keyed member of a pile that was not captured', (value: Manifest): void => { set(value, ['capture', 'members', 1, 'pileId'], 'pile-missing'); }],
    ['pile key dropped while its member keeps it', (value: Manifest): void => { set(value, ['capture', 'piles', 1, 'memberKeys'], [null]); }],
  ] as const)('refuses inconsistent pile membership with resealed identities: %s', async (_label, change) => {
    const value = variant(change);
    expect(value.captureId).toBe(H({ scope: value.scope, runScope: value.runScope, capture: value.capture }));
    await refuse(bytes(value), 'shape');
  });
  it.each([
    ['observed pile with null keys, null-keyed members and an unkeyed text context', (value: Manifest): void => {
      set(value, ['capture', 'piles', 1, 'source'], { kind: 'observed' }); set(value, ['capture', 'piles', 1, 'memberKeys'], [null, null]);
      set(value, ['capture', 'piles', 1, 'context', 'memberKey'], null); set(value, ['capture', 'members', 1, 'memberKey'], null);
    }],
    ['several null-keyed members of one observed pile', (value: Manifest): void => {
      value.capture.members.push(
        { pileId: 'legacy-pile', memberKey: null, file: seen('legacy-1', 'old.txt', 'inbox-folder'), content: verified(1, digest('7'), 'blob') },
        { pileId: 'legacy-pile', memberKey: null, file: seen('legacy-2', 'old.txt', 'inbox-folder'), content: verified(1, digest('7'), 'blob') });
    }],
    ['null-keyed members beside a keyed member of a declared pile', (value: Manifest): void => {
      value.capture.members.push(
        { pileId: 'pile-folder', memberKey: null, file: seen('child-c', 'c.txt', 'pile-folder-id'), content: verified(1, digest('7'), 'blob') },
        { pileId: 'pile-folder', memberKey: null, file: seen('child-d', 'd.txt', 'pile-folder-id'), content: verified(1, digest('7'), 'blob') });
    }],
  ] as const)('accepts consistent pile membership: %s', async (_label, change) => { await accept(variant(change)); });
  // Not decided by Unit G or the contract: these pin only that this unit adds no rule for them.
  it.each([
    ['one member key in two piles', (value: Manifest): void => {
      set(value, ['capture', 'piles', 0, 'memberKeys'], ['member-receipt', 'member-a']);
      value.capture.members.push({ pileId: 'pile-receipt', memberKey: 'member-a', file: seen('receipt-2', 'receipt.txt', 'inbox-folder'), content: verified(3, digest('d'), 'blob') });
    }],
    ['declared key whose member was not captured', (value: Manifest): void => { set(value, ['capture', 'piles', 1, 'memberKeys'], ['member-a', 'member-b', null]); }],
    ['declared context keyed apart from its pile keys', (value: Manifest): void => { set(value, ['capture', 'piles', 1, 'context', 'memberKey'], 'member-other'); }],
  ] as const)('accepts membership not decided by Unit G: %s', async (_label, change) => { await accept(variant(change)); });

  // Logical ID guards the membership check cannot decide first: no member names these piles or keys.
  const badIds: unknown[] = ['', 'x'.repeat(129), 'a b', 'a/b', 'é', 'a.', 'a\n', '\u0000', 7];
  it.each([...badIds, null])('refuses invalid pileId %j on a pile no member references', async (id) => {
    const value = rich(); set(value, ['capture', 'piles', 2, 'pileId'], id); await refuse(bytes(value), 'shape');
  });
  it.each([...badIds, null])('refuses invalid pileId %j on a null-keyed member', async (id) => {
    const value = rich(); set(value, ['capture', 'members', 1, 'memberKey'], null); set(value, ['capture', 'members', 1, 'pileId'], id);
    await refuse(bytes(value), 'shape');
  });
  it.each(badIds)('refuses invalid unreferenced pile member key %j', async (id) => {
    const value = rich(); set(value, ['capture', 'piles', 1, 'memberKeys', 1], id); await refuse(bytes(value), 'shape');
  });
  it('accepts the controls behind those ID refusals with valid IDs', async () => {
    await accept(variant((value) => { set(value, ['capture', 'piles', 2, 'pileId'], 'Z'); }));
    await accept(variant((value) => { set(value, ['capture', 'members', 1, 'memberKey'], null); set(value, ['capture', 'members', 1, 'pileId'], 'legacy-pile'); }));
    await accept(variant((value) => { set(value, ['capture', 'piles', 1, 'memberKeys', 1], 'Z'); }));
  });

  it.each([
    ['create-text into a moved file', (value: Manifest): void => { op(value, 2).effect = { ...op(value, 2).effect, parent: { createdBy: op(value, 0).operationId } } as Operation['effect']; }],
    ['move into a created text', (value: Manifest): void => { op(value, 4).effect = { ...op(value, 4).effect, parent: { createdBy: op(value, 2).operationId } } as Operation['effect']; }],
    ['create-folder under a runner JSON write', (value: Manifest): void => {
      append(value, { kind: 'create-folder', parent: { createdBy: op(value, 3).operationId }, name: 'Inside', createKey: 'folder-inside' });
    }],
    ['create-text under a binned folder', (value: Manifest): void => {
      append(value, { kind: 'create-text', parent: { createdBy: op(value, 5).operationId }, name: 'x.md', createKey: 'note-inside', text: 'x', content: raw('x'), purpose: 'generated' });
    }],
  ] as const)('refuses createdBy naming an earlier operation that creates no folder, with resealed identities: %s', async (_label, change) => {
    const value = variant(change);
    expect(value.operations.map((item) => item.ordinal)).toEqual(value.operations.map((_item, index) => index));
    await refuse(bytes(value), 'shape');
  });
  it('accepts createdBy chains through earlier create-folder operations', async () => {
    await accept(variant((value) => {
      append(value, { kind: 'create-folder', parent: { createdBy: op(value, 1).operationId }, name: 'Inside', createKey: 'folder-inside' });
      append(value, { kind: 'create-text', parent: { createdBy: op(value, 6).operationId }, name: 'x.md', createKey: 'note-inside', text: 'x', content: raw('x'), purpose: 'generated' });
      append(value, { kind: 'move', before: seen('loose-file', 'loose.txt', 'inbox-folder'), parent: { createdBy: op(value, 6).operationId }, name: 'loose.txt', properties: {} });
    }));
  });
  it('still refuses createdBy naming a later create-folder as order', async () => {
    const value = rich();
    op(value, 0).effect = { ...op(value, 0).effect, parent: { createdBy: op(value, 1).operationId } } as Operation['effect'];
    await refuse(bytes(seal(value)), 'order');
  });
});

describe('runner-writable files (runner-paths-disagree, TL-P4-14 addendum 20)', () => {
  const writes = ['.bower/questions.json', '.bower/requests.json', '.bower/hashes.json'] as const;
  const writing = (path: string): Manifest => variant((value) => { set(value, ['operations', 3, 'effect', 'path'], path); });
  it('the manifest takes the runner-writable files as a parameter', async () => {
    // The list it is given decides, for both versions' reader: a path outside it is refused, one inside it admitted.
    const suggestions = writing('.bower/suggestions.json');
    expect(await parseRunManifestV2(bytes(suggestions), 'fake-root', writes)).toEqual({ ok: false, reason: 'shape' });
    // The list is typed by the contract's `RunnerWrite`, so no caller can name another file; the list given still decides.
    // @ts-expect-error suggestions.json is not a runner-writable file
    expect(await parseRunManifestV2(bytes(suggestions), 'fake-root', [...writes, '.bower/suggestions.json'])).toMatchObject({ ok: true });
    const questions = rich();
    expect(await parseRunManifestV2(bytes(questions), 'fake-root', writes)).toMatchObject({ ok: true });
    expect(await parseRunManifestV2(bytes(questions), 'fake-root', ['.bower/requests.json'])).toEqual({ ok: false, reason: 'shape' });
    expect(await parseRunManifest(bytes(questions), 'fake-root', ['.bower/hashes.json'])).toEqual({ ok: false, reason: 'shape' });
  });
});
