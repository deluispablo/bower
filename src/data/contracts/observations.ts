/** B4's versioned evidence contract. No provider, prompt assembly or persistence lifecycle. */
import { BowerError } from './types';
import { dateOk, validSummary } from './note-format';
import { ABOUT_REGIONS, parseOwnership, type AboutRegion } from './ownership-format';
import { parseRecordJson, canonicalRecordJson } from './record-json';
import { parseTimelineLine } from './timeline-line';
import { FOLDER_TEMPLATE } from './folder-template';

const encoder = new TextEncoder();
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const closed = (v: unknown, required: string[], optional: string[] = []): v is Record<string, unknown> => object(v)
  && required.every((key) => Object.hasOwn(v, key)) && Object.keys(v).every((key) => required.includes(key) || optional.includes(key));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.every(id) && new Set(v).size === v.length;
const section = (v: unknown): v is AboutRegion => typeof v === 'string' && (ABOUT_REGIONS as readonly string[]).includes(v);
const date = (v: unknown): v is string => typeof v === 'string' && dateOk(v);
type Source = { fileId: string; sha256: string };
export type ObservationOrigin = { runId: string; captureId: string } & (
  { kind: 'words'; pileId: string } | { kind: 'document'; subject: string }
  | { kind: 'answer'; recordId: string; subject: string } | { kind: 'rule'; recordId: string }
);
type Evidence = ObservationOrigin & { source: Source };
type Observation = { v: 1; kind: 'observation'; eventId: string; factId: string; section: AboutRegion;
  date: string; text: string; category: 'biography' | 'activity' | 'preference' | 'sensitive' | 'rule' | 'schema';
  source: Source; origin: ObservationOrigin; remembers?: string };
type Tombstone = { v: 1; kind: 'tombstone'; eventId: string; date: string; factId: string;
  sourceId: string; reason: 'forget' | 'bin'; runId: string };
type Consolidation = { v: 1; kind: 'consolidation'; eventId: string; section: AboutRegion; date: string;
  factIds: string[]; runId: string; operationId: string; successful: boolean };
type Event = Observation | Tombstone | Consolidation;
type Ledger = { events: Event[]; live: Observation[]; tombstones: Tombstone[] };

function originOk(v: unknown): v is ObservationOrigin {
  if (!object(v) || !id(v.runId) || !hash(v.captureId)) return false;
  const base = ['kind', 'runId', 'captureId'];
  switch (v.kind) {
    case 'words': return closed(v, [...base, 'pileId']) && id(v.pileId);
    case 'document': return closed(v, [...base, 'subject']) && typeof v.subject === 'string' && validSummary(v.subject);
    case 'answer': return closed(v, [...base, 'recordId', 'subject']) && id(v.recordId) && id(v.subject);
    case 'rule': return closed(v, [...base, 'recordId']) && id(v.recordId);
    default: return false;
  }
}
const sourceOk = (v: unknown): v is Source => closed(v, ['fileId', 'sha256']) && id(v.fileId) && hash(v.sha256);
function eventOk(v: unknown): v is Event {
  if (!object(v) || v.v !== 1 || !id(v.eventId) || !date(v.date)) return false;
  const base = ['v', 'kind', 'eventId', 'date'];
  if (v.kind === 'observation') return closed(v, [...base, 'factId', 'section', 'text', 'category', 'source', 'origin'], ['remembers'])
    && id(v.factId) && section(v.section) && typeof v.text === 'string' && validSummary(v.text)
    && ['biography', 'activity', 'preference', 'sensitive', 'rule', 'schema'].includes(String(v.category))
    && sourceOk(v.source) && originOk(v.origin) && (v.remembers === undefined || id(v.remembers) && v.origin.kind === 'words')
    && (v.origin.kind !== 'document' || (v.category === 'biography' || v.category === 'activity') && v.section !== 'about-preferences');
  if (v.kind === 'tombstone') return closed(v, [...base, 'factId', 'sourceId', 'reason', 'runId'])
    && id(v.factId) && id(v.sourceId) && id(v.runId) && (v.reason === 'forget' || v.reason === 'bin');
  return v.kind === 'consolidation' && closed(v, [...base, 'section', 'factIds', 'runId', 'operationId', 'successful'])
    && section(v.section) && ids(v.factIds) && id(v.runId) && id(v.operationId) && typeof v.successful === 'boolean';
}
function corrupt(detail: unknown): never {
  const error = new BowerError('conflict', 'Bower could not read its learned facts.');
  console.error(error, detail);
  throw error;
}

/** Strict JSON per line, never whole-JSON parsing; unreadable evidence never becomes an empty ledger. */
export function parseObservations(bytes: Uint8Array, undoneRunIds: readonly string[] = []): Ledger {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
  catch (error) {
    // expected: corrupt logs the encoding details and throws the frozen-memory BowerError.
    return corrupt(error);
  }
  if (text && !text.endsWith('\n')) return corrupt('Unterminated observation event');
  const events: Event[] = [];
  const seen = new Map<string, string>();
  const facts = new Map<string, string>();
  for (const line of text && text !== '\n' ? text.slice(0, -1).split('\n') : []) {
    const parsed = parseRecordJson(encoder.encode(line));
    if (!parsed.ok || !eventOk(parsed.value)) return corrupt('Invalid observation event');
    const event = parsed.value;
    const canonical = canonicalRecordJson(event);
    if (!canonical.ok) return corrupt(canonical);
    const previous = seen.get(event.eventId);
    if (previous !== undefined) {
      if (previous !== new TextDecoder().decode(canonical.value)) return corrupt('Conflicting observation event id');
      continue;
    }
    if (event.kind === 'observation') {
      const previousFact = facts.get(event.factId);
      if (previousFact !== undefined) return corrupt('Conflicting observation fact id');
      facts.set(event.factId, event.eventId);
    }
    seen.set(event.eventId, new TextDecoder().decode(canonical.value));
    events.push(event);
  }
  return resolve(events, undoneRunIds);
}
const normalizedText = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function resolve(events: Event[], undone: readonly string[] = []): Ledger {
  const tombstones = events.filter((e): e is Tombstone => e.kind === 'tombstone');
  const blockedFacts = new Set(tombstones.map((e) => e.factId));
  const blockedSources = new Set(tombstones.filter((e) => e.reason === 'bin').map((e) => e.sourceId));
  const forgotten = events.filter((e): e is Observation => e.kind === 'observation'
    && tombstones.some((t) => t.reason === 'forget' && t.factId === e.factId));
  const evidence = new Set<string>();
  const live: Observation[] = [];
  for (const event of events) {
    if (event.kind !== 'observation') continue;
    // Claim evidence before invalidating its origin: a replay never becomes new evidence on Undo or Forget.
    const key = JSON.stringify([event.source.fileId, event.source.sha256, normalizedText(event.text)]);
    if (evidence.has(key)) continue;
    evidence.add(key);
    if (undone.includes(event.origin.runId) || blockedFacts.has(event.factId)
      || blockedSources.has(event.source.fileId)) continue;
    if (event.remembers && !events.slice(0, events.indexOf(event)).some((e) => e.kind === 'tombstone' && e.factId === event.remembers
      && e.runId !== event.origin.runId)) continue;
    const matching = forgotten.filter((fact) => normalizedText(fact.text) === normalizedText(event.text));
    if (matching.length && (event.origin.kind !== 'words' || !matching.some((fact) => fact.factId === event.remembers)
      || matching.some((fact) => event.source.fileId === fact.source.fileId
        || tombstones.some((t) => t.factId === fact.factId
          && (t.date >= event.date || events.indexOf(t) >= events.indexOf(event)))))) continue;
    live.push(event);
  }
  return { events, live, tombstones };
}

/** Candidate fields never supply an origin, hash or id. The two collections are trusted script inputs. */
export function observationOf(candidate: unknown, context: {
  admitted: readonly Evidence[]; lineage: readonly (Evidence & { validated: boolean })[];
  eventId: string; factId: string; date: string;
}): { ok: true; value: Observation } | { ok: false } {
  if (!closed(candidate, ['source', 'section', 'category', 'text'], ['subject', 'remembers'])
    || !object(candidate.source)) return { ok: false };
  const ref = candidate.source;
  const available = [...context.admitted, ...context.lineage.filter((e) => e.validated === true)];
  const matches = available.filter((e) => Object.keys(ref).join() === 'pileId' ? e.kind === 'words' && ref.pileId === e.pileId
    : Object.keys(ref).join() === 'fileId' && ref.fileId === e.source.fileId);
  if (matches.length !== 1) return { ok: false };
  const evidence = matches[0];
  if (!evidence) return { ok: false };
  const { source, ...rest } = evidence;
  // Validated lineage's bookkeeping is not part of the persisted origin.
  const origin = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'validated'));
  if (evidence.kind === 'document' && candidate.subject !== evidence.subject) return { ok: false };
  const value = { v: 1, kind: 'observation', eventId: context.eventId, factId: context.factId, date: context.date,
    section: candidate.section, text: candidate.text, category: candidate.category, source, origin,
    ...(candidate.remembers === undefined ? {} : { remembers: candidate.remembers }) };
  return eventOk(value) && value.kind === 'observation' ? { ok: true, value } : { ok: false };
}

/** Authored payload words only; framing and Timeline date/citation syntax are excluded by their existing grammar. */
export function canRebuildAboutSection(input: { ledger: Ledger; section: AboutRegion; text: string; reason: 'consolidate' | 'forget' | 'undo' }): boolean {
  if (input.reason === 'forget' || input.reason === 'undo') return true;
  const budget = input.section === 'about-preferences' ? 200 : 400;
  const words = input.text.split(/\r?\n/).filter((line) => !/^\s*(?:#{1,6}\s|<!-- bower:ownership)/.test(line))
    .flatMap((line) => (parseTimelineLine(line)?.text ?? line).trim().split(/\s+/).filter(Boolean)).length;
  let frontier = -1;
  input.ledger.events.forEach((e, index) => {
    if (e.kind === 'consolidation' && e.section === input.section && e.successful) frontier = index;
  });
  const newer = new Set(input.ledger.events.slice(frontier + 1).flatMap((e) => e.kind === 'observation' ? [e.factId] : []));
  return words > budget && input.ledger.live.filter((e) => e.section === input.section && newer.has(e.factId)).length >= 5;
}

type AboutContext = { personal: { kind: 'person-input'; text: string };
  learned: { kind: 'learned'; text: string; cut: boolean; factIds: string[] } };
const CUT = '\n[More learned content omitted]';
export function aboutContext(input: { personal: string; learned: string; factIds: string[] }): AboutContext {
  const cut = input.learned.length > 4000;
  const value: AboutContext = { personal: { kind: 'person-input', text: input.personal },
    learned: { kind: 'learned', text: cut ? input.learned.slice(0, 4000 - CUT.length) + CUT : input.learned,
      cut, factIds: [...input.factIds] } };
  if (!isAboutContext(value)) return corrupt('Invalid About me context');
  return value;
}
export function isAboutContext(v: unknown): v is AboutContext {
  return closed(v, ['personal', 'learned']) && closed(v.personal, ['kind', 'text'])
    && v.personal.kind === 'person-input' && typeof v.personal.text === 'string'
    && closed(v.learned, ['kind', 'text', 'cut', 'factIds']) && v.learned.kind === 'learned'
    && typeof v.learned.text === 'string' && v.learned.text.length <= 4000 && typeof v.learned.cut === 'boolean'
    && (!v.learned.cut || v.learned.text.length === 4000 && v.learned.text.endsWith(CUT)) && ids(v.learned.factIds);
}
/** Undo invalidates origins, never tombstones, and never accepts archive prose as rebuilding authority. */
export function rebuildObservations(input: unknown): Ledger {
  if (!closed(input, ['source', 'bytes', 'undoneRunIds']) || input.source !== 'observations'
    || !(input.bytes instanceof Uint8Array) || !ids(input.undoneRunIds)) return corrupt('Invalid observation rebuild');
  return parseObservations(input.bytes, input.undoneRunIds);
}

/** Exact artifact grammar shared by manifest validation and admission; no file-id directory or traversal. */
export function aboutArchivePath(path: string): boolean {
  const parts = path.split('/');
  if (parts.length !== 5 || parts.slice(0, 3).join('/') !== '.bower/archive/about-me' || !section(parts[3])) return false;
  const match = /^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9_-]{1,128})\.md$/.exec(parts[4] ?? '');
  return !!match && date(match[1]) && id(match[2]);
}

/** One whole-block check; the pure splice checks framing, and write boundaries supply live evidence. */
export function validLearnedBlock(text: string, ledger?: Ledger, creating = false): boolean {
  const template = FOLDER_TEMPLATE.find((file) => file.path === 'About me.md')?.content;
  if (text === template) return !creating;
  const bytes = encoder.encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'invalid') return false;
  const first = own.payloads?.['about-you'];
  if (!first) return false;
  const decode = (start: number, end: number): string => new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes.subarray(start, end)).replace(/\r\n/g, '\n');
  const heading = '## What Bower has learned\n';
  const begin = (region: AboutRegion): string => `<!-- bower:ownership/2 begin ${region} -->\n`;
  const prefix = decode(0, first.start);
  if (!prefix.endsWith(heading + begin('about-you'))) return false;
  let block = heading;
  for (const region of ABOUT_REGIONS) {
    const span = own.payloads?.[region];
    if (!span) return false;
    const payload = decode(span.start, span.end);
    if (payload.includes('<!-- bower:ownership')) return false;
    const label = { 'about-you': '### About you', 'about-working-on': "### What you're working on",
      'about-preferences': '### How you like things' }[region];
    if (creating && payload !== label + '\n') return false;
    block += begin(region) + payload + `<!-- bower:ownership/2 end ${region} -->\n`;
    if (!ledger) continue;
    if (!payload.split('\n').every((line) => !line.trim() || line.trim() === label
      || ledger.live.some((fact) => fact.section === region
        && normalizedText(parseTimelineLine(line)?.text ?? line.replace(/^[-*] /, '')) === normalizedText(fact.text)))) return false;
  }
  const start = prefix.length - heading.length - begin('about-you').length;
  if (creating && text !== template + block) return false;
  if (text.replace(/\r\n/g, '\n').slice(start).trimEnd() !== block.trimEnd()) return false;
  if (!ledger) return true;
  return !ledger.events.some((event) => event.kind === 'observation'
    && ledger.tombstones.some((t) => t.factId === event.factId || t.reason === 'bin' && t.sourceId === event.source.fileId)
    && !ledger.live.some((fact) => normalizedText(fact.text) === normalizedText(event.text))
    && normalizedText(block).includes(normalizedText(event.text)));
}
