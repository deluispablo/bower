import { describe, expect, it } from 'vitest';

import type { RequestRow } from '../src/bower-tab.js';
import {
  pendingByPath,
  renameRequestText,
  splitFileName,
  validateRename,
} from '../src/rename-request.js';

function row(
  text: string,
  over: Partial<RequestRow> = {},
): RequestRow {
  return {
    key: text,
    state: 'waiting',
    text,
    kind: 'job',
    since: '2026-09-29T10:00:00Z',
    fileId: 'NOTE_ID',
    ...over,
  };
}

describe('renameRequestText', () => {
  it('writes plain words plus the path, with no op fields', () => {
    expect(renameRequestText('1-Projects/Flat hunt/Offer.md', 'Offer 2.md')).toBe(
      'Rename 1-Projects/Flat hunt/Offer.md to Offer 2.md',
    );
  });
});

describe('splitFileName', () => {
  it('drops a note\'s .md and locks a file\'s extension', () => {
    expect(splitFileName('Offer.md', true)).toEqual({
      base: 'Offer',
      extension: '.md',
    });
    expect(splitFileName('Contract.v2.pdf', false)).toEqual({
      base: 'Contract.v2',
      extension: '.pdf',
    });
    expect(splitFileName('.hidden', false)).toEqual({
      base: '.hidden',
      extension: '',
    });
  });
});

describe('validateRename', () => {
  const base = {
    currentName: 'Offer.md',
    extension: '.md',
    siblingNames: ['Offer.md', 'Letter.md'],
  };
  it('accepts a new free name', () => {
    expect(validateRename({ ...base, input: 'Offer 2' })).toBeNull();
  });
  it('says each of the four messages', () => {
    expect(validateRename({ ...base, input: '  ' })).toBe('Give it a name.');
    expect(validateRename({ ...base, input: 'offer' })).toBe(
      'That is already its name.',
    );
    expect(validateRename({ ...base, input: 'letter' })).toBe(
      'Something in this folder already has that name.',
    );
    expect(validateRename({ ...base, input: 'a/b' })).toBe(
      'Names can\'t contain / \\ : * ? " < > |',
    );
  });
});

describe('pendingByPath', () => {
  it('reads a Rename and a Move by their path', () => {
    const map = pendingByPath([
      row('Rename 1-Projects/Flat hunt/Offer.md to Back to work.md'),
      row('Move “Letter” (Letter.md) to 2-Areas/Garden.', {
        fileId: 'MOVE_ID',
      }),
    ]);
    expect(map.get('1-Projects/Flat hunt/Offer.md')).toEqual({
      kind: 'rename',
      line: 'Renaming to Back to work at the next tidy-up',
      fileId: 'NOTE_ID',
    });
    expect(map.get('Letter.md')?.line).toBe(
      'Moving to Areas › Garden at the next tidy-up',
    );
  });
  it('leaves out finished, answered and unrelated rows', () => {
    const map = pendingByPath([
      row('Rename A.md to B.md', { state: 'done' }),
      row('Rename C.md to D.md', { state: 'tidying' }),
      row('What is in A.md?'),
    ]);
    expect(map.size).toBe(0);
  });
});
