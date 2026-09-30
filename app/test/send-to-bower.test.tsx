// @vitest-environment jsdom

/** #910: the Ask sheet (spec §3.13, R-ASK-1..5). */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';
import { currentToast, dismissToast } from '../src/toast-store.js';

const mocks = vi.hoisted(() => ({
  createTextFile: vi.fn(),
  deleteFile: vi.fn(),
  process: vi.fn(),
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
vi.mock('../src/run-store.js', () => ({
  useRun: () => ({ phase: 'idle', process: mocks.process }),
}));

const { ASK_PLACEHOLDER, askExplainer, openAsk, openSendToBower } =
  await import('../src/components/send-to-bower.js');

let root: HTMLDivElement;

function body(): HTMLElement {
  return document.body;
}

function named(name: string): HTMLButtonElement {
  const found = [...body().querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  );
  if (found === undefined) throw new Error(`no button named ${name}`);
  return found;
}

function box(): HTMLTextAreaElement {
  const el = body().querySelector<HTMLTextAreaElement>('#ask-question');
  if (el === null) throw new Error('no question box');
  return el;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  mocks.createTextFile.mockReset().mockResolvedValue({ id: 'REQUEST_ID' });
  mocks.deleteFile.mockReset().mockResolvedValue(undefined);
  mocks.process.mockReset().mockResolvedValue(true);
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
});

describe('askExplainer (R-ASK-3)', () => {
  it('puts a folder answer in the folder', () => {
    expect(askExplainer({ name: 'Moonee Ponds', kind: 'folder' })).toBe(
      'Bower answers at the next tidy-up and puts the answer in Moonee Ponds.',
    );
  });

  it('puts a note or file answer next to it, by name', () => {
    expect(askExplainer({ name: 'CV insights', kind: 'note' })).toBe(
      'Bower answers at the next tidy-up and puts the answer next to CV insights.',
    );
    expect(askExplainer({ name: 'Passport copy', kind: 'file' })).toContain(
      'next to Passport copy.',
    );
  });
});

describe('Ask sheet', () => {
  function ask(prefill?: string): void {
    void act(() => {
      openAsk(
        {
          name: 'CV insights',
          kind: 'note',
          icon: {
            name: 'CV insights.md',
            mimeType: 'text/markdown',
            path: '1-Projects/Jobs/CV insights.md',
          },
        },
        prefill === undefined ? {} : { prefill },
      );
    });
  }

  it('has the header, the context line, the empty box with the mic and the explainer', () => {
    ask();
    expect(body().querySelector('h2')?.textContent).toBe('Ask Bower');
    expect(named('Close Ask Bower')).toBeDefined();
    expect(body().querySelector('.ask-about')?.textContent).toBe(
      'About CV insights',
    );
    expect(body().querySelector('.ask-about svg')).not.toBeNull();
    expect(box().getAttribute('placeholder')).toBe(ASK_PLACEHOLDER);
    expect(body().querySelector('label[for="ask-question"]')?.textContent).toBe(
      'Your question',
    );
    expect(body().textContent).toContain('The arrow puts it in your inbox');
    expect(body().textContent).toContain('puts the answer next to CV insights.');
    expect(named('Just this, now').getAttribute('aria-disabled')).toBe('true');
    expect(body().textContent).toContain(
      'Uses one run of your Claude plan. The rest of the inbox waits.',
    );
  });

  it('shows the arrow "Put in the inbox" with a prefilled question', () => {
    ask('What should I fix first?');
    expect(box().value).toBe('What should I fix first?');
    expect(named('Put in the inbox').dataset.state).toBe('arrow');
  });

  it('puts the question in the inbox and confirms by a toast with Undo', async () => {
    ask('What should I fix first?');
    void act(() => named('Put in the inbox').click());
    await flush();
    const [parent, , content] = mocks.createTextFile.mock.calls[0] as string[];
    expect(parent).toBe('INBOX_ID');
    expect(content).toContain('About CV insights: What should I fix first?');
    expect(currentToast()?.message).toBe(
      'In your inbox. Bower answers at the next tidy-up.',
    );
    expect(currentToast()?.action?.label).toBe('Undo');
    expect(body().querySelector('.overlay-panel')).toBeNull();
  });

  it('keeps the text and says so when the note could not be written', async () => {
    mocks.createTextFile.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ask('What is still missing here?');
    void act(() => named('Put in the inbox').click());
    await flush();
    expect(body().querySelector('.composer-line')?.textContent).toBe(
      'Could not send. Try again.',
    );
    expect(box().value).toBe('What is still missing here?');
    expect(body().querySelector('.overlay-panel')).not.toBeNull();
  });

  it('runs just this one now', async () => {
    ask('What is still missing here?');
    void act(() => named('Just this, now').click());
    await flush();
    expect(mocks.createTextFile).toHaveBeenCalledTimes(1);
    expect(currentToast()?.message).toBe('Bower is on it now.');
  });

  it('keeps the folder explainer for the older "Try asking" chips', () => {
    void act(() => {
      openSendToBower({
        mode: 'ask',
        about: 'Moonee Ponds',
        aboutKind: 'projects',
        initialText: 'What is still missing here?',
        buildText: (value) => `About Moonee Ponds: ${value}`,
      });
    });
    expect(body().textContent).toContain(
      'puts the answer in Moonee Ponds.',
    );
    expect(box().value).toBe('What is still missing here?');
  });
});
