// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FOLDER_MIME } from '../src/drive.js';
import type { DriveFile } from '../src/drive.js';
import {
  closeFoldersDrawer,
  foldersDrawerState,
} from '../src/folders-drawer.js';
import {
  ancestorsOf,
  lastTarget,
  mergeExpanded,
  rememberTarget,
  revealHref,
  revealInFolders,
  revealRequest,
  subscribeReveal,
  targetFromReveal,
  targetFromRoute,
} from '../src/reveal.js';
import { buildVaultIndex } from '../src/vault-index.js';

function entry(id: string, path: string, mimeType: string): DriveFile {
  return {
    id,
    name: path.split('/').pop() ?? path,
    mimeType,
    parents: ['PARENT'],
    path,
  };
}

const index = buildVaultIndex([
  entry('d1', '1-Projects', FOLDER_MIME),
  entry('d2', '1-Projects/Flat hunt', FOLDER_MIME),
  entry('n1', '1-Projects/Flat hunt/Viewing.md', 'text/markdown'),
  entry('f1', '1-Projects/Flat hunt/Lease.pdf', 'application/pdf'),
]);

describe('ancestorsOf', () => {
  it('lists the folders above a note, top first', () => {
    expect(ancestorsOf('1-Projects/Flat hunt/Viewing.md')).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
    ]);
  });

  it('lists the folders above a folder, not the folder itself', () => {
    expect(ancestorsOf('1-Projects/Flat hunt')).toEqual(['1-Projects']);
  });

  it('gives nothing for a top-level path', () => {
    expect(ancestorsOf('1-Projects')).toEqual([]);
    expect(ancestorsOf('')).toEqual([]);
  });
});

describe('mergeExpanded', () => {
  it('adds the new paths and keeps every open one', () => {
    const open = new Set(['Areas', '1-Projects']);
    const next = mergeExpanded(open, ['1-Projects', '1-Projects/Flat hunt']);
    expect([...next].sort()).toEqual([
      '1-Projects',
      '1-Projects/Flat hunt',
      'Areas',
    ]);
    expect(open.size).toBe(2);
  });

  it('returns the same set when nothing is new', () => {
    const open = new Set(['1-Projects']);
    expect(mergeExpanded(open, ['1-Projects'])).toBe(open);
    expect(mergeExpanded(open, [])).toBe(open);
  });
});

describe('targetFromRoute', () => {
  it('finds a note and a file by id', () => {
    expect(targetFromRoute('/note/n1', index)).toEqual({
      kind: 'note',
      id: 'n1',
      path: '1-Projects/Flat hunt/Viewing.md',
    });
    expect(targetFromRoute('/file/f1', index)?.kind).toBe('file');
  });

  it('decodes a folder path', () => {
    expect(targetFromRoute('/folder/1-Projects/Flat%20hunt', index)).toEqual({
      kind: 'folder',
      path: '1-Projects/Flat hunt',
    });
  });

  it('gives null for other routes and for an unknown id', () => {
    expect(targetFromRoute('/notes', index)).toBeNull();
    expect(targetFromRoute('/note/nope', index)).toBeNull();
    expect(targetFromRoute('/note/n1', null)).toBeNull();
    expect(targetFromRoute('/folder/', index)).toBeNull();
  });
});

describe('revealHref', () => {
  it('round-trips a note, a file and a folder', () => {
    for (const target of [
      targetFromRoute('/note/n1', index),
      targetFromRoute('/file/f1', index),
      targetFromRoute('/folder/1-Projects/Flat%20hunt', index),
    ]) {
      if (target === null) throw new Error('target missing');
      const href = revealHref(target);
      expect(href.startsWith('/notes?reveal=')).toBe(true);
      const value = new URL(href, 'https://example.com').searchParams.get(
        'reveal',
      );
      expect(targetFromReveal(value ?? undefined, index)).toEqual(target);
    }
  });

  it('reads nothing from a missing or blank value', () => {
    expect(targetFromReveal(undefined, index)).toBeNull();
    expect(targetFromReveal('', index)).toBeNull();
  });
});

describe('the last target', () => {
  it('is kept, and a null does not clear it', () => {
    const target = targetFromRoute('/note/n1', index);
    rememberTarget(target);
    rememberTarget(null);
    expect(lastTarget()).toEqual(target);
  });
});

describe('revealInFolders (#909)', () => {
  afterEach(() => {
    closeFoldersDrawer();
    vi.unstubAllGlobals();
  });

  function screen(desktop: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: desktop && query.includes('900px'),
    }));
  }

  it('opens the drawer on the phone and tells the explorers what to show', () => {
    screen(false);
    const heard: unknown[] = [];
    const stop = subscribeReveal(() => heard.push(revealRequest()));
    revealInFolders('1-Projects/Flat hunt/Viewing.md', 'n1');
    stop();
    expect(foldersDrawerState().open).toBe(true);
    expect(heard).toHaveLength(1);
    expect(revealRequest()).toMatchObject({
      path: '1-Projects/Flat hunt/Viewing.md',
      id: 'n1',
      at: window.location.pathname,
    });
    expect(lastTarget()).toMatchObject({ id: 'n1' });
  });

  it('leaves the drawer shut on desktop (the sidebar shows it) and counts requests', () => {
    screen(true);
    const before = revealRequest()?.seq ?? 0;
    revealInFolders('1-Projects');
    expect(foldersDrawerState().open).toBe(false);
    expect(revealRequest()).toMatchObject({ path: '1-Projects' });
    expect(revealRequest()?.id).toBeUndefined();
    expect(revealRequest()?.seq).toBe(before + 1);
  });
});
