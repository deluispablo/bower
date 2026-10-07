import { describe, expect, it } from 'vitest';
import { isAdmissionManifest, type AdmissionManifest } from './admission';

const item = { fileId: 'f1', name: 'receipt.pdf', parents: ['inbox'], modifiedTime: '2026-10-07T08:00:00.000Z' };
const manifest: AdmissionManifest = {
  v: 1,
  id: 'admission-1',
  rootId: 'FOLDER_ID',
  scope: 'all',
  at: 1,
  piles: [{ pileId: 'p1', anchor: null, declaration: { declarationId: 'd1', sha256: 'a'.repeat(64) }, items: [item] }],
  journal: [item],
};

describe('admission manifest shape', () => {
  it('an admission manifest is checked before it is trusted', () => {
    expect(isAdmissionManifest(manifest)).toBe(true);
    expect(isAdmissionManifest(JSON.parse(JSON.stringify(manifest)))).toBe(true);
    for (const bad of [null, [], { ...manifest, v: 2 }, { ...manifest, scope: 'some' }, { ...manifest, piles: [{ ...manifest.piles[0], items: [{ ...item, parents: 'inbox' }] }] }, { ...manifest, journal: [{ fileId: '' }] }, { ...manifest, piles: [{ ...manifest.piles[0], declaration: { declarationId: 'd1', sha256: 'x' } }] }]) {
      expect(isAdmissionManifest(bad)).toBe(false);
    }
  });
});
