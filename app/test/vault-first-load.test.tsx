// @vitest-environment jsdom

/**
 * The first load after sign-in (#922): however the session's updates
 * arrive (a vault set after the first render, a refresh that replaces
 * `me` with the same vault, a refresh that briefly loses it), the vault
 * provider lists Drive and the index resolves.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../src/api.js';
import type { DriveFile } from '../src/drive.js';
import { FOLDER_MIME } from '../src/drive.js';

let me: Me | undefined;
vi.mock('../src/session.js', () => ({ useSession: () => ({ me }) }));

const listing: DriveFile[] = [
  {
    id: 'projects',
    name: '1-Projects',
    mimeType: FOLDER_MIME,
    parents: ['FOLDER_ID'],
    path: '1-Projects',
    modifiedTime: '2026-09-30T10:00:00Z',
  },
];
const listVault = vi.fn((folderId: string) =>
  Promise.resolve(folderId === 'FOLDER_ID' ? listing : []),
);
vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  listVault: (folderId: string) => listVault(folderId),
}));
// A device cache that never answers (IndexedDB stuck after a fresh sign-in).
let stuckCache = false;
const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
vi.mock('../src/cache.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/cache.js')>();
  return {
    ...real,
    loadIndex: () => (stuckCache ? never() : real.loadIndex()),
    saveIndex: (files: DriveFile[], at: string) =>
      stuckCache ? never<void>() : real.saveIndex(files, at),
  };
});
vi.mock('../src/file-facts.js', () => ({
  clearFileFacts: () => undefined,
  readFileFacts: () => Promise.resolve(new Map()),
}));

const { VaultProvider, useVault } = await import('../src/vault-store.js');

const vault = {
  folderId: 'FOLDER_ID',
  inboxFolderId: 'INBOX_FOLDER_ID',
  name: 'Bower',
};
const signedIn = (withVault: boolean): Me =>
  ({
    email: 'you@example.com',
    vault: withVault ? { ...vault } : null,
    quota: { used: 0, limit: 10 },
  }) as unknown as Me;

function Probe(): h.JSX.Element {
  const { index, status } = useVault();
  return (
    <p>
      {index === null ? 'none' : `folders ${String(index.folders.length)}`} ·{' '}
      {status}
    </p>
  );
}

let root: HTMLDivElement;

function paint(): void {
  render(
    <VaultProvider>
      <Probe />
    </VaultProvider>,
    root,
  );
}

async function settle(): Promise<void> {
  for (let at = 0; at < 20; at += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  listVault.mockClear();
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('the vault loads once me.vault is known (#922)', () => {
  it('lists Drive when the vault arrives after the first render', async () => {
    me = signedIn(false);
    await act(paint);
    await settle();
    expect(listVault).not.toHaveBeenCalled();

    me = signedIn(true); // onboarding's setMe after POST /vault
    await act(paint);
    await settle();
    expect(listVault).toHaveBeenCalledWith('FOLDER_ID');
    expect(root.textContent).toContain('folders 1');
  });

  it('keeps the index when a refresh replaces me with the same vault', async () => {
    me = signedIn(true);
    await act(paint);
    await settle();
    expect(root.textContent).toContain('folders 1');

    me = signedIn(true); // the session's refresh(): a new object, same vault
    await act(paint);
    await settle();
    expect(root.textContent).toContain('folders 1');
  });

  it('lists Drive even when the device cache never answers', async () => {
    stuckCache = true;
    try {
      me = signedIn(false);
      await act(paint);
      me = signedIn(true);
      await act(paint);
      await settle();
      expect(listVault).toHaveBeenCalledWith('FOLDER_ID');
      expect(root.textContent).toContain('folders 1 · idle');
    } finally {
      stuckCache = false;
    }
  });

  it('still loads when a refresh briefly loses the vault (409, then 200)', async () => {
    me = signedIn(false);
    await act(paint);
    me = signedIn(true);
    await act(paint);
    me = signedIn(false); // a refresh that started before POST /vault
    await act(paint);
    me = signedIn(true); // the 200
    await act(paint);
    await settle();
    expect(root.textContent).toContain('folders 1');
    expect(root.textContent).toContain('idle');
  });
});
