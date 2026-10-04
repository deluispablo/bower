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
 * the runner moves them to `changes/archive/` after reading them.
 */
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
} as const;

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
} as const;
