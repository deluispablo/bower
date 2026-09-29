import { describe, expect, it } from 'vitest';

import { isBowerWritten } from '../src/bower-written';
import { noteMetaFrom } from '../src/note-meta';

const meta = (data: Record<string, unknown>) => noteMetaFrom(data);

describe('isBowerWritten', () => {
  it('is true for each mark on its own', () => {
    expect(isBowerWritten(meta({ by: 'bower' }))).toBe(true);
    expect(isBowerWritten(meta({ by: ' Bower ' }))).toBe(true);
    expect(isBowerWritten(meta({ type: 'answer' }))).toBe(true);
    expect(isBowerWritten(meta({ kind: 'listing' }))).toBe(true);
    expect(isBowerWritten(meta({ original: '[[Lease.pdf]]' }))).toBe(true);
    expect(isBowerWritten(meta({ bower_origins: { rent: 'file' } }))).toBe(
      true,
    );
  });

  it('is true for a legacy body that opens with the callout', () => {
    const plain = meta({});
    expect(isBowerWritten(plain, { body: "> [!bower] Bower's note\n> x" })).toBe(
      true,
    );
    expect(isBowerWritten(plain, { body: "\n> [!bower]- Bower's note" })).toBe(
      true,
    );
    expect(isBowerWritten(undefined, { body: '> [!bower] Hi' })).toBe(true);
  });

  it("is false for a person's own note", () => {
    expect(isBowerWritten(meta({ tags: ['idea'], by: 'Alex' }))).toBe(false);
    expect(isBowerWritten(meta({ type: 'journal' }))).toBe(false);
    expect(isBowerWritten(meta({}), { body: '# Plan\n> [!bower] later' })).toBe(
      false,
    );
    expect(isBowerWritten(undefined)).toBe(false);
    expect(isBowerWritten(null, {})).toBe(false);
  });
});
