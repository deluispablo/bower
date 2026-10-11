import { expect, it } from 'vitest';
import { sha256Sync } from './hashes';
import { opKey } from './op-key';

it('TL-P4-50 op keys hash the unambiguous root, run and op tuple', () => {
  expect(opKey('root', 'run', 'op')).toBe(sha256Sync('["root","run","op"]').slice(0, 12));
  expect(opKey('root', 'run', 'op')).toMatch(/^[a-f0-9]{12}$/u);
  expect(new Set([
    opKey('root', 'run', 'op'), opKey('other', 'run', 'op'),
    opKey('root', 'other', 'op'), opKey('root', 'run', 'other'),
    opKey('a', 'b,c', 'd'), opKey('a,b', 'c', 'd'),
  ]).size).toBe(6);
});
