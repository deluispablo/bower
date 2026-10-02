import { describe, expect, it } from 'vitest';

import { pendingTotal } from '../src/add-queue-store.js';

describe('pendingTotal: one pending count, the open pile included (#998, R-CONF-2, D33)', () => {
  const listed = new Set(['Lease.pdf', 'Receipt.jpg']);

  it('adds the open pile files still on their way to the inbox count', () => {
    const open = {
      items: [
        { name: 'Lease.pdf', state: 'done' as const },
        { name: 'Plan.pdf', state: 'uploading' as const },
        { name: 'Photo.jpg', state: 'waiting' as const },
      ],
    };
    // 2 in the listing (Lease among them), plus Plan and Photo.
    expect(pendingTotal(2, listed, [open])).toBe(4);
  });

  it('leaves a landed or failed file to the listing, and counts a name once', () => {
    const open = {
      items: [
        { name: 'Broken.pdf', state: 'failed' as const },
        { name: 'Filed already.pdf', state: 'done' as const },
        { name: 'Plan.pdf', state: 'uploading' as const },
      ],
    };
    const waiting = {
      items: [
        { name: 'Plan.pdf', state: 'waiting' as const },
        { name: 'Late.pdf', state: 'uploading' as const },
      ],
    };
    expect(pendingTotal(2, listed, [open, waiting])).toBe(4);
  });

  it('never counts a file twice once the listing holds it', () => {
    const open = {
      items: [{ name: 'Receipt.jpg', state: 'uploading' as const }],
    };
    expect(pendingTotal(2, listed, [open])).toBe(2);
  });

  it('is the inbox count alone with no piles', () => {
    expect(pendingTotal(23, listed, [])).toBe(23);
  });
});
