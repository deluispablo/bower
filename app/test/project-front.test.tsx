// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProjectFront,
  bestSoFar,
  goalOf,
  parseSteps,
  projectNoteOf,
  referenceEntries,
  rowLine,
  statusOf,
  tickStep,
  updatedLine,
} from '../src/components/project-front.js';
import { defaultSort, extraColumns, sortNotes } from '../src/compare.js';
import type { CompareNote } from '../src/compare.js';
import { SaveError } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import { kindById } from '../src/kinds.js';
import { currentToast, dismissToast } from '../src/toast-store.js';

const NOTE = `---
status: active
---
# Job search

## Goal
A data lead role in the north by December.

## Next steps
- [ ] Apply to Northwind before 14 Oct
- [x] Update the CV job title
- [ ] Ask Fabrikam about the Manchester days

## Reference
### Salary guide
| Role | Median |
| --- | --- |
| Data lead | 70000 |

### Skills that keep coming up
- SQL

## History
- 30 Sep · Filed
`;

function offer(
  id: string,
  score: number | undefined,
  extra: Record<string, unknown> = {},
): CompareNote {
  return {
    id,
    name: `${id}.md`,
    modifiedTime: null,
    kind: 'job-offer',
    fields: { ...(score === undefined ? {} : { score }), ...extra },
    bowerOrigins: {},
  };
}

describe('project note sections', () => {
  it('reads the steps with their line and state', () => {
    const steps = parseSteps(NOTE);
    expect(steps.map((s) => [s.text, s.done])).toEqual([
      ['Apply to Northwind before 14 Oct', false],
      ['Update the CV job title', true],
      ['Ask Fabrikam about the Manchester days', false],
    ]);
    expect(NOTE.split('\n')[steps[0]?.line ?? 0]).toContain('Northwind');
  });

  it('ignores steps outside Next steps', () => {
    expect(parseSteps('## Other\n- [ ] no\n')).toEqual([]);
  });

  it('reads goal, status and reference entries', () => {
    expect(goalOf(NOTE)).toBe('A data lead role in the north by December.');
    expect(statusOf(NOTE)).toBe('Active');
    expect(referenceEntries(NOTE).map((e) => e.title)).toEqual([
      'Salary guide',
      'Skills that keep coming up',
    ]);
    expect(referenceEntries(NOTE)[0]?.body).toContain('| Data lead |');
  });

  it('finds the project note by the folder name', () => {
    const files = [{ id: '1', name: 'Job search.md' }] as DriveFile[];
    expect(projectNoteOf('Job search', files)?.id).toBe('1');
    expect(projectNoteOf('Flat hunt', files)).toBeUndefined();
  });

  it('ticks one line and leaves every other byte alone', () => {
    const steps = parseSteps(NOTE);
    const line = steps[0]?.line ?? 0;
    const next = tickStep(NOTE, line, true);
    expect(next).toBe(
      NOTE.replace('- [ ] Apply to Northwind', '- [x] Apply to Northwind'),
    );
    expect(tickStep(next ?? '', line, false)).toBe(NOTE);
    expect(tickStep(NOTE, 2, true)).toBeNull();
  });

  it('keeps CRLF line endings', () => {
    const crlf = '## Next steps\r\n- [ ] One\r\n';
    expect(tickStep(crlf, 1, true)).toBe('## Next steps\r\n- [x] One\r\n');
  });

  it('says when the note was updated', () => {
    const now = Date.parse('2026-09-30T12:00:00Z');
    expect(updatedLine('2026-09-30T08:00:00Z', now)).toBe('updated today');
    expect(updatedLine('2026-09-26T08:00:00Z', now)).toBe('updated 26 Sep');
    expect(updatedLine(null, now)).toBe('');
  });
});

describe('Best so far', () => {
  it('orders like Compare and keeps three', () => {
    const notes = [
      offer('a', 60),
      offer('b', 91),
      offer('c', 78),
      offer('d', 85),
      offer('e', undefined),
    ];
    const best = bestSoFar(notes);
    const kind = kindById('job-offer');
    if (kind === undefined) throw new Error('kind');
    const extras = extraColumns(kind, notes);
    const compare = sortNotes(
      kind,
      notes,
      defaultSort(kind, extras),
      extras,
    ).map((n) => n.id);
    expect(best?.top.map((n) => n.id)).toEqual(['b', 'd', 'c']);
    expect(compare.slice(0, 3)).toEqual(['b', 'd', 'c']);
    expect(best?.total).toBe(5);
  });

  it('is null without scores and uses the note verdict words', () => {
    expect(bestSoFar([offer('a', undefined)])).toBeNull();
    const kind = kindById('job-offer');
    if (kind === undefined) throw new Error('kind');
    expect(
      rowLine(kind, offer('a', 80, { verdict: 'Apply first', status: 'new' })),
    ).toBe('Apply first · New');
  });
});

// --- The card ---------------------------------------------------------------

const vault = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({
    openNoteForEdit: vault.open,
    saveEditedNote: vault.save,
  }),
}));
vi.mock('../src/components/compare.js', () => ({
  loadCompareNotes: () =>
    Promise.resolve([offer('x', 82, { verdict: 'Worth a look' })]),
}));

const projectFile = {
  id: 'NOTE_ID',
  name: 'Job search.md',
  mimeType: 'text/markdown',
  parents: ['FOLDER_ID'],
  path: '1-Projects/Job search/Job search.md',
  modifiedTime: '2026-09-30T08:00:00Z',
} as DriveFile;

let host: HTMLElement;

async function mount(notes: DriveFile[] = [projectFile]): Promise<void> {
  await act(async () => {
    render(
      h(ProjectFront, {
        folderName: 'Job search',
        notes,
        para: 'projects',
        compare: { label: 'Compare 4 offers', onOpen: vi.fn() },
      }),
      host,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  vault.open.mockReset();
  vault.save.mockReset();
  vault.open.mockResolvedValue({
    text: NOTE,
    modifiedTime: '2026-09-30T08:00:00Z',
  });
  dismissToast();
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('ProjectFront', () => {
  it('renders the card from the project note', async () => {
    await mount();
    expect(host.textContent).toContain('A data lead role in the north');
    expect(host.textContent).toContain('Active');
    expect(host.textContent).toContain('Best so far');
    expect(host.textContent).toContain('Compare all 4 offers');
    expect(host.textContent).toContain('Salary guide');
    expect(host.textContent).toContain('In this folder');
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it('shows no card without a project note', async () => {
    await mount([]);
    expect(host.querySelector('.project-front')).toBeNull();
  });

  it('ticking saves the checkbox against the loaded modifiedTime', async () => {
    const ticked = NOTE.replace('- [ ] Apply', '- [x] Apply');
    vault.save.mockResolvedValue({
      text: ticked,
      modifiedTime: '2026-09-30T09:00:00Z',
    });
    await mount();
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => {
      box?.click();
    });
    expect(vault.save).toHaveBeenCalledWith('NOTE_ID', ticked, {
      baseModifiedTime: '2026-09-30T08:00:00Z',
    });
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(true);
  });

  it('rolls the tick back with a toast on a conflict', async () => {
    vault.save.mockRejectedValue(
      new SaveError('conflict', 'changed', '2026-09-30T09:30:00Z'),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => {
      box?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    expect(currentToast()?.message).toBe(
      'The project note changed. Your tick was not saved.',
    );
    errors.mockRestore();
  });
});
