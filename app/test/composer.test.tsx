// @vitest-environment jsdom

/** #910: the one text box, its round button and the line under it. */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPOSER_LINES,
  Composer,
  commitsOnKey,
  composerButton,
  composerLine,
} from '../src/components/composer.js';
import type { ComposerProps } from '../src/components/composer.js';
import { resetDictationBlocked } from '../src/components/dictate-button.js';
import {
  FakeSpeechRecognition,
  installSpeechRecognition,
  removeSpeechRecognition,
  type SpeechRecognitionStub,
} from './helpers/speech-recognition.js';

let host: HTMLElement | undefined;
let stub: SpeechRecognitionStub;
let text = '';
let extra: Partial<ComposerProps> = {};
const onCommit = vi.fn();

function paint(): void {
  if (host === undefined) return;
  render(
    h(Composer, {
      mode: 'send',
      rows: 1,
      label: 'Tell Bower',
      placeholder: 'A rule, a job or a question…',
      value: text,
      onChange: (next: string): void => {
        text = next;
        paint();
      },
      onCommit,
      ...extra,
    }),
    host,
  );
}

function mount(initial = '', props: Partial<ComposerProps> = {}): HTMLElement {
  text = initial;
  extra = props;
  host = document.createElement('div');
  document.body.append(host);
  void act(paint);
  return host;
}

function button(root: HTMLElement): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>('.round-button');
  if (b === null) throw new Error('no round button');
  return b;
}

function line(root: HTMLElement): HTMLElement {
  const l = root.querySelector<HTMLElement>('.composer-line');
  if (l === null) throw new Error('no line');
  return l;
}

function type(root: HTMLElement, value: string): void {
  const field = root.querySelector<HTMLTextAreaElement>('textarea');
  if (field === null) throw new Error('no field');
  void act(() => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(root: HTMLElement, init: KeyboardEventInit): void {
  const field = root.querySelector('textarea, input');
  void act(() => {
    field?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
  });
}

beforeEach(() => {
  stub = installSpeechRecognition();
  resetDictationBlocked();
  localStorage.clear();
  localStorage.setItem('bower:dictation:used', '1');
  onCommit.mockClear();
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

describe('composerButton', () => {
  const base = {
    mode: 'send' as const,
    dictation: 'ready' as const,
    hasText: false,
    sending: false,
    online: true,
    commitLabel: 'Send',
  };

  it('is the mic when empty and the arrow named by effect with text', () => {
    expect(composerButton(base)).toEqual({
      state: 'mic',
      label: 'Dictate',
      pressed: false,
    });
    expect(
      composerButton({ ...base, hasText: true, commitLabel: 'Rename' }),
    ).toEqual({ state: 'arrow', label: 'Rename' });
  });

  it('keeps the mic in save mode', () => {
    expect(composerButton({ ...base, mode: 'save', hasText: true }).state).toBe(
      'mic',
    );
  });

  it('crosses the mic out when blocked or unavailable, until there is text', () => {
    expect(composerButton({ ...base, dictation: 'blocked' })).toEqual({
      state: 'mic-off',
      label: 'Dictation is off',
    });
    expect(composerButton({ ...base, dictation: 'unavailable' }).state).toBe(
      'mic-off',
    );
    expect(
      composerButton({ ...base, dictation: 'blocked', hasText: true }).state,
    ).toBe('arrow');
  });

  it('shows asking, the stop square, the spinner and an inert arrow offline', () => {
    expect(composerButton({ ...base, dictation: 'asking' }).state).toBe(
      'asking',
    );
    expect(composerButton({ ...base, dictation: 'listening' })).toEqual({
      state: 'stop',
      label: 'Stop dictating',
      pressed: true,
    });
    expect(composerButton({ ...base, sending: true, hasText: true })).toEqual({
      state: 'spinner',
      label: 'Sending',
    });
    expect(
      composerButton({ ...base, hasText: true, online: false }).disabled,
    ).toBe(true);
  });
});

describe('composerLine', () => {
  const base = {
    dictation: 'ready' as const,
    desktop: false,
    online: true,
    error: null,
    failure: '',
    hint: null,
  };

  it('says nothing at rest, and the hint when there is one', () => {
    expect(composerLine(base)).toBeNull();
    expect(composerLine({ ...base, hint: 'The arrow renames it.' })?.text).toBe(
      'The arrow renames it.',
    );
  });

  it('writes each state line with its tone', () => {
    expect(composerLine({ ...base, dictation: 'asking' })).toEqual({
      text: 'Allow the microphone to dictate.',
      tone: 'muted',
    });
    expect(composerLine({ ...base, dictation: 'listening' })).toEqual({
      text: 'Listening. Tap the square to stop.',
      tone: 'danger',
      dot: true,
    });
    expect(
      composerLine({ ...base, dictation: 'listening', desktop: true })?.text,
    ).toBe('Listening. Click the square to stop.');
    expect(composerLine({ ...base, dictation: 'blocked' })?.text).toBe(
      COMPOSER_LINES.blocked,
    );
    expect(composerLine({ ...base, dictation: 'unavailable' })?.text).toBe(
      'Dictation is off in this browser. Type instead.',
    );
    expect(
      composerLine({ ...base, error: 'Could not send. Try again.' }),
    ).toEqual({ text: 'Could not send. Try again.', tone: 'danger' });
    expect(composerLine({ ...base, online: false })?.text).toBe(
      'You are offline. Try again when you are back online.',
    );
  });
});

describe('commitsOnKey', () => {
  const k = { ctrlKey: false, metaKey: false, shiftKey: false };
  it('commits on Enter in one row, on Ctrl or ⌘ + Enter in three', () => {
    expect(commitsOnKey(1, { ...k, key: 'Enter' })).toBe(true);
    expect(commitsOnKey(3, { ...k, key: 'Enter' })).toBe(false);
    expect(commitsOnKey(3, { ...k, key: 'Enter', ctrlKey: true })).toBe(true);
    expect(commitsOnKey(3, { ...k, key: 'Enter', metaKey: true })).toBe(true);
    expect(commitsOnKey(1, { ...k, key: 'a' })).toBe(false);
  });
});

describe('Composer', () => {
  it('shows the mic when empty and the arrow once there is text', () => {
    const root = mount();
    expect(button(root).getAttribute('aria-label')).toBe('Dictate');
    expect(button(root).getAttribute('aria-pressed')).toBe('false');
    type(root, 'File receipts under Finance');
    expect(button(root).getAttribute('aria-label')).toBe('Send');
    expect(button(root).dataset.state).toBe('arrow');
  });

  it('keeps the same button element in every state', () => {
    const root = mount();
    const first = button(root);
    type(root, 'Hello');
    expect(button(root)).toBe(first);
    type(root, '');
    void act(() => button(root).click());
    expect(button(root)).toBe(first);
    expect(button(root).dataset.state).toBe('stop');
  });

  it('commits the trimmed text on Enter in one row', () => {
    const root = mount('  Hello  ');
    key(root, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Hello');
  });

  it('adds a line on Enter in three rows and commits on Ctrl + Enter', () => {
    const root = mount('Hello', { rows: 3, commitLabel: 'Put in the inbox' });
    key(root, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    key(root, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('Hello');
    expect(button(root).getAttribute('aria-label')).toBe('Put in the inbox');
  });

  it('listens with the stop square and the danger line; Esc stops', () => {
    const root = mount();
    void act(() => button(root).click());
    expect(button(root).getAttribute('aria-label')).toBe('Stop dictating');
    expect(button(root).getAttribute('aria-pressed')).toBe('true');
    expect(line(root).textContent).toBe('Listening. Tap the square to stop.');
    expect(line(root).classList.contains('composer-line-danger')).toBe(true);
    void act(() => stub.latest().say('file receipts'));
    expect(text).toBe('file receipts');
    key(root, { key: 'Escape' });
    expect(stub.latest().stops).toBe(1);
    expect(button(root).getAttribute('aria-label')).toBe('Send');
  });

  it('asks for the microphone the first time', () => {
    localStorage.clear();
    const root = mount();
    // The browser has not answered yet: no onstart.
    vi.spyOn(FakeSpeechRecognition.prototype, 'start').mockImplementation(
      () => undefined,
    );
    void act(() => button(root).click());
    expect(button(root).dataset.state).toBe('asking');
    expect(button(root).getAttribute('aria-label')).toBe('Dictate');
    expect(line(root).textContent).toBe('Allow the microphone to dictate.');
  });

  it('crosses the mic out when blocked, and still takes typing', () => {
    const root = mount();
    void act(() => button(root).click());
    void act(() => stub.latest().fail('not-allowed'));
    expect(button(root).dataset.state).toBe('mic-off');
    expect(button(root).getAttribute('aria-label')).toBe('Dictation is off');
    expect(button(root).getAttribute('aria-disabled')).toBe('true');
    expect(line(root).textContent).toBe(
      'The microphone is blocked. You can allow it in your browser settings.',
    );
    type(root, 'typed');
    expect(button(root).dataset.state).toBe('arrow');
  });

  it('says dictation is off in a browser without a recogniser', () => {
    removeSpeechRecognition();
    const root = mount();
    expect(button(root).dataset.state).toBe('mic-off');
    expect(line(root).textContent).toBe(
      'Dictation is off in this browser. Type instead.',
    );
  });

  it('shows the spinner while sending and the danger line after a failure', () => {
    const root = mount('Hello', { sending: true });
    expect(button(root).dataset.state).toBe('spinner');
    expect(button(root).getAttribute('aria-label')).toBe('Sending');
    render(null, root);
    root.remove();
    host = undefined;
    const again = mount('Hello', { error: 'Could not send. Try again.' });
    expect(button(again).dataset.state).toBe('arrow');
    expect(line(again).textContent).toBe('Could not send. Try again.');
    expect(line(again).getAttribute('aria-live')).toBe('polite');
  });

  it('saves as you type in save mode, 600 ms after the last change', () => {
    vi.useFakeTimers();
    const root = mount('', { mode: 'save', rows: 3 });
    type(root, 'Notes on these');
    expect(onCommit).not.toHaveBeenCalled();
    void act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onCommit).toHaveBeenCalledWith('Notes on these');
    expect(button(root).dataset.state).toBe('mic');
  });

  it('draws the key box as a password field in mono with the mic', () => {
    const root = mount('', { inputType: 'password', commitLabel: 'Save the key' });
    const input = root.querySelector('input');
    expect(input?.getAttribute('type')).toBe('password');
    expect(input?.getAttribute('autocomplete')).toBe('off');
    expect(input?.classList.contains('composer-mono')).toBe(true);
    expect(button(root).dataset.state).toBe('mic');
  });
});
