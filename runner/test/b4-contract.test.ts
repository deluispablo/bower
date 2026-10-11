/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { BowerError } from '../../src/data/contracts/types';

// Contract-only B1d handoff; no prompt builder, provider, live model or runtime wiring here.
const modules = import.meta.glob('../../src/data/contracts/observations.ts', { eager: true });
function required<T>(name: string): T {
  const module = modules['../../src/data/contracts/observations.ts'] ?? {};
  const value: unknown = Reflect.get(module as object, name);
  expect(value, `observations.ts production export ${name}`).toBeTypeOf('function');
  return value as T;
}
interface Context {
  personal: { kind: 'person-input'; text: string };
  learned: { kind: 'learned'; text: string; cut: boolean; factIds: string[] };
}
const event = (id: string, runId: string) => ({ v: 1, kind: 'observation', eventId: `event-${id}`,
  factId: `fact-${id}`, section: 'about-you', date: '2026-10-11', text: `Alex grows ${id}.`, category: 'biography',
  source: { fileId: `source-${id}`, sha256: 'a'.repeat(64) },
  origin: { kind: 'words', runId, captureId: 'b'.repeat(64), pileId: `pile-${id}` } });
const encode = (text: string) => new TextEncoder().encode(text);

it('b4a-context-and-undo-contract', () => {
  expect(parseOwnership(encode('Alex keeps personal words.')).status, 'existing personal-note control').toBe('plain');
  const build = required<(input: { personal: string; learned: string; factIds: string[] }) => Context>('aboutContext');
  const validate = required<(value: unknown) => boolean>('isAboutContext');
  const personal = 'Alex wrote: keep these personal words directly.';
  const small = build({ personal, learned: 'Alex grows beans.', factIds: ['fact-beans'] });
  expect(small).toEqual({ personal: { kind: 'person-input', text: personal },
    learned: { kind: 'learned', text: 'Alex grows beans.', cut: false, factIds: ['fact-beans'] } });
  expect(validate(small)).toBe(true);
  for (const length of [3999, 4000, 4001, 8000]) {
    const original = 'x'.repeat(length);
    const context = build({ personal, learned: original, factIds: [] });
    expect(context.personal).toEqual(small.personal);
    expect(context.learned.text.length, 'cut mark is included in the 4000 characters').toBeLessThanOrEqual(4000);
    expect(context.learned.cut).toBe(length > 4000);
    if (length <= 4000) expect(context.learned.text).toBe(original);
    else expect(context.learned.text, 'visible honest cut marker').toMatch(/\[.*(?:cut|truncated|more|omitted).*\]/i);
    expect(validate(context)).toBe(true);
  }
  for (const invalid of [
    { kind: 'person-input', text: personal + '\nAlex grows beans.' },
    { ...small, learned: { ...small.learned, kind: 'person-input' } },
    { ...small, learned: { ...small.learned, text: 'x'.repeat(4001) } },
    { ...small, learned: { ...small.learned, cut: true } },
    { ...small, archive: 'Alex prefers forgotten work.' },
  ]) expect(validate(invalid), 'mixed trust and archive authority refuse').toBe(false);

  const rebuild = required<(input: unknown) => { live: Array<{ factId: string }>; tombstones: unknown[] }>('rebuildObservations');
  const beans = event('beans', 'run-undone');
  const peas = event('peas', 'run-kept');
  const mint = event('mint', 'run-kept');
  const forgotten = { v: 1, kind: 'tombstone', eventId: 'event-forget', date: '2026-10-11',
    factId: peas.factId, sourceId: peas.source.fileId, reason: 'forget', runId: 'run-forget' };
  const ledger = encode([beans, peas, mint, forgotten].map((e) => JSON.stringify(e)).join('\n') + '\n');
  const input = { source: 'observations', bytes: ledger, undoneRunIds: [] };
  expect(rebuild(input).live.map((o) => o.factId)).toEqual(['fact-beans', 'fact-mint']);
  const undo = rebuild({ ...input, undoneRunIds: ['run-undone', 'run-forget'] });
  expect(undo.live.map((o) => o.factId)).toEqual(['fact-mint']);
  expect(undo.tombstones).toContainEqual(expect.objectContaining({ factId: 'fact-peas', sourceId: 'source-peas' }));
  expect(rebuild({ ...input, undoneRunIds: ['run-undone', 'run-forget'] })).toEqual(undo);
  expect(() => rebuild({ source: 'archive', text: 'Alex grows beans and peas.', undoneRunIds: ['run-undone'] })).toThrow(BowerError);
  expect(() => rebuild({ ...input, archive: 'Alex grows peas.' })).toThrow(BowerError);
});
