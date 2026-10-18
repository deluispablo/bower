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
import { isMonthlyLogPath } from '../contracts/log-format';
import { typeTableOk } from '../contracts/note-format';
import { tagListOk } from '../contracts/tag-format';
import type { TypeTable } from '../contracts/types';
import type { RunnerWrite } from '../contracts/run-manifest';
import { isRunWire } from '../contracts/run-wire';
import { isQuestionOption, proposalOk, requestAskOk, requestQuestionId, type QuestionRound, isAnsweredRow } from '../contracts/questions';
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
  retrieval: '.bower/retrieval.json',
  index: '.bower/index.md',
  hot: '.bower/hot.md',
  log: '.bower/log.md',
  typeTable: '.bower/type-table.json',
  tags: '.bower/tags.json',
  observations: '.bower/observations.jsonl',
  proposals: '.bower/proposals',
  /** Immutable pile declarations: `declaration-<declarationId>-<sha256>.json`. */
  piles: '.bower/piles',
} as const;

/**
 * The files of Bower's own that a run's manifest may write (`write-runner-json`), the one list (TL-P4-14 addendum 20):
 * the manifest contract (`parseRunManifestV2`, given it by every caller) and the runner's admitted check both judge by
 * it. `suggestions.json` and `last-run.json` are written by the barrier after the run, never through the manifest.
 */
export const RUNNER_WRITES = [SYSTEM.questions, SYSTEM.requests, SYSTEM.hashes, SYSTEM.retrieval, SYSTEM.index, SYSTEM.hot, SYSTEM.log, SYSTEM.typeTable, SYSTEM.tags, SYSTEM.observations] as const satisfies readonly RunnerWrite[];

export const isRunnerPath = (path: string): boolean => (RUNNER_WRITES as readonly string[]).includes(path) || isMonthlyLogPath(path);

/** Bower's bookkeeping and any dot file stay out of the explorer. */
export function isHidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.'));
}

export interface QuestionsFile {
  v: 1;
  questions: Question[];
  rounds?: QuestionRound[];
}
export interface SuggestionsFile {
  v: 1;
  suggestions: Suggestion[];
}
export interface RequestsFile {
  v: 1;
  done: Request[];
  /** B12e: a done member of a settled map by its key and the admission time; read by `recentRows`, never a refusal. */
  recent?: Recent[];
}
export interface Recent {
  key: string;
  at: number;
}
/** How long a recent result is skipped, and how many rows are kept (the newest). */
export const RECENT = { ttl: 30 * 86_400_000, max: 2000 } as const;
/** The readable rows of a stored `recent`, and whether anything in it was not: a bad row is dropped, a field that is no list is none. */
export function recentRows(value: unknown): { rows: Recent[]; bad: boolean } {
  if (value === undefined) return { rows: [], bad: false };
  const rows = Array.isArray(value) ? value.filter((r): r is Recent => object(r) && text(r.key) && /^[a-f0-9]{16}$/.test(r.key) && number(r.at)) : [];
  return { rows, bad: !Array.isArray(value) || rows.length !== value.length };
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
/** A question's shown update (`Question.shown`): its lines, and the note's checksum and stamp as left. */
const shown = (v: unknown): boolean => object(v) && Array.isArray(v.lines) && v.lines.every(text) && text(v.md5) && optional(v.stamp, text);
const question = (v: unknown): boolean => object(v) && text(v.id) && text(v.text) && text(v.yes) && text(v.no) && number(v.askedAt) && optional(v.about, text) && optional(v.subject, text) && optional(v.hash, text) && optional(v.state, text) && optional(v.shown, shown) && optional(v.words, text) && optional(v.proposal, (p) => proposalOk(p) && v.id === `q-proposal-${p.id}` && [v.subject, v.hash, v.state, v.shown, v.words, v.options, v.request].every((x) => x === undefined)) && optional(v.request, (r) => requestAskOk(r) && v.id === requestQuestionId(r.id) && [v.subject, v.hash, v.state, v.shown, v.words, v.options, v.proposal].every((x) => x === undefined)) && optional(v.options, (o) => Array.isArray(o) && o.length >= 2 && o.length <= 4 && o.every(isQuestionOption) && new Set(o.map((x) => x.id)).size === o.length);
const suggestion = (v: unknown): boolean => object(v) && text(v.id) && text(v.title) && text(v.why);
const request = (v: unknown): boolean => object(v) && text(v.id) && text(v.text) && number(v.at) && optional(v.done, text);
const pathChange = (v: unknown): boolean => object(v) && text(v.path) && text(v.what);
const setAside = (v: unknown): boolean => object(v) && text(v.name) && text(v.why);
const alreadySaved = (v: unknown): boolean => object(v) && text(v.name) && text(v.as) && (v.notes === undefined || (typeof v.notes === 'number' && Number.isInteger(v.notes) && v.notes >= 1));
const kinds = ['note', 'pdf', 'image', 'link', 'doc', 'sheet', 'audio', 'other'];
const filed = (v: unknown): boolean => object(v) && text(v.name) && text(v.title) && text(v.to) && text(v.kind) && kinds.includes(v.kind) && optional(v.note, text);
const count = (v: unknown): boolean => number(v) && Number.isInteger(v) && v >= 0;
const report = (v: unknown): boolean => object(v) && list(v.filed, filed) && list(v.created, pathChange) && list(v.updated, pathChange) && list(v.setAside, setAside) && list(v.questions, question) && optional(v.yourChanges, count) && optional(v.rulesWorded, count) && optional(v.requests, (x) => list(x, text)) && optional(v.nothingReady, (x) => x === true) && optional(v.alreadySaved, (x) => list(x, alreadySaved)) && optional(v.unconfirmed, (x) => list(x, setAside)) && optional(v.kept, (x) => list(x, setAside)) && optional(v.answered, (x) => list(x, isAnsweredRow)) && optional(v.waiting, (x) => count(x) && (x as number) >= 1);
const run = (v: unknown): boolean => isRunWire(v) && object(v) && optional(v.report, report);

/** `result`: the evaluator's result, or why the figure says it was not computed (R32). */
export type ViewRecord = { hash: string; evaluator: number; asOf: string; inputs: Array<[string, string]>; result: unknown };
/** A formula's output for one note, as `evaluateFormula` gives it. */
export type FormulaOutput = { value: unknown } | { unavailable: string };
/**
 * A note's formula record (`<noteId>/<viewId>`, B11 AC27) in the full shape maintain writes; anything else is broken
 * and names no line (R49, coordinator ruling 2). A map's record never passes: its result is no set of outputs.
 */
export function isFormulaRecord(v: unknown): v is ViewRecord & { result: Record<string, FormulaOutput> } {
  return object(v) && text(v.hash) && number(v.evaluator) && text(v.asOf) && list(v.inputs, (pair) => list(pair, text) && (pair as unknown[]).length === 2)
    && object(v.result) && Object.values(v.result).every((o) => object(o) && (Object.keys(o).join() === 'value' || Object.keys(o).join() === 'unavailable' && text(o.unavailable)));
}
/**
 * Optional fields are read leniently: a malformed `health` id, per-file `lint` or `properties` evidence, or `views`
 * record counts as absent (B8 R22, R26; B11 AC12).
 */
export interface RetrievalFile {
  v: 1; folderId: string; account: string; cursor: string;
  /**
   * `properties`: a view member's raw front-matter values, valid only for `version` (B11 R28); `doubled`: its keys written
   * on more than one line (ruling 4), noted with every evidence written since b11-formula-values.
   */
  files: Record<string, { path: string; version: string; summary: string; coverage: { kind: 'prefix'; bytes: number }; properties?: Record<string, string>; doubled?: string[] }>;
  /** The id of Bower's health note (TL-P4-50 Q6): found by this id only, never by title. */
  health?: string;
  /** B11 (AC12): each computed map figure's provenance by `<mapId>/<viewId>`; rebuilt by every maintain that writes retrieval. */
  views?: Record<string, ViewRecord>;
}
export interface RunnerFiles {
  '.bower/type-table.json': TypeTable;
  '.bower/tags.json': { v: 1; tags: string[] };
  '.bower/retrieval.json': RetrievalFile;
  '.bower/questions.json': QuestionsFile;
  '.bower/suggestions.json': SuggestionsFile;
  '.bower/requests.json': RequestsFile;
  '.bower/last-run.json': LastRunFile;
  '.bower/hashes.json': HashesFile;
}

export function isRunnerFile<K extends keyof RunnerFiles>(path: K, v: unknown): v is RunnerFiles[K] {
  if (!object(v) || v.v !== 1) return false;
  switch (path) {
    case SYSTEM.typeTable: return typeTableOk(v);
    case SYSTEM.tags: return tagListOk(v.tags);
    case SYSTEM.retrieval: return text(v.folderId) && v.folderId.length > 0 && text(v.account) && v.account.length > 0 && text(v.cursor) && v.cursor.length > 0
      && object(v.files) && Object.values(v.files).every((f) => object(f) && text(f.path) && text(f.version) && text(f.summary)
        && object(f.coverage) && f.coverage.kind === 'prefix' && count(f.coverage.bytes));
    case SYSTEM.questions: return list(v.questions, question) && optional(v.rounds, (rs) => list(rs, (r) => object(r) && text(r.subject) && text(r.pileId) && text(r.words) && number(r.count) && Number.isInteger(r.count) && r.count >= 1 && r.count <= 2 && optional(r.hash, text) && optional(r.exhausted, (v) => v === true) && optional(r.wordsOnly, (v) => v === true) && optional(r.reask, question)));
    case SYSTEM.suggestions: return list(v.suggestions, suggestion);
    case SYSTEM.requests: return list(v.done, request);
    case SYSTEM.lastRun: return run(v.run);
    case SYSTEM.hashes: return object(v.hashes) && Object.entries(v.hashes).every(([hash, value]) => /^[a-f\d]{64}$/i.test(hash) && text(value));
    // A path read at run time may name no runner file.
    default: return false;
  }
}
