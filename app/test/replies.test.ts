/**
 * The demo's scripted replies (#445): the fallback for a question the demo
 * has no script for must point somewhere that still exists.
 */

import { describe, expect, it } from 'vitest';

import { replyTo } from '../src/demo/replies.js';

describe('replyTo', () => {
  it('falls back to a generic answer pointing at the Bower tab, not the retired Tell Bower screen', () => {
    const reply = replyTo(
      'Bower - 2026-09-28 0900 Where did I put the lease.md',
      'Where did I put the lease?',
      '2026-09-28',
    );
    expect(reply.kind).toBe('answer');
    if (reply.kind !== 'answer') throw new Error('expected an answer');
    expect(reply.body).toContain('Things you can ask in the Bower tab');
    expect(reply.body).not.toContain('Tell Bower screen');
  });

  it('still answers a scripted question', () => {
    const reply = replyTo(
      'Bower - 2026-09-28 0900 Summarise the PDF.md',
      'Summarise the PDF',
      '2026-09-28',
    );
    expect(reply.kind).toBe('answer');
    if (reply.kind !== 'answer') throw new Error('expected an answer');
    expect(reply.body).toContain('Boiler service invoice.pdf');
  });
});
