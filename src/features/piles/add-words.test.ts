import { describe, expect, it } from 'vitest';
import { draftLine } from './add-words';

describe('the words of Add', () => {
  it('an empty file is pointed out under its name', () => {
    expect(draftLine({ origin: 'Chosen here', missing: false, empty: true })).toBe('This file is empty. Add it anyway, or take it out.');
    expect(draftLine({ origin: 'Chosen here', missing: false, empty: false })).toBe('Chosen here');
    expect(draftLine({ origin: 'Chosen here', missing: true, empty: false })).toBe('Add this file again');
  });
});
