// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openAsk = vi.fn();
vi.mock('../src/components/send-to-bower.js', () => ({ openAsk }));

const {
  FILE_TIP_ASK,
  FileTip,
  fileTipId,
  Hint,
  hintStorageKey,
  isHintDismissed,
  restoreHint,
} = await import('../src/components/hint.js');

let host: HTMLElement | undefined;

function mount(
  variant: 'tip' | 'suggestion' | 'state',
  id = 'demo',
): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  render(
    h(Hint, {
      id,
      variant,
      icon: h('svg', { class: 'icon' }),
      children: 'Some words',
    }),
    host,
  );
  return host;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
  vi.restoreAllMocks();
});

describe('Hint (issue #742)', () => {
  it('uses the bower:hint:<id> key', () => {
    expect(hintStorageKey('home-tip')).toBe('bower:hint:home-tip');
  });

  it.each(['tip', 'suggestion'] as const)(
    '%s has a dismiss button named "Hide this tip"',
    (variant) => {
      const root = mount(variant);
      expect(root.querySelector('.hint')?.className).toBe(
        `hint hint-${variant}`,
      );
      const button = root.querySelector('button');
      expect(button?.getAttribute('aria-label')).toBe('Hide this tip');
    },
  );

  it('dismissing hides the hint and remembers it', () => {
    const root = mount('tip');
    root.querySelector('button')?.click();
    // Preact flushes state updates on a microtask.
    return Promise.resolve().then(() => {
      expect(root.querySelector('.hint')).toBeNull();
      expect(localStorage.getItem('bower:hint:demo')).not.toBeNull();
      expect(isHintDismissed('demo')).toBe(true);
    });
  });

  it('stays hidden when it was dismissed earlier, and comes back on restore', () => {
    localStorage.setItem('bower:hint:demo', '1');
    const root = mount('suggestion');
    expect(root.querySelector('.hint')).toBeNull();
    restoreHint('demo');
    expect(isHintDismissed('demo')).toBe(false);
  });

  it('the state variant has no dismiss button and ignores a stored dismissal', () => {
    localStorage.setItem('bower:hint:demo', '1');
    const root = mount('state');
    expect(root.querySelector('.hint-state')).not.toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('shows the hint and logs when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const root = mount('tip');
    expect(root.querySelector('.hint')).not.toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('only the state variant announces itself as a status', () => {
    expect(mount('state').querySelector('.hint')?.getAttribute('role')).toBe(
      'status',
    );
    document.body.innerHTML = '';
    expect(mount('tip').querySelector('.hint')?.hasAttribute('role')).toBe(
      false,
    );
  });

  it('the suggestion border is 1 px brand tint', () => {
    const css = readFileSync('src/styles/hint.css', 'utf8');
    expect(css).toMatch(
      /\.hint-suggestion\s*\{[^}]*border:\s*1px solid var\(--color-brand-tint\)/,
    );
  });

  function tipOf(id: string, variant: 'tip' | 'suggestion' | 'state'): unknown {
    return h(Hint, { id, variant, icon: h('svg', {}), children: id });
  }

  it('shows only the first tip or suggestion on a screen', async () => {
    host = document.createElement('div');
    document.body.append(host);
    render(
      h('div', null, [
        tipOf('a', 'tip'),
        tipOf('b', 'suggestion'),
        tipOf('c', 'state'),
      ] as never),
      host,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const hints = [...host.querySelectorAll<HTMLElement>('.hint')];
    expect(hints.map((el) => el.hidden)).toEqual([false, true, false]);
  });

  it('the next one shows once the first is dismissed', async () => {
    host = document.createElement('div');
    document.body.append(host);
    render(
      h('div', null, [tipOf('a', 'tip'), tipOf('b', 'tip')] as never),
      host,
    );
    host.querySelector<HTMLButtonElement>('.hint-dismiss')?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const left = [...host.querySelectorAll<HTMLElement>('.hint')];
    expect(left).toHaveLength(1);
    expect(left[0]?.hidden).toBe(false);
  });
});

describe('The file tip (#912, R-HINT-1, FI-Main)', () => {
  const file = {
    id: 'id-letter',
    name: 'Cover Letter - Alex.pdf',
    mimeType: 'application/pdf',
    parents: ['FOLDER_ID'],
    path: '1-Projects/Job Search Australia/Cover Letter - Alex.pdf',
  };

  function mountTip(): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    render(h(FileTip, { file, filedAsItIs: true }), host);
    return host;
  }

  it('reads as the board and opens Ask about the file, prefilled', () => {
    openAsk.mockClear();
    const root = mountTip();
    expect(root.textContent).toContain(
      'Want a note on it? Bower filed this as it is. Ask for one.',
    );
    const button = root.querySelector<HTMLButtonElement>('.hint-file-ask');
    expect(button?.textContent).toBe('Summarise this and list what matters');
    button?.click();
    expect(openAsk).toHaveBeenCalledTimes(1);
    const [item, options] = openAsk.mock.calls[0] as [
      { name: string; kind: string },
      { prefill: string },
    ];
    expect(item.name).toBe('Cover Letter - Alex');
    expect(item.kind).toBe('file');
    expect(options.prefill).toBe(FILE_TIP_ASK);
  });

  it('remembers its dismissal for this file', async () => {
    const root = mountTip();
    root.querySelector<HTMLButtonElement>('.hint-dismiss')?.click();
    // Preact flushes state updates on a microtask.
    await Promise.resolve();
    expect(root.querySelector('.hint')).toBeNull();
    expect(isHintDismissed(fileTipId(file.id))).toBe(true);
    expect(isHintDismissed(fileTipId('another-file'))).toBe(false);
    render(null, root);
    render(h(FileTip, { file, filedAsItIs: true }), root);
    expect(root.querySelector('.hint')).toBeNull();
  });
});
