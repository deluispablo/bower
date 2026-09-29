// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DICTATION_LANG_KEY,
  DictateButton,
  SILENCE_MS,
  insertSpoken,
  languageLabel,
} from '../src/components/dictate-button.js';
import {
  installSpeechRecognition,
  removeSpeechRecognition,
  type SpeechRecognitionStub,
} from './helpers/speech-recognition.js';

let host: HTMLElement | undefined;
let stub: SpeechRecognitionStub;
let text = '';

function paint(): void {
  if (host === undefined) return;
  render(
    h(DictateButton, {
      value: text,
      onValue: (next: string): void => {
        text = next;
        paint();
      },
      label: 'Your question',
    }),
    host,
  );
}

function mount(initial = ''): HTMLElement {
  text = initial;
  host = document.createElement('div');
  document.body.append(host);
  paint();
  return host;
}

function button(root: HTMLElement): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>('.dictate-btn');
  if (b === null) throw new Error('no dictate button');
  return b;
}

beforeEach(() => {
  stub = installSpeechRecognition();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (host !== undefined) {
    render(null, host);
    host.remove();
    host = undefined;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('insertSpoken', () => {
  it('adds a leading space only when the text before needs one', () => {
    expect(insertSpoken('Hello', 'world', 5, 5)).toEqual({
      value: 'Hello world',
      caret: 11,
    });
    expect(insertSpoken('Hello ', ' world', 6, 6)?.value).toBe('Hello world');
    expect(insertSpoken('', 'world', 0, 0)?.value).toBe('world');
  });

  it('inserts at the cursor, keeping the text after it apart', () => {
    expect(insertSpoken('ab cd', 'X', 2, 2)?.value).toBe('ab X cd');
  });

  it('ignores empty speech', () => {
    expect(insertSpoken('abc', '   ', 3, 3)).toBeNull();
  });
});

describe('languageLabel', () => {
  it('names a tag in short English', () => {
    expect(languageLabel('en-GB')).toBe('English (UK)');
  });
});

describe('DictateButton', () => {
  it('is ready: a muted mic named Dictate, not pressed', () => {
    const b = button(mount());
    expect(b.getAttribute('aria-label')).toBe('Dictate');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(stub.instances).toHaveLength(0);
  });

  it('listens with continuous, interim results and the device language', () => {
    const root = mount();
    act(() => button(root).click());
    const r = stub.latest();
    expect(r.starts).toBe(1);
    expect(r.continuous).toBe(true);
    expect(r.interimResults).toBe(true);
    expect(r.lang).toBe(navigator.language);
    expect(button(root).getAttribute('aria-label')).toBe('Stop dictating');
    expect(button(root).getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      'Listening',
    );
    expect(root.querySelector('.dictate-status')?.textContent).toContain(
      'Change',
    );
    expect(root.querySelector('.hint')).toBeNull();
  });

  it('shows interim words muted and inserts final words with a space', () => {
    const root = mount('Hello');
    act(() => button(root).click());
    act(() => stub.latest().say('for Nov', false));
    expect(root.querySelector('.dictate-interim')?.textContent).toBe('for Nov');
    expect(text).toBe('Hello');
    act(() => stub.latest().say('for November', true));
    expect(text).toBe('Hello for November');
    expect(root.querySelector('.dictate-interim')).toBeNull();
    expect(root.querySelector('textarea')?.value).toBe('Hello for November');
  });

  it('stops on a tap and says Stopped', () => {
    const root = mount();
    act(() => button(root).click());
    act(() => button(root).click());
    expect(stub.latest().stops).toBe(1);
    expect(button(root).getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Stopped');
  });

  it('stops after 3 s of silence', () => {
    vi.useFakeTimers();
    const root = mount();
    act(() => button(root).click());
    act(() => {
      vi.advanceTimersByTime(SILENCE_MS - 1);
    });
    expect(stub.latest().stops).toBe(0);
    act(() => stub.latest().say('still here', true));
    act(() => {
      vi.advanceTimersByTime(SILENCE_MS - 1);
    });
    expect(stub.latest().stops).toBe(0);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(stub.latest().stops).toBe(1);
    expect(button(root).getAttribute('aria-pressed')).toBe('false');
  });

  it('stops when focus leaves the box, and on leaving the route', () => {
    const root = mount();
    act(() => button(root).click());
    act(() => {
      root
        .querySelector('.dictate')
        ?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(stub.latest().stops).toBe(1);
    act(() => button(root).click());
    const second = stub.latest();
    act(() => render(null, root));
    expect(second.aborts).toBe(1);
  });

  it('shows the first-use hint while asking, and not after the first listen', () => {
    const root = mount();
    // Hold onstart back so the browser is still "asking".
    const proto = Object.getPrototypeOf(
      new (
        globalThis as unknown as {
          SpeechRecognition: new () => { start(): void };
        }
      ).SpeechRecognition(),
    ) as { start(): void };
    const start = proto.start;
    proto.start = function (this: { starts: number }): void {
      this.starts += 1;
    };
    act(() => button(root).click());
    expect(root.querySelector('.hint')?.textContent).toContain(
      'Allow the microphone when your browser asks.',
    );
    proto.start = start;
    act(() => stub.latest().onstart?.());
    expect(root.querySelector('.hint')).toBeNull();
    expect(localStorage.getItem('bower:dictation:used')).not.toBeNull();
  });

  it('shows a danger alert when the microphone is blocked', () => {
    const root = mount();
    act(() => button(root).click());
    act(() => stub.latest().fail('not-allowed'));
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The microphone is blocked.');
    expect(button(root).getAttribute('aria-pressed')).toBe('false');
    expect(console.error).toHaveBeenCalled();
  });

  it('says a short sentence for another failure, and stays quiet for no-speech', () => {
    const root = mount();
    act(() => button(root).click());
    act(() => stub.latest().fail('no-speech'));
    expect(root.querySelector('[role="alert"]')).toBeNull();
    act(() => button(root).click());
    act(() => stub.latest().fail('network'));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Dictation stopped.',
    );
  });

  it('keeps a language chosen in the menu and restarts with it', () => {
    const root = mount();
    act(() => button(root).click());
    act(() => {
      root.querySelector<HTMLButtonElement>('.dictate-change')?.click();
    });
    const items = root.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]',
    );
    expect(items[0]?.textContent).toBe('Match my device');
    const es = [...items].find((i) => i.textContent === languageLabel('es-ES'));
    act(() => es?.click());
    expect(JSON.parse(localStorage.getItem(DICTATION_LANG_KEY) ?? 'null')).toBe(
      'es-ES',
    );
    expect(stub.instances).toHaveLength(2);
    expect(stub.latest().lang).toBe('es-ES');
    expect(root.querySelector('.dictate-status')?.textContent).toContain(
      languageLabel('es-ES'),
    );
  });

  it('uses the stored language for a new dictation', () => {
    localStorage.setItem(DICTATION_LANG_KEY, JSON.stringify('fr-FR'));
    const root = mount();
    act(() => button(root).click());
    expect(stub.latest().lang).toBe('fr-FR');
  });

  it('has no button when the browser has no recogniser', () => {
    removeSpeechRecognition();
    const root = mount();
    expect(root.querySelector('.dictate-btn')).toBeNull();
    expect(root.querySelector('textarea')).not.toBeNull();
  });

  it('shows the keyboard tip once on a touch device without a recogniser', () => {
    removeSpeechRecognition();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }));
    const root = mount();
    expect(root.querySelector('.hint-tip')?.textContent).toContain(
      "Long text? Use the microphone key on your phone's keyboard to dictate.",
    );
    act(() => {
      root.querySelector<HTMLButtonElement>('.hint button')?.click();
    });
    expect(root.querySelector('.hint')).toBeNull();
  });
});
