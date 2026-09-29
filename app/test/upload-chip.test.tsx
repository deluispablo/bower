// @vitest-environment jsdom

import { render } from 'preact';
import type { VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SignOutUploadsDialog,
  UploadChip,
  signOutAnyway,
  uploadChipModel,
} from '../src/components/upload-chip.js';
import type { QueueItem } from '../src/upload-queue.js';

vi.mock('../src/drive.js', () => ({
  DRIVE_BASE: 'https://drive.test',
  RESUMABLE_CHUNK_BYTES: 8 * 1024 * 1024,
  getToken: () => Promise.resolve({ accessToken: 'TOKEN' }),
  invalidateToken: () => undefined,
}));

function item(id: string, patch: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    pileId: 'PILE',
    parentId: 'FOLDER_ID',
    name: `${id}.pdf`,
    size: 100,
    sent: 0,
    durable: true,
    state: 'uploading',
    ...patch,
  };
}

let host: HTMLElement | undefined;

function mount(vnode: VNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  void act(() => {
    render(vnode, host as HTMLElement);
  });
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

describe('uploadChipModel', () => {
  it('is nothing when nothing is on its way', () => {
    expect(
      uploadChipModel({
        items: [item('a', { state: 'done' }), item('b', { state: 'failed' })],
        resumed: [],
        online: true,
      }),
    ).toBeNull();
  });

  it('uploading: the count and the percentage of what is left', () => {
    const model = uploadChipModel({
      items: [item('a', { sent: 64 }), item('b', { sent: 64 })],
      resumed: [],
      online: true,
    });
    expect(model).toMatchObject({
      state: 'uploading',
      title: 'Adding 2 files',
      detail: '64%',
      name: 'Uploading 2 files to your inbox, 64 percent. Show',
      announce: 'Adding 2 files',
    });
  });

  it('one file reads in the singular', () => {
    const model = uploadChipModel({
      items: [item('a', { sent: 10 })],
      resumed: [],
      online: true,
    });
    expect(model?.title).toBe('Adding 1 file');
  });

  it('resuming: files an earlier visit left', () => {
    const model = uploadChipModel({
      items: [item('a', { state: 'waiting' })],
      resumed: ['a'],
      online: true,
    });
    expect(model).toMatchObject({
      state: 'resuming',
      title: 'Finishing 1 upload from last time',
      name: 'Finishing 1 upload from last time',
    });
    // One more file added now: back to the plain count.
    expect(
      uploadChipModel({
        items: [item('a', { state: 'waiting' }), item('b')],
        resumed: ['a'],
        online: true,
      })?.state,
    ).toBe('uploading');
  });

  it('offline: files that wait for a connection, in amber', () => {
    const model = uploadChipModel({
      items: [
        item('a', { state: 'waiting', error: 'offline' }),
        item('b', { state: 'waiting', error: 'offline' }),
      ],
      resumed: [],
      online: true,
    });
    expect(model).toMatchObject({
      state: 'offline',
      title: '2 files wait for a connection',
      name: '2 files wait for a connection',
    });
    const one = uploadChipModel({
      items: [item('a', { state: 'waiting' })],
      resumed: [],
      online: false,
    });
    expect(one?.title).toBe('1 file waits for a connection');
  });

  it('the announcement does not change with the percentage', () => {
    const at = (sent: number): string | undefined =>
      uploadChipModel({
        items: [item('a', { sent })],
        resumed: [],
        online: true,
      })?.announce;
    expect(at(10)).toBe(at(80));
  });
});

describe('UploadChip', () => {
  it('is a status region whose button carries the full name', () => {
    const model = uploadChipModel({
      items: [item('a', { sent: 50 })],
      resumed: [],
      online: true,
    });
    if (model === null) throw new Error('no model');
    const onOpen = vi.fn();
    const el = mount(<UploadChip model={model} onOpen={onOpen} />);
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    const button = el.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe(
      'Uploading 1 file to your inbox, 50 percent. Show',
    );
    void act(() => button?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('the sign-out dialog (R-UPL-4)', () => {
  it('says how many files, and offers Wait and Sign out anyway', () => {
    const onWait = vi.fn();
    const onSignOut = vi.fn();
    const el = mount(
      <SignOutUploadsDialog count={2} onWait={onWait} onSignOut={onSignOut} />,
    );
    const dialog = el.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('2 files are still uploading');
    expect(dialog?.textContent).toContain(
      'If you sign out now they stop, and this device forgets them.',
    );
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Wait',
      'Sign out anyway',
    ]);
    void act(() => buttons[0]?.click());
    expect(onWait).toHaveBeenCalledTimes(1);
    void act(() => buttons[1]?.click());
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('Escape is Wait', () => {
    const onWait = vi.fn();
    mount(
      <SignOutUploadsDialog count={1} onWait={onWait} onSignOut={vi.fn()} />,
    );
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onWait).toHaveBeenCalled();
  });

  it('"Sign out anyway" clears the queue, then signs out', async () => {
    const order: string[] = [];
    await signOutAnyway({
      clearQueue: () => {
        order.push('clear');
        return Promise.resolve();
      },
      signOut: () => {
        order.push('signOut');
        return Promise.resolve();
      },
    });
    expect(order).toEqual(['clear', 'signOut']);
  });

  it('signs out even when clearing the queue fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const signOut = vi.fn(() => Promise.resolve());
    await signOutAnyway({
      clearQueue: () => Promise.reject(new Error('IndexedDB is blocked')),
      signOut,
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
