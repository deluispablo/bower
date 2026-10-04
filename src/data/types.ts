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
}

export interface Pile {
  id: string;
  /** What the person wrote about the pile; empty for a loose thing. */
  text: string;
  createdAt: number;
  items: PileItem[];
}

export interface NewPile {
  text: string;
  items: Array<Pick<PileItem, 'name' | 'kind' | 'origin'>>;
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
export type ChangeKind = 'rule' | 'move' | 'rename' | 'create' | 'trash' | 'task' | 'answer';
export interface ChangeEntry {
  id: string;
  at: number;
  kind: ChangeKind;
  /** One line, as the app shows it: "Moved Lease draft.pdf to Areas / Home". */
  what: string;
  path?: string;
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
  ) {
    super(message);
    this.name = 'BowerError';
  }
}
