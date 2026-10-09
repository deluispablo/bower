/**
 * The Bower folder's own files: what the app and the runner keep next to
 * your notes, and what the explorer never shows. Every JSON file carries
 * `v: 1` so either side can tell an old shape from a new one.
 *
 * Owned by the runner (the app only reads them):
 * - `questions.json`   { v, questions: Question[] }
 * - `suggestions.json` { v, suggestions: Suggestion[] }
 * - `requests.json`    { v, done: Request[] }, the last requests a tidy-up did, with its line
 * - `last-run.json`    { v, run: RunState without `seen` }
 * - `hashes.json`      { v, hashes: { [sha-256 hex]: path } }
 * Owned by the app: `changes/`, one JSON file per change (the journal);
 * the runner moves them to `changes/archive/` after reading them; `piles/`,
 * one immutable declaration per pile, written before any of its things.
 */
import type { RunnerWrite } from '../contracts/run-manifest';
import { isRunWire } from '../contracts/run-wire';
import type { Question, Request, RunState, Suggestion } from '../types';

export const BOWER_FOLDER = 'Bower';

export const SYSTEM = {
  dir: '.bower',
  changes: '.bower/changes',
  archive: '.bower/changes/archive',
  lastRun: '.bower/last-run.json',
  questions: '.bower/questions.json',
  suggestions: '.bower/suggestions.json',
  requests: '.bower/requests.json',
  hashes: '.bower/hashes.json',
  /** Immutable pile declarations: `declaration-<declarationId>-<sha256>.json`. */
  piles: '.bower/piles',
} as const;

/**
 * The files of Bower's own that a run's manifest may write (`write-runner-json`), the one list (TL-P4-14 addendum 20):
 * the manifest contract (`parseRunManifestV2`, given it by every caller) and the runner's admitted check both judge by
 * it. `suggestions.json` and `last-run.json` are written by the barrier after the run, never through the manifest.
 */
export const RUNNER_WRITES = [SYSTEM.questions, SYSTEM.requests, SYSTEM.hashes] as const satisfies readonly RunnerWrite[];

export const HIDDEN_AT_ROOT = ['index.md', 'hot.md', 'log.md'] as const;

/** Bower's bookkeeping and any dot file stay out of the explorer. */
export function isHidden(path: string): boolean {
  if ((HIDDEN_AT_ROOT as readonly string[]).includes(path)) return true;
  return path.split('/').some((part) => part.startsWith('.'));
}

export interface QuestionsFile {
  v: 1;
  questions: Question[];
}
export interface SuggestionsFile {
  v: 1;
  suggestions: Suggestion[];
}
export interface RequestsFile {
  v: 1;
  done: Request[];
}
export interface LastRunFile {
  v: 1;
  run: Omit<RunState, 'seen'>;
}
export interface HashesFile {
  v: 1;
  hashes: Record<string, string>;
}

/** The appProperties Bower sets on what it writes. */
export const PROP = {
  /** `bower` on everything Bower wrote or keeps. */
  by: 'by',
  /** `1` on what the latest tidy-up filed or changed; "new" until this device opens it. */
  isNew: 'bowerNew',
  /** On a thing in the inbox: its name as you added it, where it came from, its kind. */
  asAdded: 'asAdded',
  origin: 'origin',
  kind: 'kind',
  /** On a pile's folder: the pile's id, kept when a lone thing becomes a folder. */
  pile: 'pile',
  /** On a thing sent to the inbox: a key made before sending, so a retry never sends it twice. */
  item: 'bowerItem',
  /** On a declared pile's folder and its things: the declaration id in `.bower/piles`. */
  declaration: 'bowerDeclaration',
  /** On a declaration or disposition in `.bower/piles`: the id of the pile it is about. Absent on records written before this stamp. */
  recordPile: 'bowerRecordPile',
  /** On a declaration in `.bower/piles`: `loose` or `folder`, the layout its pile was declared with. */
  recordAnchor: 'bowerRecordAnchor',
  /** On a run's folder in `.bower/runs`, set at done: its run id, and when it ended in ms (`runner/src/spine/retention.ts`). */
  run: 'bowerRun',
  runEnded: 'bowerRunEnded',
} as const;

/** The stamps a new record carries: its pile, and for a declaration the layout it was declared with. */
export function recordStamp(pileId: string, anchor?: 'loose' | 'folder'): Record<string, string> {
  return { [PROP.recordPile]: pileId, ...(anchor ? { [PROP.recordAnchor]: anchor } : {}) };
}

/** Runtime checks for the runner's data: a version alone does not prove its shape. */
type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optional = (v: unknown, check: (x: unknown) => boolean): boolean => v === undefined || check(v);
const list = (v: unknown, check: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(check);
const question = (v: unknown): boolean => object(v) && text(v.id) && text(v.text) && text(v.yes) && text(v.no) && number(v.askedAt) && optional(v.about, text) && optional(v.subject, text) && optional(v.hash, text) && optional(v.state, text);
const suggestion = (v: unknown): boolean => object(v) && text(v.id) && text(v.title) && text(v.why);
const request = (v: unknown): boolean => object(v) && text(v.id) && text(v.text) && number(v.at) && optional(v.done, text);
const pathChange = (v: unknown): boolean => object(v) && text(v.path) && text(v.what);
const setAside = (v: unknown): boolean => object(v) && text(v.name) && text(v.why);
const alreadySaved = (v: unknown): boolean => object(v) && text(v.name) && text(v.as);
const kinds = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'];
const filed = (v: unknown): boolean => object(v) && text(v.name) && text(v.title) && text(v.to) && text(v.kind) && kinds.includes(v.kind) && optional(v.note, text);
const count = (v: unknown): boolean => number(v) && Number.isInteger(v) && v >= 0;
const report = (v: unknown): boolean => object(v) && list(v.filed, filed) && list(v.created, pathChange) && list(v.updated, pathChange) && list(v.setAside, setAside) && list(v.questions, question) && optional(v.yourChanges, count) && optional(v.rulesWorded, count) && optional(v.requests, (x) => list(x, text)) && optional(v.nothingReady, (x) => x === true) && optional(v.alreadySaved, (x) => list(x, alreadySaved)) && optional(v.unconfirmed, (x) => list(x, setAside));
const run = (v: unknown): boolean => isRunWire(v) && object(v) && optional(v.report, report);

export interface RunnerFiles {
  '.bower/questions.json': QuestionsFile;
  '.bower/suggestions.json': SuggestionsFile;
  '.bower/requests.json': RequestsFile;
  '.bower/last-run.json': LastRunFile;
  '.bower/hashes.json': HashesFile;
}

export function isRunnerFile<K extends keyof RunnerFiles>(path: K, v: unknown): v is RunnerFiles[K] {
  if (!object(v) || v.v !== 1) return false;
  switch (path) {
    case SYSTEM.questions: return list(v.questions, question);
    case SYSTEM.suggestions: return list(v.suggestions, suggestion);
    case SYSTEM.requests: return list(v.done, request);
    case SYSTEM.lastRun: return run(v.run);
    case SYSTEM.hashes: return object(v.hashes) && Object.entries(v.hashes).every(([hash, value]) => /^[a-f\d]{64}$/i.test(hash) && text(value));
  }
  return false;
}
