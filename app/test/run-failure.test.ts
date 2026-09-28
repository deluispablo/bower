import { describe, expect, it } from 'vitest';

import {
  RUN_FAILURE_REASONS,
  failureCopy,
  failureReason,
} from '../src/run-failure.js';

describe('failure reasons for people (#375)', () => {
  it('maps Drive stopping to the board sentence', () => {
    expect(failureCopy('drive_unavailable')).toEqual({
      sentence:
        'Google Drive stopped answering half way through copying things back.',
      hint: 'If it happens again, sign out and back in from Settings; that renews the connection to Drive.',
      short: 'Drive did not answer',
    });
  });

  it.each([
    ['timeout', 'The tidy-up took too long and was stopped.'],
    [
      'model_unavailable',
      'Claude was not available, so nothing could be read.',
    ],
    [
      'vault_changed',
      'Your Bower folder changed while Bower was working in it.',
    ],
    ['unknown', 'Something went wrong before Bower could finish.'],
  ])('maps %s to one sentence', (reason, sentence) => {
    expect(failureCopy(reason).sentence).toBe(sentence);
  });

  it('gives every reason its own sentence, hint and short label', () => {
    const sentences = RUN_FAILURE_REASONS.map((r) => failureCopy(r).sentence);
    expect(new Set(sentences).size).toBe(RUN_FAILURE_REASONS.length);
    for (const reason of RUN_FAILURE_REASONS) {
      const copy = failureCopy(reason);
      expect(copy.sentence.endsWith('.')).toBe(true);
      expect(copy.hint.length).toBeGreaterThan(0);
      expect(copy.short.length).toBeGreaterThan(0);
    }
  });

  it('reads a missing or unknown reason as unknown, never a step name', () => {
    expect(failureReason(undefined)).toBe('unknown');
    expect(failureReason('sync up: copy failed')).toBe('unknown');
    expect(failureCopy(undefined)).toEqual(failureCopy('unknown'));
  });
});
