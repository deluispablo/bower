import { describe, expect, it } from 'vitest';
import { forget, get, keep } from './draft-files';

describe('the files of an Add draft', () => {
  it('keep then get returns the file, and forget drops it', () => {
    const b = new Blob(['receipt']);
    keep('d1', b);
    expect(get('d1')).toBe(b);
    expect(get('d1')).toBe(b);
    forget('d1');
    expect(get('d1')).toBeUndefined();
  });

  it('a draft from before a reload has no file', () => {
    expect(get('never-kept')).toBeUndefined();
  });
});
