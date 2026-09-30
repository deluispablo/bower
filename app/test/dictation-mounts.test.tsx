// @vitest-environment jsdom

/** #780: the microphone sits in Add a paragraph, and dictation fills it. */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppendForm } from '../src/components/append-form.js';
import {
  installSpeechRecognition,
  type SpeechRecognitionStub,
} from './helpers/speech-recognition.js';

let root: HTMLDivElement;
let stub: SpeechRecognitionStub;

beforeEach(() => {
  stub = installSpeechRecognition();
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.unstubAllGlobals();
});

describe('Add a paragraph', () => {
  it('has a microphone that dictates into its box', async () => {
    const onAppend = vi.fn(() => Promise.resolve());
    await act(() => {
      render(h(AppendForm, { onAppend }), root);
    });
    const mic = root.querySelector<HTMLButtonElement>('.dictate-btn');
    expect(mic?.getAttribute('aria-label')).toBe('Dictate');
    await act(() => {
      mic?.click();
    });
    await act(() => {
      stub.latest().say('A new thought');
    });
    const box = root.querySelector<HTMLTextAreaElement>('#append-text');
    expect(box?.value).toBe('A new thought');
    expect(box?.classList.contains('append-textarea')).toBe(true);
  });
});
