/**
 * The shapes every screen works with. They follow the current Bower's real
 * contract (the runner's report, the vault's layout) so that phase 2 only
 * adds adapters behind the same interfaces.
 */

export type ParaRoot = 'Inbox' | 'Projects' | 'Areas' | 'Resources' | 'Archive';
export const PARA_ROOTS: readonly ParaRoot[] = ['Inbox', 'Projects', 'Areas', 'Resources', 'Archive'];

export type FileKind = 'note' | 'pdf' | 'image' | 'link' | 'doc' | 'sheet' | 'audio' | 'other';

export interface TreeNode {
  /** Unique, slash-separated, from the Bower folder: `Projects/Flat hunt/Lease draft.pdf`. */
  path: string;
  name: string;
  type: 'folder' | 'file';
  kind?: FileKind;
  /** Epoch ms. */
  modified: number;
  created: number;
  /** Filed or changed since the person last looked. */
  isNew?: boolean;
  /** A note Bower wrote or keeps up to date. */
  byBower?: boolean;
  /** The folder's own note (`Flat hunt/Flat hunt.md`). */
  hub?: boolean;
  children?: TreeNode[];
}

export interface Property {
  key: string;
  label: string;
  value: string;
  /** A wikilink target, when the value points at a note. */
  link?: string;
}

export interface TimelineEntry {
  date: string;
  text: string;
  /** The note or file it came from. */
  source?: string;
}

export type SourceKind = 'notes' | 'web' | 'both';

export interface Note {
  path: string;
  title: string;
  /** One line, as Bower writes it in the note's `summary:`. */
  summary: string;
  properties: Property[];
  status?: string;
  tags: string[];
  /** "Current state": rewritten on every tidy-up that touches the note. */
  currentState: string[];
  /** Markdown, with [[wikilinks]]. */
  body: string;
  timeline: TimelineEntry[];
  /** Bower's note: what it added, and where that came from. */
  bowerNote?: { text: string; source: SourceKind };
  links: string[];
  backlinks: string[];
  /** For a companion note: the original file it describes. */
  original?: string;
  byBower: boolean;
}

export interface PileItem {
  id: string;
  /** As it arrived: `IMG_2290.jpg`, a link. */
  name: string;
  kind: FileKind;
  origin: string;
  /** 0 to 1 while uploading; absent when in Drive. */
  upload?: number;
  /** Declared with other bytes than Drive has now: a tidy-up will not take it. */
  changed?: true;
}

/**
 * Why a tidy-up leaves a declared pile in the inbox for now, worked out from
 * Drive with the same facts the runner reads: a thing that has not arrived,
 * bytes Bower could not check, a thing that changed, two different lists of
 * the pile, or nothing left in it.
 */
export type SetAside = 'not-arrived' | 'not-checked' | 'changed' | 'declaration' | 'empty';

export interface Pile {
  id: string;
  /** Where it is in the Bower folder: its inbox folder, or the lone file. */
  path?: string;
  /** What the person wrote about the pile; empty for a loose thing. */
  text: string;
  createdAt: number;
  items: PileItem[];
  /** Set while a tidy-up would leave it in the inbox; cleared once it is ready or removed. */
  setAside?: SetAside;
}

export interface NewPile {
  text: string;
  /** `body` is the file itself; `url` is a pasted link. The demo needs neither. */
  items: Array<Pick<PileItem, 'name' | 'kind' | 'origin'> & { body?: Blob; url?: string }>;
}

export interface Question {
  id: string;
  text: string;
  yes: string;
  no: string;
  about?: string;
  askedAt: number;
}

export interface Rule {
  id: string;
  /** Bower's wording, as written in Rules.md; your own words until a tidy-up words it. */
  text: string;
  /** What you typed, kept next to Bower's wording. */
  yourWords?: string;
  since: number;
  /** Added in the app and not yet worded by a tidy-up. */
  pending?: boolean;
}

/**
 * The change journal: one entry for each thing you did in the app, so the
 * next tidy-up knows what happened and where to look (spec, "Who does what").
 */
export type ChangeKind = 'rule' | 'request' | 'move' | 'rename' | 'create' | 'trash' | 'task' | 'answer';

/** Something you asked Bower to do once, in the next tidy-up. */
export interface Request {
  id: string;
  text: string;
  at: number;
  /** Set when a tidy-up has done it: what Bower did, in one line. */
  done?: string;
}

/** A search result: where, and the line that matched. */
export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
}
export interface ChangeEntry {
  id: string;
  at: number;
  kind: ChangeKind;
  /** One line, as the app shows it: "Moved Lease draft.pdf to Areas / Home". */
  what: string;
  path?: string;
  /** Where a move or rename came from. */
  from?: string;
}

export interface Suggestion {
  id: string;
  title: string;
  why: string;
}

export type RunPhase = 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';
export const RUN_STEPS = ['queued', 'reading', 'writing', 'saving'] as const satisfies readonly RunPhase[];

export interface FiledItem {
  /** As it arrived. */
  name: string;
  /** The name Bower gave it. */
  title: string;
  kind: FileKind;
  /** The folder it went to. */
  to: string;
  /** Its companion note, when Bower wrote one. */
  note?: string;
}

export interface RunReport {
  filed: FiledItem[];
  created: Array<{ path: string; what: string }>;
  updated: Array<{ path: string; what: string }>;
  setAside: Array<{ name: string; why: string }>;
  questions: Question[];
  /** How many of your changes (the journal) the run read. */
  yourChanges?: number;
  /** What you asked Bower that this run did, in your words. */
  requests?: string[];
  /** How many rules you added that this run worded. */
  rulesWorded?: number;
}

export interface RunState {
  id: string;
  scope: 'all' | 'instructions';
  phase: RunPhase;
  requestedAt: number;
  phaseAt: number;
  finishedAt?: number;
  /** Things to file, known from the reading phase on. */
  total?: number;
  report?: RunReport;
  /** One sentence, for a failed run. */
  failure?: string;
  /** The person has seen the result (the replay is offered until then). */
  seen: boolean;
}

export interface User {
  name: string;
  email: string;
}

export type FolderState = 'ready' | 'missing';

export type ErrorCode = 'offline' | 'not-found' | 'conflict' | 'auth' | 'unknown';

export class BowerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    /** A Drive change succeeded, but its journal could only be kept on this page. */
    public readonly applied?: { path: string | null; changeId: string },
  ) {
    super(message);
    this.name = 'BowerError';
  }
}
