import { expect, it } from 'vitest';
import { BowerError } from './types';

// Proposed additive API at the packet's one ledger home. An absent module/export is an assertion red,
// not a loader error. No mock implements ledger, liveness, provenance or gate behavior.
const modules = import.meta.glob('./observations.ts', { eager: true });
function contract<T>(name: string): T {
  const module = modules['./observations.ts'] ?? {};
  const value: unknown = Reflect.get(module as object, name);
  expect(value, `observations.ts production export ${name}`).toBeTypeOf('function');
  return value as T;
}
type Section = 'about-you' | 'about-working-on' | 'about-preferences';
interface Observation {
  v: 1; kind: 'observation'; eventId: string; factId: string; section: Section; date: string;
  text: string; category: string; source: { fileId: string; sha256: string };
  origin: { kind: string; runId: string; captureId: string; pileId: string };
  remembers?: string;
}
interface Ledger {
  events: unknown[]; live: Observation[];
  tombstones: Array<{ factId: string; sourceId: string }>;
}
const observation = (id: string, section: Section = 'about-preferences'): Observation => ({
  v: 1, kind: 'observation', eventId: `event-${id}`, factId: `fact-${id}`, section,
  date: '2026-10-11', text: 'Alex prefers remote roles except when local mentoring is offered.',
  category: section === 'about-preferences' ? 'preference' : 'biography', source: { fileId: `source-${id}`, sha256: 'a'.repeat(64) },
  origin: { kind: 'words', runId: 'run-one', captureId: 'b'.repeat(64), pileId: `pile-${id}` },
});
const tombstone = (o: Observation) => ({ v: 1, kind: 'tombstone', eventId: `forget-${o.factId}`,
  date: '2026-10-11', factId: o.factId, sourceId: o.source.fileId, reason: 'forget', runId: 'run-forget' });
const jsonl = (...events: unknown[]): Uint8Array => new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
const parseLedger = () => contract<(bytes: Uint8Array) => Ledger>('parseObservations');

it('b4a-ledger-identity-and-corruption', () => {
  const parse = parseLedger();
  const first = observation('remote');
  // A duplicate event and a separately replayed event for identical evidence count once.
  const replay = { ...first, eventId: 'replayed-event', factId: 'replayed-fact' };
  expect(parse(jsonl(first, first, replay)).live.map((o) => o.factId)).toEqual([first.factId]);
  const forgotten = tombstone(first);
  const nextVersion = { ...replay, eventId: 'version-event', factId: 'version-fact',
    source: { ...first.source, sha256: 'c'.repeat(64) } };
  const independent = { ...observation('garden', 'about-you'), text: 'Alex grows beans.' };
  const removed = parse(jsonl(first, forgotten, replay, nextVersion, independent));
  expect(removed.live.map((o) => o.factId)).toEqual([independent.factId]);
  expect(removed.tombstones).toContainEqual(expect.objectContaining({ factId: first.factId, sourceId: first.source.fileId }));
  const remember = { ...observation('remember'), date: '2026-10-12', remembers: first.factId,
    origin: { ...first.origin, runId: 'run-later', pileId: 'pile-new-words' } };
  const remembered = parse(jsonl(first, forgotten, remember, nextVersion));
  expect(remembered.live.map((o) => o.factId)).toEqual([remember.factId]);
  expect(remembered.tombstones).toEqual(removed.tombstones);
  // Reusing the tombstoned source or a model flag is not new remembering authority.
  expect(parse(jsonl(first, forgotten, { ...nextVersion, remembers: first.factId })).live).toEqual([]);
  const atLimit = { ...observation('limit'), text: 'x'.repeat(200) };
  expect(parse(jsonl(atLimit)).live[0]?.text).toHaveLength(200);
  for (const bad of [
    jsonl({ ...first, text: 'x'.repeat(201) }), jsonl({ ...first, eventId: '' }),
    jsonl({ ...first, factId: '' }), jsonl({ ...first, section: 'personal' }),
    jsonl({ ...first, date: '2026-02-30' }), jsonl({ ...first, v: 2 }),
    jsonl({ ...first, source: { fileId: '', sha256: 'bad' } }),
    jsonl(first, { ...first, text: 'Conflicting duplicate event id.' }),
    new TextEncoder().encode(JSON.stringify(first) + '\n{"v":1,"kind":'),
    new Uint8Array([0xff, 0xfe]), new TextEncoder().encode('[{}]\n'),
  ]) expect(() => parse(bad), 'corruption freezes memory writes with a BowerError').toThrow(BowerError);
  expect(parse(new Uint8Array()).live, 'new empty ledger is valid').toEqual([]);
});

it('b4a-section-gate', () => {
  const parse = parseLedger();
  const eligible = contract<(input: { ledger: Ledger; section: Section; text: string;
    reason: 'consolidate' | 'forget' | 'undo' }) => boolean>('canRebuildAboutSection');
  for (const [section, budget] of [['about-you', 400], ['about-working-on', 400], ['about-preferences', 200]] as const) {
    const facts = Array.from({ length: 5 }, (_, index) => observation(`${section}-${index}`, section));
    const text = (words: number) => `### Section\n- 2026-10-11 · ${Array.from({ length: words }, () => 'word').join(' ')} · [[Source]]\n`;
    const check = (events: unknown[], words: number, reason: 'consolidate' | 'forget' | 'undo' = 'consolidate') =>
      eligible({ ledger: parse(jsonl(...events)), section, text: text(words), reason });
    expect(check(facts, budget), `${section}: equality is not over budget`).toBe(false);
    expect(check(facts.slice(0, 4), budget + 1), `${section}: four is insufficient`).toBe(false);
    expect(check(facts, budget + 1), `${section}: over budget and five qualifies`).toBe(true);
    expect(check([...facts.slice(0, 4), facts[0]], budget + 1), 'duplicate does not supply a fifth').toBe(false);
    const fifth = facts[4];
    expect(fifth).toBeDefined();
    if (!fifth) return;
    expect(check([...facts, tombstone(fifth)], budget + 1), 'tombstoned observations are not live').toBe(false);
    const frontier = { v: 1, kind: 'consolidation', eventId: `frontier-${section}`, section,
      date: '2026-10-11', factIds: facts.map((o) => o.factId), runId: 'run-one', operationId: 'edit-one', successful: true };
    expect(check([...facts, frontier], budget + 1), 'successful section frontier resets the count').toBe(false);
    const fresh = Array.from({ length: 5 }, (_, i) => observation(`${section}-fresh-${i}`, section));
    expect(check([...facts, frontier, ...fresh.slice(0, 4)], budget + 1), 'four since the successful frontier').toBe(false);
    expect(check([...facts, frontier, ...fresh], budget + 1), 'five since the successful frontier').toBe(true);
    const otherSection: Section = section === 'about-you' ? 'about-preferences' : 'about-you';
    expect(check([...facts, { ...frontier, section: otherSection, factIds: [] }], budget + 1), 'frontiers are per section').toBe(true);
    expect(check([...facts, { ...frontier, successful: false }], budget + 1), 'failed frontier never advances').toBe(true);
    expect(check([], 1, 'forget'), 'Forget bypasses both predicates').toBe(true);
    expect(check([], 1, 'undo'), 'Undo bypasses both predicates').toBe(true);
  }
});

it('b4a-admitted-origin-only: observation author issues identity and validates evidence lineage', () => {
  type Result = { ok: boolean; value?: Observation };
  const author = contract<(candidate: unknown, context: unknown) => Result>('observationOf');
  const source = { fileId: 'source-words', sha256: 'a'.repeat(64) };
  const admitted = { kind: 'words', runId: 'run-one', captureId: 'b'.repeat(64), pileId: 'pile-words', source };
  const context = { admitted: [admitted], lineage: [], eventId: 'script-event', factId: 'script-fact', date: '2026-10-11' };
  const candidate = { source: { pileId: 'pile-words' }, section: 'about-preferences', category: 'preference',
    text: 'Alex prefers remote roles except when local mentoring is offered.' };
  const good = author(candidate, context);
  expect(good).toMatchObject({ ok: true, value: { eventId: 'script-event', factId: 'script-fact', source,
    origin: { kind: 'words', captureId: 'b'.repeat(64), pileId: 'pile-words' } } });
  for (const patch of [{ origin: { kind: 'words' } }, { factId: 'model-fact' }, { eventId: 'model-event' },
    { source: { pileId: 'unadmitted' } }, { text: 'x'.repeat(201) }]) {
    expect(author({ ...candidate, ...patch }, context)).toMatchObject({ ok: false });
  }
  const document = { kind: 'document', runId: 'run-one', captureId: 'b'.repeat(64),
    source: { fileId: 'cv-id', sha256: 'c'.repeat(64) }, subject: 'Alex' };
  const biography = { source: { fileId: 'cv-id' }, section: 'about-you', category: 'biography', subject: 'Alex', text: 'Alex grows beans.' };
  expect(author(biography, { ...context, admitted: [document] })).toMatchObject({ ok: true,
    value: { origin: { kind: 'document' } } });
  for (const category of ['preference', 'sensitive', 'rule', 'schema']) {
    expect(author({ ...biography, category }, { ...context, admitted: [document] })).toMatchObject({ ok: false });
  }
  expect(author({ ...biography, subject: 'Someone else' }, { ...context, admitted: [document] })).toMatchObject({ ok: false });
  expect(author({ ...candidate, source: { fileId: 'about-id' } }, { ...context,
    admitted: [{ ...admitted, kind: 'personal-about', source: { ...source, fileId: 'about-id' } }] })).toMatchObject({ ok: false });
  // Stored prose with an origin label is not validated lineage.
  expect(author(candidate, { ...context, admitted: [], lineage: [{ ...admitted, validated: false }] })).toMatchObject({ ok: false });
  expect(author(candidate, { ...context, admitted: [], lineage: [{ ...admitted, validated: true }] })).toMatchObject({ ok: true });
});
