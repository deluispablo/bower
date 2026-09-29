/**
 * The one `SpeechRecognition` stub the unit tests share (spec §7c item 7).
 * jsdom has no speech service and the tests never reach a real one: a test
 * installs this, drives the returned instance by hand and reads what the
 * code under test asked of it. Undo with `vi.unstubAllGlobals()`.
 */

import { vi } from 'vitest';

/** One alternative of a result, as the browser reports it. */
export interface FakeAlternative {
  transcript: string;
  confidence: number;
}

/** The event the stub hands to `onresult`. */
export interface FakeResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: FakeAlternative;
    };
  };
}

/** The event the stub hands to `onerror` (`not-allowed`, `no-speech`, ...). */
export interface FakeErrorEvent {
  error: string;
}

/** A recogniser the test drives: the same surface the app reads. */
export class FakeSpeechRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  listening = false;
  starts = 0;
  stops = 0;
  aborts = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: FakeResultEvent) => void) | null = null;
  onerror: ((event: FakeErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;

  start(): void {
    this.starts += 1;
    this.listening = true;
    this.onstart?.();
  }

  stop(): void {
    this.stops += 1;
    this.end();
  }

  abort(): void {
    this.aborts += 1;
    this.end();
  }

  /** The speaker said `transcript`; `isFinal` false is an interim guess. */
  say(transcript: string, isFinal = true): void {
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: {
          isFinal,
          length: 1,
          0: { transcript, confidence: 0.9 },
        },
      },
    });
  }

  /** The service failed, or the microphone was refused. */
  fail(error: string): void {
    this.onerror?.({ error });
    this.end();
  }

  /** The service stopped by itself (silence, a time limit). */
  end(): void {
    if (!this.listening) return;
    this.listening = false;
    this.onend?.();
  }
}

/** What `installSpeechRecognition` gives back. */
export interface SpeechRecognitionStub {
  /** Every recogniser the code under test made, oldest first. */
  instances: FakeSpeechRecognition[];
  /** The newest one; throws when the code never made one. */
  latest(): FakeSpeechRecognition;
}

/**
 * Installs the stub as both `SpeechRecognition` and `webkitSpeechRecognition`
 * (Chrome only has the prefixed name).
 */
export function installSpeechRecognition(): SpeechRecognitionStub {
  const instances: FakeSpeechRecognition[] = [];
  class Recognition extends FakeSpeechRecognition {
    constructor() {
      super();
      instances.push(this);
    }
  }
  vi.stubGlobal('SpeechRecognition', Recognition);
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  return {
    instances,
    latest(): FakeSpeechRecognition {
      const last = instances[instances.length - 1];
      if (last === undefined) throw new Error('No SpeechRecognition was made');
      return last;
    },
  };
}

/** Removes both names, as on a browser with no speech service (Firefox). */
export function removeSpeechRecognition(): void {
  vi.stubGlobal('SpeechRecognition', undefined);
  vi.stubGlobal('webkitSpeechRecognition', undefined);
}
