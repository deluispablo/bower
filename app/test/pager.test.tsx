// @vitest-environment jsdom

/**
 * The n of N footer (#912, R-PAGER-1, NO-Bottom and FI-Bottom): the place,
 * the count and the next item come from the one sibling list in tree order
 * (`siblings()`), so the cover letter and CV insights in one folder agree.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DriveFile } from '../src/drive.js';
import { siblings } from '../src/folder-view.js';
import { buildTree } from '../src/navigation.js';
import { buildVaultIndex } from '../src/vault-index.js';

vi.mock('../src/cache.js', () => ({
  loadNote: () => Promise.resolve(undefined),
}));

const { Pager, pagerCount, pagerPlace } =
  await import('../src/components/pager.js');

const FOLDER = '1-Projects/Job Search Australia';

function item(name: string, mimeType: string): DriveFile {
  return {
    id: `id-${name}`,
    name,
    mimeType,
    parents: ['FOLDER_ID'],
    path: `${FOLDER}/${name}`,
    modifiedTime: '2026-09-29T10:00:00Z',
  };
}

const HUB = item('Job Search Australia.md', 'text/markdown');
const LETTER = item('Cover Letter - Alex.pdf', 'application/pdf');
const INSIGHTS = item('CV insights.md', 'text/markdown');
const LINKEDIN = item('LinkedIn profile.md', 'text/markdown');
const RESUME = item(
  'Resume Australia.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
);
const SEEK = item('SEEK profile.md', 'text/markdown');

const index = buildVaultIndex([SEEK, RESUME, LINKEDIN, INSIGHTS, LETTER, HUB]);
const items = siblings(INSIGHTS, buildTree(index));

let root: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    render(null, root);
    root.remove();
  }
});

async function mount(id: string): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = host;
  await act(() => {
    render(
      h(Pager, {
        id,
        items,
        folder: { name: 'Job Search Australia', href: '/folder/x' },
      }),
      host,
    );
  });
  return host;
}

describe('pagerPlace and pagerCount', () => {
  it('reads n, N and the neighbours from the sibling list', () => {
    const place = pagerPlace(items, INSIGHTS.id);
    expect(place?.position).toBe(3);
    expect(place?.total).toBe(6);
    expect(place?.prev?.id).toBe(LETTER.id);
    expect(place?.next?.id).toBe(LINKEDIN.id);
    if (place === null) throw new Error('no place');
    expect(pagerCount(place, 'Job Search Australia')).toBe(
      '3 of 6 in Job Search Australia',
    );
    expect(pagerPlace(items, 'missing')).toBeNull();
  });
});

describe('Pager', () => {
  it('shows "3 of 6" on CV insights, next "LinkedIn profile"', async () => {
    const host = await mount(INSIGHTS.id);
    expect(host.querySelector('.pager-count')?.textContent).toBe(
      '3 of 6 in Job Search Australia',
    );
    expect(host.querySelector('.pager-next-name')?.textContent).toBe(
      'LinkedIn profile',
    );
    expect(host.querySelector('.pager-next')?.getAttribute('aria-label')).toBe(
      'Next: LinkedIn profile',
    );
    expect(host.querySelector('.pager-prev')?.getAttribute('aria-label')).toBe(
      'Previous: Cover Letter - Alex',
    );
    expect(host.textContent).not.toContain('to move');
  });

  it('shows "2 of 6" on the cover letter, next "CV insights", from the same list', async () => {
    const host = await mount(LETTER.id);
    expect(host.querySelector('.pager-count')?.textContent).toBe(
      '2 of 6 in Job Search Australia',
    );
    expect(host.querySelector('.pager-next-name')?.textContent).toBe(
      'CV insights',
    );
    expect(host.querySelector('.pager-next')?.getAttribute('href')).toBe(
      `/note/${INSIGHTS.id}`,
    );
    expect(host.querySelector('.pager-prev')?.getAttribute('href')).toBe(
      `/note/${HUB.id}`,
    );
  });

  it('has no previous arrow on the first item and no next on the last', async () => {
    const first = await mount(HUB.id);
    expect(first.querySelector('.pager-prev')).toBeNull();
    render(null, first);
    first.remove();
    const last = await mount(SEEK.id);
    expect(last.querySelector('.pager-next')).toBeNull();
    expect(last.querySelector('.pager-count')?.textContent).toBe(
      '6 of 6 in Job Search Australia',
    );
  });
});
