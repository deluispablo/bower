import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  folderStatuses,
  hubNotePath,
  statusOptions,
} from '../src/folder-statuses.js';

const KIND = { statuses: ['new', 'to view', 'viewed', 'applied', 'rejected'] };

function hub(line: string): string {
  return `---\ntags: [project, hub]\n${line}\n---\n# Flats\n`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hubNotePath', () => {
  it('is the note named after the folder, inside it', () => {
    expect(hubNotePath('1-Projects/Flats/Moonee Ponds')).toBe(
      '1-Projects/Flats/Moonee Ponds/Moonee Ponds.md',
    );
    expect(hubNotePath('1-Projects/Flats/')).toBe('1-Projects/Flats/Flats.md');
  });
});

describe('folderStatuses', () => {
  it("uses the folder's own list from its hub note", () => {
    expect(
      folderStatuses(
        hub('statuses: [new, to view, viewed, not for me, turned down]'),
        KIND,
      ),
    ).toEqual(['new', 'to view', 'viewed', 'not for me', 'turned down']);
  });

  it('reads a block list too', () => {
    expect(
      folderStatuses(hub('statuses:\n  - new\n  - applied\n  - offer'), KIND),
    ).toEqual(['new', 'applied', 'offer']);
  });

  it("falls back to the kind's list without a hub note or a statuses line", () => {
    expect(folderStatuses(undefined, KIND)).toEqual(KIND.statuses);
    expect(folderStatuses(null, KIND)).toEqual(KIND.statuses);
    expect(folderStatuses(hub('status: active'), KIND)).toEqual(KIND.statuses);
    expect(folderStatuses('no frontmatter at all', KIND)).toEqual(
      KIND.statuses,
    );
  });

  it("falls back to the kind's list, and says why, when the list is malformed", () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const line of [
      'statuses: new',
      'statuses: []',
      'statuses: [new, New]',
      'statuses: [new, new]',
      'statuses: [new, 3]',
      `statuses: [new, ${'x'.repeat(25)}]`,
    ]) {
      expect(folderStatuses(hub(line), KIND)).toEqual(KIND.statuses);
    }
    expect(log).toHaveBeenCalledTimes(6);
  });

  it('takes a status of exactly 24 characters, as the runner does', () => {
    const long = 'x'.repeat(24);
    expect(folderStatuses(hub(`statuses: [new, ${long}]`), KIND)).toEqual([
      'new',
      long,
    ]);
  });

  it('never throws on a broken note', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      folderStatuses('---\nstatuses: [new, "to view\n', KIND),
    ).not.toThrow();
  });
});

describe('statusOptions', () => {
  it('keeps an unknown current value as an extra option at the end', () => {
    expect(statusOptions(['new', 'applied'], 'declined')).toEqual([
      'new',
      'applied',
      'declined',
    ]);
  });

  it('adds nothing for a known or empty value', () => {
    expect(statusOptions(['new', 'applied'], 'applied')).toEqual([
      'new',
      'applied',
    ]);
    expect(statusOptions(['new', 'applied'], '')).toEqual(['new', 'applied']);
  });
});
