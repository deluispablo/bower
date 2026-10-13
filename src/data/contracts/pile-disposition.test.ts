import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parsePileDisposition, type Disposition } from './pile-disposition';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (value: unknown): Uint8Array => utf8(JSON.stringify(value));
const fixtureRoot = 'testing/fixtures/run-recovery-contract/';
// Only record bytes and literal expected hashes are read. No fixture event runs.
const fixture = JSON.parse(readFileSync(fixtureRoot + '04-report-publication-retry.json', 'utf8')) as {
  input: { confirmedDispositions: { record: Disposition; sha256: string }[] };
};
const records = fixture.input.confirmedDispositions;
function observed(): Disposition {
  const first = records[0];
  if (!first) throw new Error('The literal fixture must contain a disposition');
  return structuredClone(first.record);
}
function declared(): Disposition {
  const value = observed();
  // Reference and member key from fixture 01; this is a structural variant,
  // not evidence that the declaration/report/operation were resolved together.
  value.declaration = { declarationId: 'decl-receipt', sha256: '6f4d484c644dd6b541967ea60ad56ed508d8ec520ac2c99a1b3a075afa00aca1' };
  value.memberKeys = ['member-receipt'];
  return value;
}
function removed(): Disposition {
  const value = declared();
  value.action = 'removed';
  value.authority = { kind: 'person-bin', intentId: 'bin-receipt' };
  for (const operation of value.operations) operation.evidence.trashed = true;
  return value;
}
type Path = (string | number)[];
const at = (value: unknown, path: Path): unknown => path.reduce<unknown>(
  (node, key) => (node as Record<string | number, unknown>)[key], value,
);
function set(value: unknown, path: Path, next: unknown): void {
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('A field path is required');
  (at(value, path.slice(0, -1)) as Record<string | number, unknown>)[key] = next;
}
async function accept(value: Disposition, keys?: readonly string[], root = value.scope.rootId): Promise<void> {
  const source = bytes(value);
  const before = source.slice();
  const result = await parsePileDisposition(source, root, keys);
  expect(result).toMatchObject({ ok: true, value });
  if (result.ok) expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(source).toEqual(before);
}
async function refuse(source: Uint8Array, reason?: string, keys?: readonly string[], root = 'fake-root'): Promise<void> {
  const before = source.slice();
  const result = await parsePileDisposition(source, root, keys);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('value');
  expect(result).not.toHaveProperty('sha256');
  expect(result).toHaveProperty('reason');
  if (reason) expect(result).toEqual({ ok: false, reason });
  expect(source).toEqual(before);
}
const shapes: { label: string; make: () => Disposition; path: Path }[] = [
  { label: 'record', make: declared, path: [] },
  { label: 'scope', make: declared, path: ['scope'] },
  { label: 'declaration', make: declared, path: ['declaration'] },
  { label: 'run authority', make: declared, path: ['authority'] },
  { label: 'person authority', make: removed, path: ['authority'] },
  { label: 'operation', make: declared, path: ['operations', 0] },
  { label: 'evidence', make: declared, path: ['operations', 0, 'evidence'] },
  { label: 'file', make: declared, path: ['operations', 0, 'evidence', 'file'] },
  { label: 'content', make: declared, path: ['operations', 0, 'evidence', 'content'] },
];
const filePath: Path = ['operations', 0, 'evidence', 'file'];
const contentPath: Path = ['operations', 0, 'evidence', 'content'];

describe('pile dispositions retire piles only with matching authority', () => {
  it.each(records)('accepts literal $record.pileId with its fixture digest', async ({ record, sha256 }) => {
    const source = utf8(` \r\n${JSON.stringify(record, null, 2)}\t`);
    const before = source.slice();
    expect(await parsePileDisposition(source, 'fake-root')).toEqual({ ok: true, value: record, sha256 });
    expect(source).toEqual(before);
  });

  it('accepts both authority kinds, nullable content and both provenance labels structurally', async () => {
    await accept(declared(), ['member-receipt']);
    await accept(removed(), ['member-receipt']);
    const value = removed();
    set(value, ['operations', 0, 'evidence', 'content'], null);
    set(value, ['operations', 0, 'evidence', 'provenance'], 'adapter-read');
    set(value, [...filePath, 'folder'], true);
    await accept(value);
    set(value, ['operations', 0, 'evidence', 'content'], at(declared(), contentPath));
    set(value, [...contentPath, 'encoding'], 'blob');
    set(value, [...contentPath, 'provenance'], 'adapter-read');
    set(value, [...contentPath, 'size'], Number.MAX_SAFE_INTEGER);
    await accept(value);
  });

  for (const { label, make, path } of shapes) {
    for (const field of Object.keys(at(make(), path) as object)) {
      it.each(['missing', 'null', 'wrong type'])('refuses %s ' + label + '.' + field, async (mode) => {
        // Null declaration/content are explicitly legal, tested separately.
        if (mode === 'null' && ((label === 'record' && field === 'declaration')
          || (label === 'evidence' && field === 'content'))) return;
        const value = make();
        const node = at(value, path) as Record<string, unknown>;
        if (mode === 'missing') Reflect.deleteProperty(node, field);
        else node[field] = mode === 'null' ? null : typeof node[field] === 'number' ? '1' : 7;
        await refuse(bytes(value), 'shape');
      });
    }
    it.each(['extra', '__proto__', 'constructor'])('refuses unknown %s on ' + label, async (key) => {
      const value = make();
      Object.defineProperty(at(value, path), key, { value: true, enumerable: true });
      await refuse(bytes(value), 'shape');
    });
    it('refuses an array in place of ' + label, async () => {
      const value = make();
      if (!path.length) { await refuse(bytes([]), 'shape'); return; }
      set(value, path, []);
      await refuse(bytes(value), 'shape');
    });
  }

  it.each([
    [['v'], 2], [['kind'], 'pile-declaration'], [['action'], 'deleted'],
    [['authority', 'kind'], 'unknown'], [['authority', 'reportHash'], 'A'.repeat(64)],
    [['declaration', 'sha256'], '0'.repeat(63)], [['operations', 0, 'operationId'], 'g'.repeat(64)],
    [[...contentPath, 'encoding'], 'base64'], [[...contentPath, 'sha256'], '0'.repeat(64) + '\n'],
    [[...contentPath, 'provenance'], 'metadata'], [['operations', 0, 'evidence', 'provenance'], 'expected'],
    [['operations'], []], [['memberKeys'], [null]],
    [[...filePath, 'parents'], []], [[...filePath, 'parents'], ['same', 'same']],
  ] satisfies [Path, unknown][])('refuses invalid enum/identity shape %j', async (path, next) => {
    const value = declared(); set(value, path, next); await refuse(bytes(value), 'shape');
  });

  for (const path of [['pileId'], ['declaration', 'declarationId'], ['authority', 'runId'], ['memberKeys', 0]] satisfies Path[]) {
    it.each(['', 'a'.repeat(129), 'punctuation.id', 'two words', 'é', 'valid\n'])('refuses logical ID %j at ' + path.join('.'), async (next) => {
      const value = declared(); set(value, path, next); await refuse(bytes(value), 'shape');
    });
  }
  it.each(['', 'a'.repeat(129), 'bad.intent', 'line\n'])('refuses person intent ID %j', async (next) => {
    const value = removed(); set(value, ['authority', 'intentId'], next); await refuse(bytes(value), 'shape');
  });
  for (const path of [['scope', 'rootId'], [...filePath, 'fileId'], [...filePath, 'parents', 0]] satisfies Path[]) {
    it.each(['', 'é'.repeat(513), 'a\u0000b', 'a\u001fb', 'a\u007fb'])('refuses opaque Drive ID %j at ' + path.join('.'), async (next) => {
      const value = declared(); set(value, path, next); await refuse(bytes(value), 'shape');
    });
  }
  it('preserves opaque IDs, boundary lengths and unnormalized names', async () => {
    const value = declared();
    value.scope.rootId = 'é'.repeat(512);
    value.pileId = 'a'.repeat(128);
    set(value, [...filePath, 'fileId'], 'opaque:/+=\u0085😀');
    set(value, [...filePath, 'parents'], [' parent ', 'Parent']);
    set(value, [...filePath, 'name'], ' e\u0301 😀 ');
    await accept(value);
  });
  it.each(['', '.', '..', '/name', 'name/', 'a/b', 'a\\b', 'a\u0000b', 'a\u007fb'])('refuses invalid name %j', async (next) => {
    const value = declared(); set(value, [...filePath, 'name'], next); await refuse(bytes(value), 'shape');
  });
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('refuses invalid content size %j', async (next) => {
    const value = declared(); set(value, [...contentPath, 'size'], next); await refuse(bytes(value), 'number');
  });
  for (const path of [[...filePath, 'modifiedTime'], [...contentPath, 'observedModifiedTime']]) {
    it.each(['', '2026-10-05', '2026-10-05T10:00:00', '2026-02-29T10:00:00Z', '2024-02-30T10:00:00Z',
      '2026-04-31T10:00:00Z', '2026-13-01T10:00:00Z', '2026-00-01T10:00:00Z', '2026-01-00T10:00:00Z',
      '2026-10-05T24:00:00Z', '2026-10-05T10:60:00Z', '2026-10-05T10:00:61Z',
      '2026-10-05T10:00:00+24:00', '2026-10-05T10:00:00+00:60', '2026-10-05T10:00:00.Z',
      ' 2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z\n', '2026-10-05T10:00:60Z',
    ])('refuses invalid observation time %j at ' + path.join('.'), async (next) => {
      const value = declared(); set(value, path, next); await refuse(bytes(value), 'shape');
    });
    it.each(['2024-02-29T23:59:59Z', '2026-10-05t10:00:00.123456789z', '2026-10-05T10:00:00-00:00',
      '2026-10-05T10:00:00+23:59', '2016-12-31T23:59:60Z', '2017-01-01T00:59:60+01:00',
    ])('preserves valid observation time %j at ' + path.join('.'), async (next) => {
      const value = declared(); set(value, path, next); await accept(value);
    });
  }

  it('checks consumed/run and removed/person-bin correspondence', async () => {
    const consumed = declared(); consumed.authority = removed().authority;
    await refuse(bytes(consumed), 'authority');
    const binned = removed(); binned.authority = declared().authority;
    await refuse(bytes(binned), 'authority');
  });
  it('requires Bin evidence for every removed operation', async () => {
    const value = removed();
    const second = structuredClone(value.operations[0]);
    if (!second) throw new Error('Missing fixture operation');
    second.operationId = '0'.repeat(64); second.evidence.trashed = false;
    value.operations.push(second);
    await refuse(bytes(value), 'authority');
  });
  it('refuses duplicate operation IDs and member keys', async () => {
    const value = declared();
    value.operations.push(...structuredClone(value.operations));
    await refuse(bytes(value), 'shape');
    const duplicate = declared(); duplicate.memberKeys.push(...duplicate.memberKeys);
    await refuse(bytes(duplicate), 'shape');
  });
  it('external observed dispositions have no invented member keys', async () => {
    const value = observed(); value.memberKeys = ['invented'];
    await refuse(bytes(value), 'members');
    await accept(observed(), []);
    await refuse(bytes(observed()), 'members', ['invented']);
  });
  it('compares the complete caller-supplied member set without ordering or mutation', async () => {
    const value = declared(); value.memberKeys.push('member-context');
    const expected = Object.freeze(['member-context', 'member-receipt']);
    await accept(value, expected);
    expect(expected).toEqual(['member-context', 'member-receipt']);
    for (const keys of [[], ['member-receipt'], ['member-receipt', 'different'],
      ['member-receipt', 'member-context', 'extra'], ['member-receipt', 'member-receipt']]) {
      await refuse(bytes(value), 'members', keys);
    }
    value.memberKeys = [];
    await accept(value, []); // Structural parser cannot invent the declaration's contents.
  });
  it('refuses malformed caller member context', async () => {
    for (const keys of [null, 'member-receipt', [null], ['bad.key']]) {
      await refuse(bytes(declared()), 'members', keys as readonly string[]);
    }
  });
  it.each(['wrong-root', '', 'a\u0000b', 'é'.repeat(513), '\ud800'])('checks independent expected scope %j', async (root) => {
    await refuse(bytes(observed()), 'scope', undefined, root);
  });
  it('refuses strict JSON hazards before shape or canonical hashing', async () => {
    const json = JSON.stringify(observed());
    await refuse(utf8(json.replace('"v":1', '"v":1,"\\u0076":1')), 'duplicate-key');
    await refuse(utf8(json.replace('"fake-root"', '"\\ud800"')), 'unicode');
    await refuse(utf8(json.replace('"v":1', '"v":-0')), 'number');
    await refuse(utf8(json.replace('"v":1', '"v":1.0000000000000001')), 'number');
    await refuse(utf8(json + ' false'), 'syntax');
    await refuse(new Uint8Array([0xc3, 0x28]), 'encoding');
  });
  it('propagates unexpected hashing errors without fabricating a refusal', async () => {
    const failure = new Error('Hash service unavailable');
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(failure);
    try { await expect(parsePileDisposition(bytes(observed()), 'fake-root')).rejects.toBe(failure); }
    finally { spy.mockRestore(); }
  });
});
