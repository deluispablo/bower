// @vitest-environment jsdom

/**
 * The shared browser stubs (#735): `matchMedia` answers and notifies, and
 * the `SpeechRecognition` stub can be driven and removed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubMatchMedia, stubMatchMediaFor } from './helpers/match-media.js';
import {
  installSpeechRecognition,
  removeSpeechRecognition,
} from './helpers/speech-recognition.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stubMatchMedia', () => {
  it('answers by query and tells listeners when the answer flips', () => {
    const stub = stubMatchMedia((query) => query.includes('900px'));
    const list = window.matchMedia('(min-width: 900px)');
    const seen = vi.fn();
    list.addEventListener('change', seen);
    expect(list.matches).toBe(true);
    expect(window.matchMedia('(min-width: 1200px)').matches).toBe(false);

    stub.set(false);
    expect(list.matches).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);

    list.removeEventListener('change', seen);
    stub.set(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('matches only the one query it was made for', () => {
    stubMatchMediaFor('(prefers-reduced-motion: reduce)');
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(
      true,
    );
    expect(window.matchMedia('(display-mode: standalone)').matches).toBe(false);
  });
});

describe('installSpeechRecognition', () => {
  it('hands out a recogniser the test can drive', () => {
    const stub = installSpeechRecognition();
    const Ctor = (window as unknown as Record<string, new () => unknown>)
      .webkitSpeechRecognition;
    expect(Ctor).toBeDefined();
    new Ctor!();
    const recogniser = stub.latest();
    const heard: string[] = [];
    recogniser.onresult = (event): void => {
      heard.push(event.results[0]?.[0]?.transcript ?? '');
    };
    const ended = vi.fn();
    recogniser.onend = ended;

    recogniser.start();
    recogniser.say('buy milk');
    recogniser.stop();
    expect(heard).toEqual(['buy milk']);
    expect(recogniser.starts).toBe(1);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('can be removed, and latest throws when nothing was made', () => {
    const stub = installSpeechRecognition();
    expect(() => stub.latest()).toThrow();
    removeSpeechRecognition();
    expect(
      (window as unknown as Record<string, unknown>).SpeechRecognition,
    ).toBeUndefined();
  });
});
