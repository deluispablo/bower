/** B4's versioned evidence contract. No provider, prompt assembly or persistence lifecycle. */
import { BowerError } from './types';
import { dateOk, validSummary } from './note-format';
import { ABOUT_REGIONS, parseOwnership, type AboutRegion } from './ownership-format';
import { parseRecordJson, canonicalRecordJson } from './record-json';
import { parseTimelineLine, timelineLine } from './timeline-line';
import { FOLDER_TEMPLATE } from './folder-template';
import { recordableRecordId } from './run-manifest';

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
type Evidence = ObservationOrigin & { source: Source; words?: string };
type Observation = { v: 1; kind: 'observation'; eventId: string; factId: string; section: AboutRegion;
  date: string; at?: number; text: string; category: 'biography' | 'activity' | 'preference' | 'sensitive' | 'rule' | 'schema';
  source: Source; origin: ObservationOrigin; remembers?: string };
type Tombstone = { v: 1; kind: 'tombstone'; eventId: string; date: string; at?: number; factId: string;
  sourceId: string; reason: 'forget' | 'bin'; runId: string };
/** A consolidated About me line: the person's facts reworded, citing their ids (R9). */
type ConsolidatedLine = { text: string; factIds: string[]; form: 'current' | 'past' };
type Consolidation = { v: 1; kind: 'consolidation'; eventId: string; section: AboutRegion; date: string;
  factIds: string[]; runId: string; operationId: string; successful: boolean; lines?: ConsolidatedLine[]; dropped?: string[] };
/** The fact stopped being true on `date`, on the person's words `quote` in `source` (R33). */
type Ended = { v: 1; kind: 'ended'; eventId: string; date: string; at?: number; factId: string; quote: string;
  source: Source; runId: string };
type Event = Observation | Tombstone | Consolidation | Ended;
type Ledger = { events: Event[]; live: Observation[]; tombstones: Tombstone[]; ended: { fact: Observation; event: Ended }[] };

function originOk(v: unknown): v is ObservationOrigin {
  if (!object(v) || !id(v.runId) || !hash(v.captureId)) return false;
  const base = ['kind', 'runId', 'captureId'];
  switch (v.kind) {
    case 'words': return closed(v, [...base, 'pileId']) && id(v.pileId);
    case 'document': return closed(v, [...base, 'subject']) && typeof v.subject === 'string' && validSummary(v.subject);
    case 'answer': return closed(v, [...base, 'recordId', 'subject']) && typeof v.recordId === 'string' && recordableRecordId(v.recordId) && id(v.subject);
    case 'rule': return closed(v, [...base, 'recordId']) && typeof v.recordId === 'string' && recordableRecordId(v.recordId);
    default: return false;
  }
}
const sourceOk = (v: unknown): v is Source => closed(v, ['fileId', 'sha256']) && id(v.fileId) && hash(v.sha256);
/** Lines and dropped come together; every fact they name is the event's, once across both (R9). */
function linesOk(lines: unknown, dropped: unknown, members: readonly string[]): boolean {
  if (!Array.isArray(lines) || !lines.length || !ids(dropped)) return false;
  const named = [...dropped];
  for (const line of lines) {
    if (!closed(line, ['text', 'factIds', 'form']) || typeof line.text !== 'string' || !validSummary(line.text)
      || /\[\[|\]\]| · /.test(line.text) || !ids(line.factIds) || !line.factIds.length
      || line.form !== 'current' && line.form !== 'past') return false;
    named.push(...line.factIds);
  }
  return new Set(named).size === named.length && named.every((factId) => members.includes(factId));
}
function eventOk(v: unknown): v is Event {
  if (!object(v) || v.v !== 1 || !id(v.eventId) || !date(v.date)) return false;
  const base = ['v', 'kind', 'eventId', 'date'];
  if (v.at !== undefined && (typeof v.at !== 'number' || !Number.isSafeInteger(v.at)
    || !Number.isFinite(new Date(v.at).getTime()) || new Date(v.at).toISOString().slice(0, 10) !== v.date)) return false;
  if (v.kind === 'observation') return closed(v, [...base, 'factId', 'section', 'text', 'category', 'source', 'origin'], ['remembers', 'at'])
    && id(v.factId) && section(v.section) && typeof v.text === 'string' && validSummary(v.text)
    && ['biography', 'activity', 'preference', 'sensitive', 'rule', 'schema'].includes(String(v.category))
    && sourceOk(v.source) && originOk(v.origin) && (v.remembers === undefined || id(v.remembers) && v.origin.kind === 'words')
    && (v.origin.kind !== 'document' || (v.category === 'biography' || v.category === 'activity') && v.section !== 'about-preferences');
  if (v.kind === 'tombstone') return closed(v, [...base, 'factId', 'sourceId', 'reason', 'runId'], ['at'])
    && id(v.factId) && id(v.sourceId) && id(v.runId) && (v.reason === 'forget' || v.reason === 'bin');
  if (v.kind === 'ended') return closed(v, [...base, 'factId', 'quote', 'source', 'runId'], ['at'])
    && id(v.factId) && typeof v.quote === 'string' && validSummary(v.quote) && sourceOk(v.source) && id(v.runId);
  return v.kind === 'consolidation' && closed(v, [...base, 'section', 'factIds', 'runId', 'operationId', 'successful'], ['lines', 'dropped'])
    && section(v.section) && ids(v.factIds) && id(v.runId) && id(v.operationId) && typeof v.successful === 'boolean'
    && (!Object.hasOwn(v, 'lines') && !Object.hasOwn(v, 'dropped') || linesOk(v.lines, v.dropped, v.factIds));
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
export const normalizedText = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Remember and Forget require the same verbatim evidence in the person's own words. */
export const hasVerbatimQuote = (words: string | undefined, quote: unknown): quote is string =>
  typeof quote === 'string' && !!quote.trim() && words?.includes(quote) === true;

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
          && ((t.at ?? Date.parse(t.date)) >= (event.at ?? Date.parse(event.date)) || events.indexOf(t) >= events.indexOf(event)))))) continue;
    live.push(event);
  }
  // A live fact with an ending whose run is not undone is ended, by its earliest such ending (R34).
  const endings = events.filter((e): e is Ended => e.kind === 'ended' && !undone.includes(e.runId));
  const ended = live.flatMap((fact) => endings.filter((e) => e.factId === fact.factId).slice(0, 1).map((event) => ({ fact, event })));
  return { events, live: live.filter((fact) => !ended.some((e) => e.fact === fact)), tombstones, ended };
}

/** Candidate fields never supply an origin, hash or id. The two collections are trusted script inputs. */
export function observationOf(candidate: unknown, context: {
  admitted: readonly Evidence[]; lineage: readonly (Evidence & { validated: boolean })[];
  eventId: string; factId: string; date: string; at?: number;
}): { ok: true; value: Observation } | { ok: false } {
  if (!closed(candidate, ['source', 'section', 'category', 'text'], ['subject', 'remembers'])
    || !object(candidate.source)) return { ok: false };
  const ref = candidate.source;
  const available = [...context.admitted, ...context.lineage.filter((e) => e.validated === true)];
  const matches = available.filter((e) => Object.keys(ref).join() === 'pileId' ? e.kind === 'words' && ref.pileId === e.pileId
    : Object.keys(ref).join() === 'fileId' && ref.fileId === e.source.fileId);
  if (matches.length !== 1) return { ok: false };
  const evidence = matches[0];
  if (!evidence || evidence.kind === 'document' || !hasVerbatimQuote(evidence.words, candidate.text)) return { ok: false };
  const { source, words: _words, ...rest } = evidence;
  // Validated lineage's bookkeeping is not part of the persisted origin.
  const origin = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'validated'));
  const value = { v: 1, kind: 'observation', eventId: context.eventId, factId: context.factId, date: context.date,
    ...(context.at === undefined ? {} : { at: context.at }), section: candidate.section, text: candidate.text, category: candidate.category, source, origin,
    ...(candidate.remembers === undefined ? {} : { remembers: candidate.remembers }) };
  return eventOk(value) && value.kind === 'observation' ? { ok: true, value } : { ok: false };
}

/** Each About me section's heading label and word budget (TL-P4-48 Q4); the one home for both (R32a). */
export const ABOUT_SECTIONS: Record<AboutRegion, { label: string; budget: number }> = {
  'about-you': { label: 'About you', budget: 400 },
  'about-working-on': { label: "What you're working on", budget: 400 },
  'about-preferences': { label: 'How you like things', budget: 200 },
};
/** Authored payload words only; framing and Timeline date/citation syntax are excluded by their existing grammar. */
export function canRebuildAboutSection(input: { ledger: Ledger; section: AboutRegion; text: string; reason: 'consolidate' | 'forget' | 'undo' }): boolean {
  if (input.reason === 'forget' || input.reason === 'undo') return true;
  return wordsOf(input.text) > ABOUT_SECTIONS[input.section].budget && newerLive(input.ledger, input.section).length >= 5;
}
const wordsOf = (text: string): number => text.split(/\r?\n/).filter((line) => !/^\s*(?:#{1,6}\s|<!-- bower:ownership)/.test(line))
  .flatMap((line) => (parseTimelineLine(line)?.text ?? line).trim().split(/\s+/).filter(Boolean)).length;
const sectionText = (ledger: Ledger, region: AboutRegion): string => learnedLines(ledger, region).map((line) => line.text).join('\n');
/** A section's words as `consolidationDue` counts them: the authored words of the lines About me shows there. */
export const sectionWords = (ledger: Ledger, region: AboutRegion): number => wordsOf(sectionText(ledger, region));
/** The index of the section's latest successful consolidation, or -1. */
const frontierOf = (ledger: Ledger, region: AboutRegion): number =>
  ledger.events.reduce((last, e, i) => e.kind === 'consolidation' && e.section === region && e.successful ? i : last, -1);
function newerLive(ledger: Ledger, region: AboutRegion): Observation[] {
  const newer = new Set(ledger.events.slice(frontierOf(ledger, region) + 1).flatMap((e) => e.kind === 'observation' ? [e.factId] : []));
  return ledger.live.filter((e) => e.section === region && newer.has(e.factId));
}
/** Addendum 6 (c): a tombstoned fact's normalized text that no live fact has. */
const forgottenTexts = (ledger: Ledger): Set<string> => new Set(ledger.events.flatMap((event) => event.kind === 'observation'
  && ledger.tombstones.some((t) => t.factId === event.factId || t.reason === 'bin' && t.sourceId === event.source.fileId)
  && !ledger.live.some((fact) => normalizedText(fact.text) === normalizedText(event.text)) ? [normalizedText(event.text)] : []));

type LearnedLine = { date: string; text: string; factIds: string[] };
/**
 * About me's learned lines for a region, the one projection of the ledger (R10): the latest successful consolidation's
 * lines whose members keep the status they had before it, each failed line replaced in place by its live members, then
 * the region's live facts that no shown line cites, in ledger order. An ended fact no shown line cites is hidden.
 */
export function learnedLines(ledger: Ledger, region: AboutRegion): LearnedLine[] {
  const at = frontierOf(ledger, region);
  const event = ledger.events[at];
  const before = ledger.events.slice(0, Math.max(at, 0));
  const live = ledger.live.filter((fact) => fact.section === region);
  const forgotten = forgottenTexts(ledger);
  const own = (fact: Observation): LearnedLine => ({ date: fact.date, text: fact.text, factIds: [fact.factId] });
  const kept = (factId: string): boolean => before.some((e) => e.kind === 'observation' && e.factId === factId && e.section === region)
    && (before.some((e) => e.kind === 'ended' && e.factId === factId) ? ledger.ended.some((e) => e.fact.factId === factId)
      : live.some((fact) => fact.factId === factId));
  const shown = (event?.kind === 'consolidation' && event.lines || []).flatMap((line) => event && line.factIds.every(kept)
    && !forgotten.has(normalizedText(line.text)) ? [{ date: event.date, text: line.text, factIds: [...line.factIds] }]
    : live.filter((fact) => line.factIds.includes(fact.factId)).map(own));
  const placed = new Set(shown.flatMap((line) => line.factIds));
  return [...shown, ...live.filter((fact) => !placed.has(fact.factId)).map(own)];
}
/** A learned line as About me shows it, dated and labelled as one fact is (R11). */
export const learnedTimeline = (ledger: Ledger, line: LearnedLine): string => timelineLine({ date: line.date, text: line.text,
  source: line.factIds.some((factId) => ledger.events.some((e) => e.kind === 'observation' && e.factId === factId
    && e.origin.kind === 'document')) ? 'Source' : 'Your words' });

/** The gate (R16): over budget on the projection, five live facts newer than the frontier, one of them this run's. */
export function consolidationDue(ledger: Ledger, region: AboutRegion, runId: string): boolean {
  return canRebuildAboutSection({ ledger, section: region, text: sectionText(ledger, region), reason: 'consolidate' })
    && newerLive(ledger, region).some((fact) => fact.origin.runId === runId);
}
type InputFact = { factId: string; date: string; text: string; status: 'live' | 'ended'; ended?: { date: string; quote: string } };
/** What a consolidation may rewrite (R17): live facts, then ended facts its latest lines cite or that ended since; at most 100. */
export function consolidationInput(ledger: Ledger, region: AboutRegion): InputFact[] | null {
  const at = frontierOf(ledger, region);
  const event = ledger.events[at];
  const cited = new Set(event?.kind === 'consolidation' ? (event.lines ?? []).flatMap((line) => line.factIds) : []);
  const facts: InputFact[] = [
    ...ledger.live.filter((fact) => fact.section === region).map((fact) => ({ factId: fact.factId, date: fact.date, text: fact.text, status: 'live' as const })),
    ...ledger.ended.filter(({ fact, event: end }) => fact.section === region && (cited.has(fact.factId) || ledger.events.indexOf(end) > at))
      .map(({ fact, event: end }) => ({ factId: fact.factId, date: fact.date, text: fact.text, status: 'ended' as const, ended: { date: end.date, quote: end.quote } })),
  ];
  // Lossless limit (R26): more facts wait as their own lines.
  return facts.length > 100 ? null : facts;
}
const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const tokensOf = (text: string): RegExpMatchArray[] => [...text.normalize('NFKC').matchAll(TOKEN)];
const markersOf = (text: string): number => {
  const words = tokensOf(text).map(([word]) => word.toLowerCase());
  return words.filter((word, i) => /^(?:no|not|never|cannot|stopped)$|n['’]t$/u.test(word) || word === 'used' && words[i + 1] === 'to').length;
};
/** Each line's fault against only its cited facts, or null (R17 F1–F6); the ledger is the one before the event. */
export function lineFaults(ledger: Ledger, event: { lines: readonly ConsolidatedLine[] }): Array<string | null> {
  const forgotten = forgottenTexts(ledger);
  const ended = new Map(ledger.ended.map((e) => [e.fact.factId, e.fact]));
  return event.lines.map((line) => {
    const facts = line.factIds.flatMap((factId) => ledger.live.find((fact) => fact.factId === factId) ?? ended.get(factId) ?? []);
    if (facts.length !== line.factIds.length) return 'a fact that is neither live nor ended';
    const known = new Set(facts.flatMap((fact) => tokensOf(fact.text).map(([word]) => word.toLowerCase())));
    const text = line.text.normalize('NFKC');
    const risky = tokensOf(text).filter(([word], i, all) => /\p{N}/u.test(word) || /^\p{Lu}/u.test(word) && !/^I(?:['’]\p{L}+)?$/u.test(word)
      && !/(?:^|[.!?])\s*$/u.test(text.slice(0, all[i]?.index ?? 0)));
    if (risky.some(([word]) => !known.has(word.toLowerCase()))) return 'a number, date or name no cited fact holds';
    if (line.form === 'current' && markersOf(text) < Math.max(...facts.map((fact) => markersOf(fact.text)))) return 'a lost negation';
    if (line.form === 'past' && !line.factIds.some((factId) => ended.has(factId))) return 'a past line that cites no ended fact';
    if (tokensOf(text).length > facts.reduce((sum, fact) => sum + tokensOf(fact.text).length, 0)) return 'a line longer than its facts';
    if (forgotten.has(normalizedText(text))) return 'a line that reads as a forgotten fact';
    if (line.form === 'current' && line.factIds.some((factId) => normalizedText(ended.get(factId)?.text ?? '') === normalizedText(text)))
      return 'an ended fact kept in the present';
    return null;
  });
}
/** A stored consolidation is acceptable on the ledger before it (R17); never throws. */
export function consolidationOk(ledger: Ledger, event: unknown, runId: string): boolean {
  if (!eventOk(event) || event.kind !== 'consolidation' || !event.lines || !event.dropped || !event.successful || event.runId !== runId) return false;
  const { lines, dropped, section: region } = event;
  const input = consolidationInput(ledger, region);
  return !!input && consolidationDue(ledger, region, runId) && event.factIds.join() === input.map((fact) => fact.factId).join()
    && dropped.every((factId) => input.some((fact) => fact.factId === factId && fact.status === 'ended'))
    && lineFaults(ledger, { lines }).every((fault) => fault === null)
    && sectionWords({ ...ledger, events: [...ledger.events, event] }, region) < sectionWords(ledger, region);
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
/**
 * Position 4 (R14): the learned lines in About me's order through the 4,000 cut, with the facts behind the lines shown in
 * full, counted by position and never by equal text; an ended member of a shown line is listed with it.
 */
export function learnedContext(ledger: Ledger, personal: string): { about: AboutContext; facts: Observation[] } {
  const lines = ABOUT_REGIONS.flatMap((region) => learnedLines(ledger, region)).map((line) => ({ line, text: learnedTimeline(ledger, line) }));
  const learned = lines.map(({ text }) => text).join('\n');
  const limit = learned.length > 4000 ? 4000 - CUT.length : learned.length;
  let end = -1;
  const factIds = lines.filter(({ text }) => (end += 1 + text.length) <= limit).flatMap(({ line }) => line.factIds);
  const facts = factIds.flatMap((factId) => ledger.events.flatMap((e) => e.kind === 'observation' && e.factId === factId ? [e] : []));
  return { about: aboutContext({ personal, learned, factIds }), facts };
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
    const label = `### ${ABOUT_SECTIONS[region].label}`;
    if (creating && payload !== label + '\n') return false;
    block += begin(region) + payload + `<!-- bower:ownership/2 end ${region} -->\n`;
    if (!ledger) continue;
    // R13: each line is a live fact of its region or a line the projection shows there. Neither can read as a forgotten
    // text (the set excludes live texts; the projection drops such lines), so no whole-block scan is needed.
    const allowed = new Set([...ledger.live.filter((fact) => fact.section === region), ...learnedLines(ledger, region)]
      .map((line) => normalizedText(line.text)));
    if (!payload.split('\n').every((line) => !line.trim() || line.trim() === label
      || allowed.has(normalizedText(parseTimelineLine(line)?.text ?? line.replace(/^[-*] /, ''))))) return false;
  }
  const start = prefix.length - heading.length - begin('about-you').length;
  if (creating && text !== template + block) return false;
  return text.replace(/\r\n/g, '\n').slice(start).trimEnd() === block.trimEnd();
}
