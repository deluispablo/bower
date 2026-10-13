import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../vault/hashes';
import { canonicalRecordJson, hashRecordJson, parseRecordJson } from './record-json';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const success = <T>(value: T) => ({ ok: true, value });

describe('record JSON preserves canonical authority', () => {
  it.each([
    ['null', null], ['true', true], ['false', false], ['0', 0], ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['1.0', 1], ['1e2', 100], ['1000e-3', 1], ['0e999999', 0],
    [' [true, null, 2] \r\n', [true, null, 2]],
    ['"é"', 'é'], ['"e\\u0301"', 'e\u0301'], ['"\\ud83d\\ude00"', '😀'],
    ['"a\\r\\nb  "', 'a\r\nb  '], ['"\\u0000\\u001f"', '\u0000\u001f'],
  ])('parses independently specified valid input %s', (text, value) => {
    const bytes = utf8(String(text));
    const before = bytes.slice();
    expect(parseRecordJson(bytes)).toEqual(success(value));
    expect(bytes).toEqual(before);
  });

  it.each([
    ['{"a":1,"a":2}', 'duplicate-key'],
    ['{"a":1,"\\u0061":2}', 'duplicate-key'],
    ['{"nested":{"x":1,"x":2}}', 'duplicate-key'],
    ['[{"x":1,"\\u0078":2}]', 'duplicate-key'],
    ['{"😀":1,"\\ud83d\\ude00":2}', 'duplicate-key'],
    ['{"é":1,"e\\u0301":2}', null],
    ['-0', 'number'], ['-0.0', 'number'], ['-0e999', 'number'], ['-1', 'number'],
    ['1.5', 'number'], ['1e-1', 'number'], ['1e309', 'number'], ['9007199254740992', 'number'],
    ['9007199254740991.0000000001', 'number'], ['5000000000000000.1', 'number'],
    ['9007199254740991.1', 'number'], ['1.00000000000000001', 'number'], ['1e-999999', 'number'],
    ['0.00000000000000000001', 'number'],
    ['"\\ud800"', 'unicode'], ['"\\udc00"', 'unicode'], ['{"\\ud800":1}', 'unicode'],
    ['', 'syntax'], ['[1,]', 'syntax'], ['{"x":1,}', 'syntax'], ['{x:1}', 'syntax'],
    ['{"a":}', 'syntax'], ['01', 'syntax'], ['+1', 'syntax'], ['1.', 'syntax'],
    ['true false', 'syntax'], ['{}x', 'syntax'], ['NaN', 'syntax'], ['Infinity', 'syntax'],
    ['"a\nb"', 'syntax'], ['"\\x00"', 'syntax'], ['\uFEFF{}', 'syntax'],
  ])('refuses damaged input %s without modifying bytes or producing a value', (text, reason) => {
    const bytes = utf8(text);
    const before = bytes.slice();
    const result = parseRecordJson(bytes);
    if (reason === null) expect(result).toEqual(success({ é: 1, 'e\u0301': 2 }));
    else expect(result).toEqual({ ok: false, reason });
    expect(bytes).toEqual(before);
  });

  it.each([
    [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82], [0x80],
  ])('refuses invalid UTF-8 bytes %j without replacement', (...literal) => {
    const bytes = Uint8Array.from(literal);
    expect(parseRecordJson(bytes)).toEqual({ ok: false, reason: 'encoding' });
    expect(bytes).toEqual(Uint8Array.from(literal));
  });

  it('reads only the supplied byte view', () => {
    const all = Uint8Array.from([0xff, 0x7b, 0x7d, 0xff]);
    expect(parseRecordJson(all.subarray(1, 3))).toEqual(success({}));
    expect(all).toEqual(Uint8Array.from([0xff, 0x7b, 0x7d, 0xff]));
  });

  it('emits integer-like keys in UTF-16 order and preserves exact array/string content', async () => {
    const input = { '2': 'two', '10': 'ten', a: ['é', 'e\u0301', 0, true, null] };
    const golden = '{"10":"ten","2":"two","a":["é","é",0,true,null]}';
    expect(canonicalRecordJson(input)).toEqual(success(utf8(golden)));
    expect(await hashRecordJson(input)).toEqual(success('3e4df485e0c969911ce7ea2526e0d69cddda4172b3c51a55e1aba63b9f265994'));
    expect(parseRecordJson(utf8(golden))).toEqual(success(input));
  });

  it('orders supplementary keys by UTF-16 units, not Unicode code points', () => {
    expect(canonicalRecordJson({ '\uE000': 1, '😀': 2 })).toEqual(success(utf8('{"😀":2,"":1}')));
  });

  it('escapes individual strings without normalizing CRLF, whitespace, quotes or Unicode', () => {
    expect(canonicalRecordJson({ text: ' \r\n"\\\u0000é e\u0301 ' })).toEqual(success(utf8(String.raw`{"text":" \r\n\"\\\u0000é é "}`)));
  });

  it('returns independent canonical byte copies', () => {
    const first = canonicalRecordJson({ x: 1 });
    expect(first).toEqual(success(utf8('{"x":1}')));
    if (!first.ok) return;
    first.value[0] = 0;
    expect(canonicalRecordJson({ x: 1 })).toEqual(success(utf8('{"x":1}')));
  });

  it('preserves prototype-like decoded keys as data without altering prototypes', async () => {
    const text = '{"__proto__":{"x":1},"constructor":2}';
    const parsed = parseRecordJson(utf8(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(canonicalRecordJson(parsed.value)).toEqual(success(utf8(text)));
    expect(await hashRecordJson(parsed.value)).toEqual(success('e60a56211596fcee44c6b87d771fd1c3d2ebdb176e14f1d67a0f4ce5a90a5fd5'));
    expect(Object.prototype).not.toHaveProperty('x');
  });

  it.each([undefined, NaN, Infinity, -Infinity, -0, -1, 0.1, Number.MAX_SAFE_INTEGER + 1, 1n, Symbol('x'), () => 1, new Date(0), '\uD800', '\uDC00'])('explicitly refuses unsupported canonical values %#', async (value) => {
    expect(canonicalRecordJson(value).ok).toBe(false);
    expect((await hashRecordJson(value)).ok).toBe(false);
  });

  it('refuses nested undefined, sparse arrays, hidden/symbol properties and cycles', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const sparse: unknown[] = [];
    sparse.length = 2;
    sparse[1] = 1;
    for (const value of [{ x: undefined }, sparse, Object.defineProperty({}, 'x', { value: 1 }), { [Symbol('x')]: 1 }, cycle]) {
      expect(canonicalRecordJson(value).ok).toBe(false);
    }
  });

  it('refuses accessors and toJSON hooks without executing them', () => {
    let calls = 0;
    const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { calls++; return 1; } });
    const hook = { toJSON() { calls++; return { x: 1 }; } };
    expect(canonicalRecordJson(getter).ok).toBe(false);
    expect(canonicalRecordJson(hook).ok).toBe(false);
    expect(calls).toBe(0);
  });

  it('supports shared acyclic objects without changing input', () => {
    const shared = { x: 1 };
    expect(canonicalRecordJson([shared, shared])).toEqual(success(utf8('[{"x":1},{"x":1}]')));
    expect(shared).toEqual({ x: 1 });
  });

  it.each([
    ['subclass empty', 'canonical'], ['subclass empty', 'hash'],
    ['subclass nested', 'canonical'], ['subclass nested', 'hash'],
    ['custom empty', 'canonical'], ['custom empty', 'hash'],
    ['custom nested', 'canonical'], ['custom nested', 'hash'],
    ['null empty', 'canonical'], ['null empty', 'hash'],
    ['null nested', 'canonical'], ['null nested', 'hash'],
  ])('refuses %s array prototype through %s without inherited hooks', async (kind, operation) => {
    let calls = 0;
    class CustomArray extends Array<number> {
      get inherited(): number { calls++; return 1; }
      toJSON(): number[] { calls++; return []; }
    }
    const custom = Object.create(Array.prototype, {
      toJSON: { get() { calls++; return () => { calls++; return []; }; } },
    }) as object;
    let array: number[];
    if (kind.startsWith('subclass')) array = new CustomArray();
    else array = Object.setPrototypeOf([], kind.startsWith('custom') ? custom : null) as number[];
    if (kind.endsWith('nested')) Object.defineProperty(array, '0', { value: 2, enumerable: true, writable: true, configurable: true });
    const value: unknown = kind.endsWith('nested') ? { outer: [array] } : array;
    const result = operation === 'hash' ? await hashRecordJson(value) : canonicalRecordJson(value);
    expect(result).toEqual({ ok: false, reason: 'value' });
    expect(calls).toBe(0);
    expect(Object.getOwnPropertyDescriptor(array, '0')?.value).toBe(kind.endsWith('nested') ? 2 : undefined);
  });

  it.each(['[]', '[1,2]', '{"outer":[[],[2]]}'])('keeps ordinary parsed arrays valid for %s', async (text) => {
    const parsed = parseRecordJson(utf8(text));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(canonicalRecordJson(parsed.value)).toEqual(success(utf8(text)));
    expect((await hashRecordJson(parsed.value)).ok).toBe(true);
  });

  it('keeps raw content hashes distinct from canonical string hashes', async () => {
    expect(await hashRecordJson('abc')).toEqual(success('6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25'));
    expect(await sha256(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hashRecordJson('é')).toEqual(success('f2886017e9c7abacf804b54d64787dce2b611c9544ba21f3affdd126a6e50086'));
    expect(await hashRecordJson('e\u0301')).toEqual(success('3d68ce21f2899a475713cdbe7562ba9bdb6b1dfde8af1f221bdff4a0935b53b2'));
  });

  it.each([
    ['declaration', '6f4d484c644dd6b541967ea60ad56ed508d8ec520ac2c99a1b3a075afa00aca1'],
    ['manifest', '9badff317145d753071b77cb70bd17c13ac745047180d0e0b6e341c1a1eef088'],
  ])('reopens the ratified literal %s with its independent digest', async (key, golden) => {
    const path = 'testing/fixtures/run-recovery-contract/01-admission-reopen.json';
    const packet = JSON.parse(readFileSync(path, 'utf8')) as { input: Record<string, unknown> };
    const record = packet.input[key];
    expect(await hashRecordJson(record)).toEqual(success(golden));
    const encoded = canonicalRecordJson(record);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const reopened = parseRecordJson(encoded.value);
    expect(reopened).toEqual(success(record));
    if (reopened.ok) expect(await hashRecordJson(reopened.value)).toEqual(success(golden));
  });
});
