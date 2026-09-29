// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RequestRow } from '../src/bower-tab.js';
import { PendingRequestLine } from '../src/components/pending-request-line.js';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  deleteFile: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ refresh: mocks.refresh }),
}));
vi.mock('../src/drive.js', () => ({ deleteFile: mocks.deleteFile }));
vi.mock('../src/toast-store.js', () => ({ showToast: mocks.showToast }));

let root: HTMLDivElement;

function rows(text: string, fileId: string | null = 'NOTE_ID'): RequestRow[] {
  return [
    {
      key: 'k',
      state: 'waiting',
      text,
      kind: 'job',
      since: '2026-09-29T10:00:00Z',
      fileId,
    },
  ];
}

function mount(path: string, list: RequestRow[]): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(PendingRequestLine, { path, rows: list }), root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('PendingRequestLine', () => {
  it('says what waits, as a status, with a 44 px Undo that bins the request', async () => {
    mocks.deleteFile.mockResolvedValue(undefined);
    mount('Offer.md', rows('Rename Offer.md to Offer 2.md'));
    const status = root.querySelector('[role="status"]');
    expect(status?.textContent).toContain(
      'Renaming to Offer 2 at the next tidy-up',
    );
    const undo = root.querySelector('button');
    expect(undo?.textContent).toBe('Undo');
    await act(async () => {
      undo?.click();
      await Promise.resolve();
    });
    expect(mocks.deleteFile).toHaveBeenCalledWith('NOTE_ID');
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('shows a waiting Move the same way', () => {
    mount('Offer.md', rows('Move “Offer” (Offer.md) to 2-Areas/Garden.'));
    expect(root.textContent).toContain(
      'Moving to Areas › Garden at the next tidy-up',
    );
  });

  it('keeps the status region empty when nothing waits for the path, and says when Undo failed', async () => {
    mount('Other.md', rows('Rename Offer.md to Offer 2.md'));
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
    void act(() => {
      render(null, root);
    });
    mocks.deleteFile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount('Offer.md', rows('Rename Offer.md to Offer 2.md'));
    await act(async () => {
      root.querySelector('button')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Couldn't take that back. It is still in your inbox.",
    );
  });
});
