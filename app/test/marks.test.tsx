// @vitest-environment jsdom

/** The v4 marks (#579): sizes, tints, grey kinds, tags and aria-hidden. */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FolderIcon,
  FolderMark,
  OriginSquare,
} from '../src/components/folder-mark.js';
import type { OriginKind, ParaKind } from '../src/components/folder-mark.js';
import { KIND_BADGES, KindBadge } from '../src/components/kind-badge.js';
import type { FileKind } from '../src/components/kind-badge.js';
import { BowerTag, NewTag } from '../src/components/tags.js';

let root: HTMLDivElement;

afterEach(() => {
  render(null, root);
  root.remove();
});

async function mount(node: preact.VNode): Promise<HTMLDivElement> {
  root = document.createElement('div');
  document.body.append(root);
  await act(() => {
    render(node, root);
  });
  return root;
}

const PARA: [ParaKind, string][] = [
  ['projects', 'P'],
  ['areas', 'A'],
  ['resources', 'R'],
  ['archives', 'A'],
];

describe('FolderMark', () => {
  it.each(PARA)('%s shows its letter', async (kind, letter) => {
    const el = (await mount(<FolderMark kind={kind} size={28} />))
      .firstElementChild;
    expect(el?.textContent).toBe(letter);
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('inbox shows the tray icon, not a letter', async () => {
    const el = (await mount(<FolderMark kind="inbox" size={28} />))
      .firstElementChild;
    expect(el?.querySelector('svg')).not.toBeNull();
    expect(el?.textContent).toBe('');
  });

  it.each([18, 28, 40] as const)('renders at %i px', async (size) => {
    const el = (await mount(<FolderMark kind="projects" size={size} />))
      .firstElementChild;
    expect(el?.classList.contains(`folder-mark-${size}`)).toBe(true);
  });
});

describe('FolderIcon', () => {
  it('tints by top folder', async () => {
    const el = (await mount(<FolderIcon tint="areas" />)).firstElementChild;
    expect(el?.classList.contains('folder-icon-areas')).toBe(true);
    expect(el?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is grey without a tint', async () => {
    const el = (await mount(<FolderIcon />)).firstElementChild;
    expect(el?.className).toBe('folder-icon');
  });
});

describe('KindBadge', () => {
  it.each(Object.keys(KIND_BADGES) as FileKind[])(
    '%s is a grey text badge',
    async (kind) => {
      const el = (await mount(<KindBadge kind={kind} />)).firstElementChild;
      expect(el?.className).toBe('kind-badge');
      expect(el?.textContent).toBe(KIND_BADGES[kind]);
      expect(el?.getAttribute('aria-hidden')).toBeNull();
    },
  );
});

describe('OriginSquare', () => {
  const origins: OriginKind[] = ['file', 'notes', 'web', 'you'];

  it('renders four origins with distinct icons, aria-hidden', async () => {
    const paths = new Set<string>();
    for (const origin of origins) {
      const el = (await mount(<OriginSquare origin={origin} />))
        .firstElementChild;
      expect(el?.getAttribute('aria-hidden')).toBe('true');
      expect(el?.classList.contains(`origin-square-${origin}`)).toBe(true);
      paths.add(el?.querySelector('svg')?.innerHTML ?? '');
      render(null, root);
      root.remove();
    }
    expect(paths.size).toBe(4);
    root = document.createElement('div');
  });
});

describe('tags', () => {
  it('BowerTag says Bower', async () => {
    const el = (await mount(<BowerTag />)).firstElementChild;
    expect(el?.textContent).toContain('Bower');
    expect(el?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('NewTag says New, or "5 new" on a folder', async () => {
    expect((await mount(<NewTag />)).textContent).toBe('New');
    render(null, root);
    await act(() => {
      render(<NewTag count={5} />, root);
    });
    expect(root.textContent).toBe('5 new');
  });
});
