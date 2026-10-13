import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parsePileDeclaration, type Declaration, type Member } from './pile-declaration';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (value: unknown): Uint8Array => utf8(JSON.stringify(value));
const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Independently authored expectations from the ratified declaration portions.
const loose = (): Declaration => ({
  v: 1, kind: 'pile-declaration', scope: { rootId: 'fake-root' },
  declarationId: 'decl-receipt', pileId: 'pile-receipt', createdAt: 1791194400000,
  anchor: { kind: 'loose', inboxId: 'inbox-folder' },
  members: [{ memberKey: 'member-receipt', name: 'receipt.txt', kind: 'other', origin: null,
    content: { encoding: 'utf8', size: 8, sha256: '6afd9c1cbf495f9221fe5f9d03d4f0e962babd83fd293c696e69686510611a63' } }],
  context: { kind: 'absent' },
});
const folder = (): Declaration => ({
  v: 1, kind: 'pile-declaration', scope: { rootId: 'fake-root' },
  declarationId: 'decl-partial', pileId: 'pile-partial', createdAt: 1791194400000,
  anchor: { kind: 'folder', inboxId: 'inbox-folder', name: 'Receipts', createKey: 'anchor-partial' },
  members: [
    { memberKey: 'member-arrived', name: 'arrived.txt', kind: 'other', origin: null,
      content: { encoding: 'utf8', size: 8, sha256: '22aaf2e5a79b0cc71cd7c024db3669888f81654337da679751a6d4fdb2da81f2' } },
    { memberKey: 'member-missing', name: 'missing.txt', kind: 'other', origin: null,
      content: { encoding: 'utf8', size: 8, sha256: '6bbd052ab054ef222c1c87be60cd191addedd24cc882d1f5f7f7be61dc61bb3a' } },
  ],
  context: { kind: 'text', memberKey: 'member-context', originalText: 'Original context\n',
    content: { encoding: 'utf8', size: 17, sha256: '5e73a4c26c2b1aaf45ec40bff7b61e7c242c5f06106c6ef38304fb374c0b2640' } },
});
function memberAt(value: Declaration, index = 0): Member {
  const member = value.members[index];
  if (!member) throw new Error('Independent fixture must contain this member');
  return member;
}

type Path = (string | number)[];
const at = (value: unknown, path: Path): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], value);
function set(value: unknown, path: Path, next: unknown): void {
  const parent = at(value, path.slice(0, -1)) as Record<string | number, unknown>;
  const key = path[path.length - 1];
  if (key === undefined) throw new Error('A field path is required');
  parent[key] = next;
}
async function refuse(source: Uint8Array, reason?: string, root = 'fake-root'): Promise<void> {
  const before = source.slice();
  const result = await parsePileDeclaration(source, root);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('value');
  expect(result).not.toHaveProperty('sha256');
  if (reason) expect(result).toEqual({ ok: false, reason });
  expect(source).toEqual(before);
}
async function accept(value: Declaration, root = value.scope.rootId): Promise<void> {
  const source = bytes(value);
  const before = source.slice();
  const result = await parsePileDeclaration(source, root);
  expect(result).toMatchObject({ ok: true, value });
  if (result.ok) expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(source).toEqual(before);
}

const shapes: { label: string; make: () => Declaration; path: Path }[] = [
  { label: 'declaration', make: folder, path: [] },
  { label: 'scope', make: folder, path: ['scope'] },
  { label: 'folder anchor', make: folder, path: ['anchor'] },
  { label: 'loose anchor', make: loose, path: ['anchor'] },
  { label: 'member', make: folder, path: ['members', 0] },
  { label: 'member content', make: folder, path: ['members', 0, 'content'] },
  { label: 'text context', make: folder, path: ['context'] },
  { label: 'context content', make: folder, path: ['context', 'content'] },
  { label: 'absent context', make: loose, path: ['context'] },
];

describe('pile declarations preserve immutable authority', () => {
  it.each([
    ['01-admission-reopen.json', 'declaration', '6f4d484c644dd6b541967ea60ad56ed508d8ec520ac2c99a1b3a075afa00aca1', loose()],
    ['07-loose-first-create.json', 'declaration', 'a6433b2f0f2655da3c03ebbd569bc34bef3bdb2557e054c643d07a9b4e20fdd4', { ...loose(), declarationId: 'decl-loose', pileId: 'pile-loose', members: [{ ...memberAt(loose()), memberKey: 'member-loose' }] }],
    ['08-partial-reselection-context.json', 'declaration', 'b6e762ef12e0b8a10c0cf6a6d1200252683d0b1f330e28c75d699d8f4230d896', folder()],
    ['09-declaration-conflict.json', 'original', 'b6e762ef12e0b8a10c0cf6a6d1200252683d0b1f330e28c75d699d8f4230d896', folder()],
    ['09-declaration-conflict.json', 'identicalCopy', 'b6e762ef12e0b8a10c0cf6a6d1200252683d0b1f330e28c75d699d8f4230d896', folder()],
  ] as const)('parses only the declaration portion of %s/%s with independent identity', async (file, key, hash, expected) => {
    const packet = JSON.parse(readFileSync(`testing/fixtures/run-recovery-contract/${file}`, 'utf8')) as { input: Record<string, unknown> };
    const source = utf8(` \r\n${JSON.stringify(packet.input[key], null, 2)}\t`);
    const before = source.slice();
    expect(await parsePileDeclaration(source, 'fake-root')).toEqual({ ok: true, value: expected, sha256: hash });
    expect(source).toEqual(before);
    // Admission, upload, reselection and recovery events in these fixtures are not executed.
  });

  it('validates individual conflicting copies without claiming discovery conflict resolution', async () => {
    const changed = folder();
    memberAt(changed, 1).content.sha256 = '7f8b1dfc466b6249f06cbe55c9174df2578e7754da793fded244ef5cba2a38f1';
    expect(await parsePileDeclaration(bytes(changed), 'fake-root')).toEqual({ ok: true, value: changed, sha256: '9bd974050811d5d6951ee34ee81aa79ba283553e1c0fff3a6a3a33909eddb2e6' });
  });

  for (const { label, make, path } of shapes) {
    const fields = Object.keys(at(make(), path) as object);
    for (const field of fields) {
      it.each(['missing', 'null', 'wrong type'])('refuses %s ' + label + '.' + field, async (mode) => {
        const value = make();
        const node = at(value, path) as Record<string, unknown>;
        if (mode === 'missing') Reflect.deleteProperty(node, field);
        else if (mode === 'null') {
          if (field === 'origin') { await accept(value); return; }
          node[field] = null;
        } else node[field] = typeof node[field] === 'number' ? '1' : 7;
        await refuse(bytes(value), 'shape');
      });
    }
    it.each(['extra', '__proto__', 'constructor'])('refuses unknown %s on ' + label, async (key) => {
      const value = make();
      Object.defineProperty(at(value, path), key, { value: true, enumerable: true });
      await refuse(bytes(value), 'shape');
    });
    it('refuses array in place of ' + label, async () => {
      if (path.length === 0) { await refuse(bytes([]), 'shape'); return; }
      const value = make();
      set(value, path, []);
      await refuse(bytes(value), 'shape');
    });
  }

  it.each([
    [['v'], 0], [['v'], 2], [['kind'], 'run-manifest'], [['kind'], 'pile-disposition'],
    [['anchor', 'kind'], 'unknown'], [['context', 'kind'], 'unknown'],
    [['members', 0, 'kind'], 'folder'], [['members', 0, 'content', 'encoding'], 'base64'],
    [['context', 'content', 'encoding'], 'base64'],
  ] as [Path, unknown][])('refuses unsupported enum/version at %j', async (path, value) => {
    const input = folder(); set(input, path, value); await refuse(bytes(input), 'shape');
  });

  const idPaths: Path[] = [['declarationId'], ['pileId'], ['anchor', 'createKey'], ['members', 0, 'memberKey'], ['context', 'memberKey']];
  for (const path of idPaths) {
    it.each(['', 'x'.repeat(129), 'a b', 'a/b', 'é', 'a.', 'a\n', '\u0000'])('refuses invalid logical ID %j at ' + path.join('.'), async (id) => {
      const value = folder(); set(value, path, id); await refuse(bytes(value), 'shape');
    });
    it.each(['Z', 'A_0-z'.repeat(25) + 'xyz'])('accepts logical ID boundary %s at ' + path.join('.'), async (id) => {
      const value = folder(); set(value, path, id); await accept(value);
    });
  }

  for (const path of [['scope', 'rootId'], ['anchor', 'inboxId']] satisfies Path[]) {
    it.each(['', 'a\n', 'a\u0000', '\u007f', '😀'.repeat(257)])('refuses opaque Drive ID %j at ' + path.join('.'), async (id) => {
      const value = folder(); set(value, path, id); await refuse(bytes(value), 'shape', value.scope.rootId);
    });
    it.each(['opaque:/+ space.é', '\u0080\u009f', '😀'.repeat(256), 'x'.repeat(1024)])('accepts opaque Drive ID punctuation/UTF8 boundary at ' + path.join('.'), async (id) => {
      const value = folder(); set(value, path, id); await accept(value);
    });
  }

  for (const path of [['anchor', 'name'], ['members', 0, 'name']] satisfies Path[]) {
    it.each(['', '.', '..', '/x', 'x/', 'x/y', 'x\\y', '\u0000', '\r', '\u007f'])('refuses noncomponent name %j at ' + path.join('.'), async (name) => {
      const value = folder(); set(value, path, name); await refuse(bytes(value), 'shape');
    });
    it.each(['.hidden', ' a  ', 'é😀.txt', 'a:b', '\u0080\u009f'])('keeps valid name %j at ' + path.join('.'), async (name) => {
      const value = folder(); set(value, path, name); await accept(value);
    });
  }

  for (const path of [['createdAt'], ['members', 0, 'content', 'size'], ['context', 'content', 'size']] satisfies Path[]) {
    it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('refuses unsafe integer %s at ' + path.join('.'), async (number) => {
      const value = folder(); set(value, path, number); await refuse(bytes(value), 'number');
    });
  }
  it.each(['-0', '9007199254740991.0000000001', '1e-999999'])('refuses exact numeric token %s before rounding', async (token) => {
    const source = JSON.stringify(loose()).replace('1791194400000', token);
    await refuse(utf8(source), 'number');
  });
  it('accepts nonnegative safe integer boundaries without asserting member byte availability', async () => {
    const value = loose(); value.createdAt = 0; memberAt(value).content = { encoding: 'blob', size: Number.MAX_SAFE_INTEGER, sha256: '0'.repeat(64) };
    await accept(value);
    value.createdAt = Number.MAX_SAFE_INTEGER; memberAt(value).content.size = 0; await accept(value);
  });

  for (const path of [['members', 0, 'content', 'sha256'], ['context', 'content', 'sha256']] satisfies Path[]) {
    it.each(['', 'f'.repeat(63), 'f'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ' '.repeat(64)])('refuses invalid digest %j at ' + path.join('.'), async (digest) => {
      const value = folder(); set(value, path, digest); await refuse(bytes(value), 'shape');
    });
  }
  it.each(['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'] as const)('accepts member kind %s with blob or utf8 intent', async (kind) => {
    const value = loose(); memberAt(value).kind = kind; memberAt(value).content.encoding = 'blob'; await accept(value);
  });
  it.each([null, '', ' \r\né é\u0000  '])('preserves origin text or null %j without normalization', async (origin) => {
    const value = loose(); memberAt(value).origin = origin; await accept(value);
  });

  it.each(['member duplicate', 'member/context', 'member/create', 'context/create'])('refuses colliding key %s', async (collision) => {
    const value = folder();
    if (collision === 'member duplicate') memberAt(value, 1).memberKey = memberAt(value).memberKey;
    if (collision === 'member/context' && value.context.kind === 'text') value.context.memberKey = memberAt(value).memberKey;
    if (value.anchor.kind === 'folder') {
      if (collision === 'member/create') value.anchor.createKey = memberAt(value).memberKey;
      if (collision === 'context/create' && value.context.kind === 'text') value.anchor.createKey = value.context.memberKey;
    }
    await refuse(bytes(value), 'shape');
  });
  it('does not invent name uniqueness or prohibit a logical pile ID from matching a member key', async () => {
    const value = folder(); memberAt(value, 1).name = memberAt(value).name; value.pileId = memberAt(value).memberKey; await accept(value);
  });
  it.each(['no members', 'two members', 'text context', 'folder fields'])('refuses inconsistent loose layout %s', async (variant) => {
    const value = loose();
    if (variant === 'no members') value.members = [];
    if (variant === 'two members') value.members.push({ ...memberAt(value), memberKey: 'second' });
    if (variant === 'text context') value.context = folder().context;
    if (variant === 'folder fields') Object.assign(value.anchor, { name: 'Receipts', createKey: 'anchor' });
    await refuse(bytes(value), 'shape');
  });
  it.each(['absent', 'empty'])('refuses folder without members or nonempty original context %s', async (variant) => {
    const value = folder(); value.members = [];
    value.context = variant === 'absent' ? { kind: 'absent' } : { kind: 'text', memberKey: 'context', originalText: '', content: { encoding: 'utf8', size: 0, sha256: emptyHash } };
    await refuse(bytes(value), 'shape');
  });
  it('accepts folder members with absent context', async () => {
    const value = folder(); value.context = { kind: 'absent' }; await accept(value);
  });

  it.each([
    ['', 0, emptyHash],
    [' ', 1, '36a9e7f1c95b82ffb99743e0c5c4ce95d83c9a430aac59f84ef3cbfab6145068'],
    ['\r\n', 2, '7eb70257593da06f682a3ddda54a9d260d4fc514f645237f5ca74b08f8da61a6'],
    [' é\r\n😀  ', 12, '940b4e121bf7ec950e0812dc127a70a537c594cdc568b42fc0524bc9892853f2'],
    ['é', 2, '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c'],
    ['é', 3, 'bf12767b0f2a56b2190075bae8169f656e3ce8d6357d4aff184bc6c7ea48f9f6'],
    ['\u0000', 1, '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d'],
  ] as const)('verifies independently hashed raw context %j including present-empty', async (text, size, sha256) => {
    const value = folder(); value.context = { kind: 'text', memberKey: 'context', originalText: text, content: { encoding: 'utf8', size, sha256 } };
    await accept(value);
    if (text !== '') { value.members = []; await accept(value); }
  });
  it.each(['encoding', 'size', 'hash', 'normalized', 'canonical string'])('refuses wrong raw context binding %s', async (variant) => {
    const value = folder();
    if (value.context.kind !== 'text') throw new Error('Fixture must contain context');
    if (variant === 'encoding') value.context.content.encoding = 'blob';
    if (variant === 'size') value.context.content.size = 18;
    if (variant === 'hash') value.context.content.sha256 = emptyHash;
    if (variant === 'normalized') value.context = { kind: 'text', memberKey: 'context', originalText: 'é', content: { encoding: 'utf8', size: 3, sha256: '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c' } };
    if (variant === 'canonical string') value.context = { kind: 'text', memberKey: 'context', originalText: 'abc', content: { encoding: 'utf8', size: 3, sha256: '6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25' } };
    await refuse(bytes(value), 'content');
  });

  it.each(['other-root', '', '😀'.repeat(257), '\uD800', 'fake-root\n'])('refuses independently supplied mismatched/invalid expected root %j', async (root) => {
    await refuse(bytes(loose()), 'scope', root);
  });
  it.each([
    ['scope', '{"rootId":"fake-root","\\u0072ootId":"fake-root"}'],
    ['context', '{"kind":"absent","kind":"absent"}'],
  ])('refuses decoded duplicate JSON keys in %s', async (field, replacement) => {
    const source = JSON.stringify(loose()).replace(field === 'scope' ? '{"rootId":"fake-root"}' : '{"kind":"absent"}', replacement);
    await refuse(utf8(source), 'duplicate-key');
  });
  it.each([['declarationId'], ['scope', 'rootId'], ['anchor', 'name'], ['members', 0, 'origin'], ['context', 'originalText']] satisfies Path[])('refuses invalid Unicode at %j before text hashing', async (...path) => {
    const value = folder(); set(value, path, '\uD800'); await refuse(bytes(value), 'unicode');
  });
  it.each([[0xff], [0xed, 0xa0, 0x80], [0xc0, 0xaf]])('refuses invalid source UTF8 %j', async (...literal) => { await refuse(Uint8Array.from(literal), 'encoding'); });
  it.each(['', '{}', 'null', 'true', '[]', '{"v":1,"kind":"run-report"}', '{"v":1,"phase":"done"}', '{}x'])('refuses malformed, legacy or other record source %s', async (text) => { await refuse(utf8(text)); });

  it('uses only supplied source byte view and returns independent decoded values on every parse', async () => {
    const source = bytes(folder());
    const all = Uint8Array.from([0xff, ...source, 0xff]);
    const before = all.slice();
    const one = await parsePileDeclaration(all.subarray(1, -1), 'fake-root');
    const two = await parsePileDeclaration(all.subarray(1, -1), 'fake-root');
    expect(one.ok).toBe(true); expect(two.ok).toBe(true);
    if (!one.ok || !two.ok) return;
    memberAt(one.value).name = 'changed';
    one.value.scope.rootId = 'changed';
    expect(two.value).toEqual(folder());
    expect(all).toEqual(before);
    expect((await parsePileDeclaration(source, 'fake-root'))).toEqual(two);
  });
  it('propagates unexpected platform hash errors and leaves source bytes intact', async () => {
    const source = bytes(folder()); const before = source.slice();
    const failure = new Error('Synthetic platform hash failure');
    const spy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(failure);
    try { await expect(parsePileDeclaration(source, 'fake-root')).rejects.toBe(failure); }
    finally { spy.mockRestore(); }
    expect(source).toEqual(before);
  });
});
