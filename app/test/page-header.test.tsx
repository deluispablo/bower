// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { revealRequest } from '../src/reveal.js';

const route = vi.fn();
vi.mock('preact-iso', () => ({
  useLocation: () => ({ path: '/', query: {}, route }),
}));

const { PageHeader, HOME_CRUMBS, crumbsFor } =
  await import('../src/components/page-header.js');
const { metaLine } = await import('../src/meta-line.js');

let root: HTMLDivElement;

function mount(props: Parameters<typeof PageHeader>[0]): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(PageHeader, props), root);
  });
}

function stubWide(wide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query === '(min-width: 1200px)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const more = { expanded: false, onClick: (): void => undefined };

beforeEach(() => {
  route.mockClear();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
  vi.unstubAllGlobals();
});

describe('PageHeader (R-HEADER-1..4)', () => {
  it('shows the title once, with ⋯ right after it on the same row', () => {
    mount({ title: 'Moonee Ponds', kind: 'folder', more });
    const headings = root.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('Moonee Ponds');
    const row = root.querySelector('.page-header-title-row');
    const buttons = row?.querySelector('.page-header-buttons');
    expect(headings[0]?.nextElementSibling).toBe(buttons);
    expect(buttons?.querySelector('[aria-label="More"]')).not.toBeNull();
    expect(root.textContent?.match(/Moonee Ponds/g)).toHaveLength(1);
  });

  it('puts (i) before ⋯ on a note and a file below 1200 px', () => {
    mount({ title: 'CV insights', kind: 'note', more, onAbout: () => {} });
    const labels = Array.from(
      root.querySelectorAll('.page-header-buttons button'),
    ).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['About this note', 'More']);
  });

  it('has no (i) on a folder, nor from 1200 px on a file', () => {
    mount({ title: 'Areas', kind: 'folder', more, onAbout: () => {} });
    expect(root.querySelector('.page-header-about')).toBeNull();
    void act(() => {
      render(null, root);
    });
    root.remove();
    stubWide(true);
    mount({ title: 'Passport copy', kind: 'file', more, onAbout: () => {} });
    expect(root.querySelector('.page-header-about')).toBeNull();
  });

  it('shows the parents only in the breadcrumb, never the page itself', () => {
    const parents = crumbsFor('1-Projects/Housing Search/Moonee Ponds');
    mount({ title: 'Moonee Ponds', kind: 'folder', crumbs: parents });
    const texts = Array.from(root.querySelectorAll('.page-header-crumbs a'))
      .map((a) => a.textContent)
      .join(' / ');
    expect(texts).toBe('Projects / Housing Search');
    expect(root.querySelector('.page-header-crumbs')?.textContent).toBe(
      'Projects / Housing Search',
    );
  });

  it('reads Home on Settings and Just filed', () => {
    mount({ title: 'Settings', crumbs: HOME_CRUMBS, more });
    const link = root.querySelector<HTMLAnchorElement>('.page-header-crumbs a');
    expect(link?.textContent).toBe('Home');
    expect(link?.getAttribute('href')).toBe('/');
  });

  it('reads "Your folders" on a root folder and reveals the tree (E-17)', () => {
    mount({ title: 'Areas', kind: 'folder', rootPath: '2-Areas', more });
    const link = root.querySelector<HTMLAnchorElement>('.page-header-crumbs a');
    expect(link?.textContent).toBe('Your folders');
    void act(() => {
      link?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    // #909: the crumb calls revealInFolders instead of #930's route adapter.
    expect(route).not.toHaveBeenCalled();
    expect(revealRequest()).toMatchObject({ path: '2-Areas' });
    expect(revealRequest()?.id).toBeUndefined();
  });

  it('shows the meta line with the root dot, the purpose and the tabs', () => {
    const meta = metaLine(
      {
        mimeType: 'application/vnd.google-apps.folder',
        name: '2-Areas',
        root: 'areas',
        rootName: '2-Areas',
        count: 1,
        countUnit: 'folder',
      },
      { view: 'title', now: '2026-09-30T08:00:00Z' },
    );
    mount({
      title: 'Areas',
      kind: 'folder',
      meta,
      purpose: 'Parts of life that go on: home, health, money',
      tabs: h('span', null, 'List'),
    });
    const line = root.querySelector('.page-header-meta');
    expect(line?.textContent).toBe('Areas · 1 folder');
    expect(line?.querySelector('[data-root="areas"]')).not.toBeNull();
    expect(root.querySelector('.page-header-purpose')?.textContent).toBe(
      'Parts of life that go on: home, health, money',
    );
    expect(root.querySelector('.page-header-tabs')?.textContent).toBe('List');
  });
});
