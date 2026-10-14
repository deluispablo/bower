import type { QuestionOption } from './questions';
/**
 * The shapes every screen works with. They follow the current Bower's real
 * contract (the runner's report, the vault's layout) so that phase 2 only
 * adds adapters behind the same interfaces.
 */
import type { RunPhase } from './run-phases';
import type { AnsweredRow } from './questions';


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
  /** Each body task's region, in display order. Absent means every task is personal. */
  taskRegions?: Array<'personal' | 'bower'>;
  timeline: TimelineEntry[];
  /** Bower's note: what it added, and where that came from. */
  bowerNote?: { text: string; source: SourceKind };
  links: string[];
  backlinks: string[];
  /** For a companion note: the original file it describes. */
  original?: string;
  byBower: boolean;
  /**
   * The note file as read (TL-P4-19 addendum 5): its write stamp (`bowerOp`), when it has one, and the MD5 of the
   * bytes read, which is Drive's `md5Checksum` of them. Left out by a source that reads no file.
   */
  file?: { stamp?: string; md5: string };
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
  /** Declared, not in Drive, and its bytes are not on this device: only choosing it again can send it. */
  chooseAgain?: true;
}

/** A declared thing chosen again on a device without its bytes: its file, or its pasted link. */
export interface ChosenAgain {
  body?: Blob;
  url?: string;
}

/**
 * Why a tidy-up leaves a declared pile in the inbox for now, worked out from
 * Drive with the same facts the runner reads: a thing that has not arrived,
 * bytes Bower could not check, a thing that changed, two different lists of
 * the pile, or nothing left in it.
 */
export type SetAside = 'not-arrived' | 'not-checked' | 'unreadable' | 'changed' | 'declaration' | 'empty' | 'note-format' | 'note-damaged' | 'not-tidied';

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
  /**
   * Its note is there but Bower could not read it: shown read-only and never written over (RFC 9110 §13.1.1,
   * a lost update), until a listing reads it again.
   */
  noteLocked?: true;
  question?: 'waiting' | 'exhausted';
}

export interface NewPile {
  text: string;
  /** `body` is the file itself; `url` is a pasted link. The demo needs neither. */
  items: Array<Pick<PileItem, 'name' | 'kind' | 'origin'> & { body?: Blob; url?: string }>;
}

/** Version 1 type declarations; runtime guards close these shapes before a new write. */
export interface TypeRow {
  id: string;
  match: string[];
  template: string;
  properties: Record<string, { type: string; values?: string[] }>;
  table: string[];
  group_by?: { property: string; bucket?: string };
  profile?: { template: 'profile' };
}
export interface TypeTable { v: 1; rows: TypeRow[] }
export interface Proposal { id: string; payload: { kind: string; row: TypeRow } }

export interface Question {
  /** Frozen proposal identity and payload, never supplied by an answer. */
  proposal?: Proposal;
  options?: Pick<QuestionOption, 'id' | 'label'>[];
  /** Pile words at asking, so an edit resets the asking. */
  words?: string;
  id: string;
  text: string;
  yes: string;
  no: string;
  about?: string;
  /**
   * What the question is about: a fileId or pileId. One open question per subject, whatever its words (TL-P4-11); read
   * only through `contracts/questions.ts` (`subjectOf`).
   */
  subject?: string;
  /** The content hash (md5Checksum) of that thing, so the same photo uploaded again is the same subject. */
  hash?: string;
  /**
   * A question about a Current state you edited (`stateQuestionId`): the mark (`stateMark`) of its lines as asked about. A yes
   * writes over them only while they still read so (`state-yes-writes`).
   */
  state?: string;
  /**
   * A question about a Current state you edited: the update Bower showed (`lines`, what a yes writes, with no model
   * asked again) and the note as the run that asked left it, Drive's `md5Checksum` and `bowerOp` stamp (none when the
   * note carried none). A yes writes only while the note still carries both (write-once's stamp-plus-checksum
   * comparison, as the New mark's, TL-P4-19 addendum 5); otherwise it is asked again. A question from before has none
   * and keeps the earlier path (`c3-state-mark`).
   */
  shown?: StateShown;
  askedAt: number;
}

/** What a question about a Current state showed, and the note as it was left then (`Question.shown`). */
export interface StateShown {
  lines: string[];
  md5: string;
  stamp?: string;
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

export { RUN_STEPS, type RunPhase } from './run-phases';

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
  /** Why a new Area was made for it: "New area Money, for pay and tax records". */
  area?: string;
}

/**
 * A note a run brought up to date: one row per Timeline line it wrote, or one for a Current state alone. `op` is the
 * operation that wrote it; `line` is the 0-based ordinal of its line among the `lines` Timeline lines that op wrote
 * (TL-P4-19 addendum 4), never a place in the note nor its words. `md5` and `stamp` are the note as the run left it
 * (Drive's `md5Checksum` and `bowerOp`), so the New mark shows only while the note is still so (addendum 5). A report
 * from before them has none; a line comes with its op, and `lines`, `md5` and `stamp` with a line.
 */
export type UpdatedRow = { path: string; what: string; op?: string; line?: number; lines?: number; md5?: string; stamp?: string };

export interface RunReport {
  filed: FiledItem[];
  created: Array<{ path: string; what: string }>;
  updated: UpdatedRow[];
  setAside: Array<{ name: string; why: string }>;
  leftAsWritten?: Array<{ name: string; why: string; fileId?: string }>;
  questions: Question[];
  /**
   * Things whose content was already filed (TL-P4-10 addendum 2): each went to the Bin, with the name of the file
   * already saved. Left out when there are none. A pile of words whose lines its notes held already (c3-pair-ask)
   * says in how many notes (`notes`); a row from before has none.
   */
  alreadySaved?: Array<{ name: string; as: string; notes?: number }>;
  /**
   * Things Bower couldn't confirm (TL-P4-14 addendum 8): possibly changed, then gone from Drive before it read them
   * back. Never counted as set aside. Left out when there are none.
   */
  unconfirmed?: Array<{ name: string; why: string }>;
  /** Later changes kept as the person left them, named as they are now. Left out when there are none. */
  kept?: Array<{ name: string; why: string }>;
  /**
   * Answers that settled with no effect (TL-P4-19 addendum 10): their subject had gone before the run. Never counted
   * as set aside; a pair's row also shows on the note that stays. Left out when there are none; a report from before
   * it has none.
   */
  answered?: AnsweredRow[];
  /** How many of your changes (the journal) the run read. */
  yourChanges?: number;
  /** What you asked Bower that this run did, in your words. */
  requests?: string[];
  /** How many rules you added that this run worded. */
  rulesWorded?: number;
  /** A tidy-up that found nothing in the inbox ready when it read it (TL-P3-25): it filed nothing. */
  nothingReady?: true;
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

/**
 * `unreached`: a withdrawal (an Undo, a pile removal) refused because Drive did not answer the check of a create that
 * may have landed (write-once's `withdraw`); only the app raises it, never a Drive or Worker answer.
 */
export type ErrorCode = 'offline' | 'not-found' | 'conflict' | 'auth' | 'unknown' | 'unreached';

export class BowerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    /**
     * A Drive change succeeded, but its line was not simply written: where the thing is now (`path`, null once in the
     * Bin), and the line's id when one was kept (on this page, or waiting on the person) to take back with it.
     */
    public readonly applied?: { path: string | null; changeId?: string },
    /** `cause`: a typed marker for code to tell this error by, never its words (ES2022 Error cause). */
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BowerError';
  }
}
