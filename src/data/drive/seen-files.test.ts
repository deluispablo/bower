import { describe, expect, it } from 'vitest';
import { BowerError } from '../types';
import { notAsSeenReason, notRead } from '../contracts/still-as-seen';
import { SeenFiles } from './seen-files';
import { noAnswer } from './transport';

const WORDS = { offline: "Bower couldn't reach Google Drive.", elsewhere: "Bower couldn't reach Google Drive." };

describe('the fence read', () => {
  it('a fence read that gets no answer is thrown as not read, never as a refusal', async () => {
    const seen = new SeenFiles();
    for (const context of ['headless', 'browser'] as const) {
      const lost = noAnswer(context, WORDS);
      const thrown = await seen.read(Promise.reject(lost)).catch((e: unknown) => e);
      expect(notRead(thrown)).toBe(true);
      expect(notAsSeenReason(thrown)).toBeNull();
      expect(thrown).not.toBe(lost);
      expect((thrown as BowerError).code).not.toBe('offline');
      expect((thrown as BowerError).message).toBe(WORDS.offline);
    }
  });

  it('a fence read that fails any other way is thrown as it is', async () => {
    const seen = new SeenFiles();
    const revoked = new BowerError('auth', 'Bower needs you to sign in again.');
    const thrown = await seen.read(Promise.reject(revoked)).catch((e: unknown) => e);
    expect(thrown).toBe(revoked);
    expect(notRead(thrown)).toBe(false);
    expect(await seen.read(Promise.resolve(null))).toBeNull();
  });
});
