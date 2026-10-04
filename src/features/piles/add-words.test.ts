import { describe, expect, it } from 'vitest';
import { draftLine, leftOut } from './add-words';

describe('the words of Add', () => {
  it('an empty file is pointed out under its name', () => {
    expect(draftLine({ origin: 'Chosen here', missing: false, empty: true })).toBe('This file is empty. Add it anyway, or take it out.');
    expect(draftLine({ origin: 'Chosen here', missing: false, empty: false })).toBe('Chosen here');
    expect(draftLine({ origin: 'Chosen here', missing: true, empty: false })).toBe('Add this file again');
  });
  it('files not added again are named when the pile goes in', () => {
    expect(leftOut(['scan.pdf'])).toBe('scan.pdf was left out: choose it again to add it.');
    expect(leftOut(['a.pdf', 'b.jpg'])).toBe('2 files were left out (a.pdf, b.jpg): choose them again to add them.');
    expect(leftOut([])).toBeNull();
  });
});
