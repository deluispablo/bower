// @vitest-environment jsdom

/** #910: Rename… (board NO-Rename, R-EDITS-1, R-EDITS-3). */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import { installSpeechRecognition } from './helpers/speech-recognition.js';

const mocks = vi.hoisted(() => ({
  createTextFile: vi.fn(),
  deleteFile: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../src/drive.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/drive.js')>()),
  createTextFile: mocks.createTextFile,
  deleteFile: mocks.deleteFile,
}));
vi.mock('../src/vault-store.js', () => ({
  useVault: () => ({ index: null, refresh: mocks.refresh }),
}));
vi.mock('../src/session.js', () => ({
  useSession: () => ({ me: { vault: { inboxFolderId: 'INBOX_ID' } } }),
}));

const { openRename } = await import('../src/components/rename-sheet.js');

let root: HTMLDivElement;

function body(): HTMLElement {
  return document.body;
}

function roundButton(): HTMLButtonElement {
  const b = body().querySelector<HTMLButtonElement>('.round-button');
  if (b === null) throw new Error('no round button');
  return b;
}

function box(): HTMLTextAreaElement {
  const el = body().querySelector<HTMLTextAreaElement>('#rename-name');
  if (el === null) throw new Error('no name box');
  return el;
}

function type(value: string): void {
  void act(() => {
    box().value = value;
    box().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function line(): string {
  return body().querySelector('.composer-line')?.textContent ?? '';
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

function rename(): void {
  void act(() => {
    openRename({
      path: '1-Projects/Jobs/CV insights.md',
      name: 'CV insights.md',
      isNote: true,
      siblingNames: ['CV insights.md', 'Cover letter.md'],
    });
  });
}

beforeEach(() => {
  installSpeechRecognition();
  mocks.createTextFile.mockReset().mockResolvedValue({ id: 'REQUEST_ID' });
  mocks.deleteFile.mockReset().mockResolvedValue(undefined);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  dismissToast();
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(OverlayHost, null), root);
  });
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  resetOverlayQueue();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Rename…', () => {
  it('draws the title, the line, the prefilled box with the arrow and the hint', () => {
    rename();
    expect(body().querySelector('h2')?.textContent).toBe('Rename…');
    expect(body().querySelector('[aria-label="Close Rename"]')).not.toBeNull();
    expect(body().textContent).toContain(
      'Bower renames it at the next tidy-up.',
    );
    expect(box().value).toBe('CV insights');
    expect(box().getAttribute('rows')).toBe('1');
    expect(roundButton().getAttribute('aria-label')).toBe('Rename');
    expect(line()).toBe('The arrow renames it. The link to it keeps working.');
  });

  it('puts focus in the box, not on ✕, when it opens', async () => {
    rename();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(box());
  });

  it('shows the mic when the box is emptied', () => {
    rename();
    type('');
    expect(roundButton().getAttribute('aria-label')).toBe('Dictate');
    type('   ');
    expect(roundButton().dataset.state).not.toBe('arrow');
  });

  it('says what is wrong with a name in the danger line', () => {
    rename();
    type('Cover letter');
    expect(line()).toBe('Something in this folder already has that name.');
    expect(box().getAttribute('aria-invalid')).toBe('true');
    void act(() => roundButton().click());
    expect(mocks.createTextFile).not.toHaveBeenCalled();
  });

  it('queues the rename and confirms by a toast with Undo', async () => {
    rename();
    type('CV insights for recruiters');
    void act(() => roundButton().click());
    await flush();
    const [parent, , content] = mocks.createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(content).toContain(
      'Rename 1-Projects/Jobs/CV insights.md to CV insights for recruiters.md',
    );
    expect(currentToast()?.message).toBe(
      'In your inbox. Bower renames it at the next tidy-up.',
    );
    expect(currentToast()?.action?.label).toBe('Undo');
    expect(body().querySelector('.overlay-panel')).toBeNull();
  });
});
