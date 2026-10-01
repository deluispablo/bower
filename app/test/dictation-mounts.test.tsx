// @vitest-environment jsdom

/**
 * #780, #910: Add a paragraph… is a sheet whose box is the Composer: the
 * microphone dictates into it, and the arrow adds the paragraph.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppendForm } from '../src/components/append-form.js';
import { currentToast, dismissToast } from '../src/toast-store.js';
import {
  installSpeechRecognition,
  type SpeechRecognitionStub,
} from './helpers/speech-recognition.js';

let root: HTMLDivElement;
let stub: SpeechRecognitionStub;

beforeEach(() => {
  stub = installSpeechRecognition();
  localStorage.clear();
  dismissToast();
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function roundButton(): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>('.round-button');
}

describe('Add a paragraph…', () => {
  it('has the title, the line, the placeholder and the hint', async () => {
    await act(() => {
      render(h(AppendForm, { onAppend: vi.fn(), onClose: vi.fn() }), root);
    });
    expect(document.body.querySelector('h2')?.textContent).toBe(
      'Add a paragraph…',
    );
    expect(document.body.textContent).toContain(
      'A new paragraph at the end of this note.',
    );
    const box = document.body.querySelector('#append-text');
    expect(box?.getAttribute('placeholder')).toBe(
      'Write or dictate the paragraph',
    );
    expect(box?.getAttribute('rows')).toBe('3');
    expect(document.body.querySelector('.composer-line')?.textContent).toBe(
      'The arrow adds the paragraph. Bower keeps it at the next tidy-up.',
    );
  });

  it('puts focus in the box when it opens', async () => {
    await act(() => {
      render(h(AppendForm, { onAppend: vi.fn(), onClose: vi.fn() }), root);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement?.id).toBe('append-text');
  });

  it('has a microphone that dictates into its box', async () => {
    await act(() => {
      render(h(AppendForm, { onAppend: vi.fn(), onClose: vi.fn() }), root);
    });
    const mic = roundButton();
    expect(mic?.getAttribute('aria-label')).toBe('Dictate');
    await act(() => {
      mic?.click();
    });
    await act(() => {
      stub.latest().say('A new thought');
    });
    const box =
      document.body.querySelector<HTMLTextAreaElement>('#append-text');
    expect(box?.value).toBe('A new thought');
    expect(roundButton()?.getAttribute('aria-label')).toBe('Stop dictating');
  });

  it('adds the paragraph with the arrow, then closes with a toast', async () => {
    const onAppend = vi.fn(() => Promise.resolve());
    const onClose = vi.fn();
    await act(() => {
      render(h(AppendForm, { onAppend, onClose }), root);
    });
    const box =
      document.body.querySelector<HTMLTextAreaElement>('#append-text');
    await act(() => {
      if (box === null) return;
      box.value = 'One more thing';
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(roundButton()?.getAttribute('aria-label')).toBe('Add the paragraph');
    await act(async () => {
      roundButton()?.click();
      await Promise.resolve();
    });
    expect(onAppend).toHaveBeenCalledWith('One more thing');
    expect(onClose).toHaveBeenCalled();
    expect(currentToast()?.message).toBe('Added to the end of this note.');
  });
});
