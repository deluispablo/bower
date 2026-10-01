// @vitest-environment jsdom

/** #910: the search field, as a trigger and as Search's own field. */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDictationBlocked } from '../src/components/dictate-button.js';
import {
  SEARCH_PLACEHOLDER,
  SearchField,
  requestSearchDictation,
  shortcutHint,
  takeSearchDictation,
} from '../src/components/search-field.js';
import type { SearchFieldProps } from '../src/components/search-field.js';
import { closeSwitcher, useSwitcherOpen } from '../src/switcher-store.js';
import {
  installSpeechRecognition,
  removeSpeechRecognition,
  type SpeechRecognitionStub,
} from './helpers/speech-recognition.js';

let root: HTMLDivElement;
let stub: SpeechRecognitionStub;
let opened = false;

function Probe(): null {
  opened = useSwitcherOpen().open;
  return null;
}

function mount(props: SearchFieldProps): void {
  void act(() => {
    render(h('div', null, h(SearchField, props), h(Probe, null)), root);
  });
}

function named(name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === name,
  );
  if (found === undefined) throw new Error(`no button named ${name}`);
  return found;
}

beforeEach(() => {
  stub = installSpeechRecognition();
  resetDictationBlocked();
  takeSearchDictation();
  localStorage.clear();
  localStorage.setItem('bower:dictation:used', '1');
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  void act(() => {
    closeSwitcher();
    render(null, root);
  });
  root.remove();
  vi.unstubAllGlobals();
});

describe('shortcutHint', () => {
  it('says ⌘ K on an Apple keyboard and Ctrl K elsewhere', () => {
    expect(shortcutHint('MacIntel')).toBe('⌘ K');
    expect(shortcutHint('Win32')).toBe('Ctrl K');
  });
});

describe('SearchField trigger', () => {
  it('is a button named like the field that opens Search', () => {
    mount({ variant: 'trigger' });
    const open = named(SEARCH_PLACEHOLDER);
    expect(open.textContent).toBe(SEARCH_PLACEHOLDER);
    void act(() => open.click());
    expect(opened).toBe(true);
    expect(takeSearchDictation()).toBe(false);
  });

  it('shows the Ctrl K hint and the 32 px mic on desktop', () => {
    mount({ variant: 'trigger', size: 'desktop', shortcut: true });
    expect(root.querySelector('.search-field-desktop')).not.toBeNull();
    expect(root.querySelector('kbd')?.textContent).toMatch(/K$/);
    expect(named('Dictate').classList.contains('round-button-small')).toBe(
      true,
    );
  });

  it('opens Search and asks its field to dictate from the mic', () => {
    mount({ variant: 'trigger' });
    void act(() => named('Dictate').click());
    expect(opened).toBe(true);
    expect(takeSearchDictation()).toBe(true);
  });

  it('crosses the mic out without a recogniser; a press opens Search only', () => {
    removeSpeechRecognition();
    mount({ variant: 'trigger' });
    const off = named('Dictation is off');
    expect(off.getAttribute('aria-disabled')).toBe('true');
    void act(() => off.click());
    expect(opened).toBe(true);
    expect(takeSearchDictation()).toBe(false);
  });
});

describe('SearchField input', () => {
  let value = '';
  const onClose = vi.fn();

  function paint(): void {
    mount({
      variant: 'input',
      value,
      onChange: (next) => {
        value = next;
        paint();
      },
      onClose,
    });
  }

  beforeEach(() => {
    value = '';
    onClose.mockClear();
  });

  it('is focused on open, with the mic and ✕ Close Search', () => {
    paint();
    const input = root.querySelector('input');
    expect(document.activeElement).toBe(input);
    expect(input?.getAttribute('placeholder')).toBe(SEARCH_PLACEHOLDER);
    expect(named('Dictate')).toBeDefined();
    void act(() => named('Close Search').click());
    expect(onClose).toHaveBeenCalled();
  });

  it('adds Clear the search once there is text', () => {
    value = 'receipts';
    paint();
    void act(() => named('Clear the search').click());
    expect(value).toBe('');
    expect(
      [...root.querySelectorAll('button')].some(
        (b) => b.getAttribute('aria-label') === 'Clear the search',
      ),
    ).toBe(false);
  });

  it('starts dictating on open when the trigger mic asked for it', () => {
    requestSearchDictation();
    paint();
    expect(named('Stop dictating').getAttribute('aria-pressed')).toBe('true');
    void act(() => stub.latest().say('passport'));
    expect(value).toBe('passport');
  });
});
