import type { QuestionAnswer } from './contracts/questions';
import type {
  ChangeEntry,
  ChosenAgain,
  FolderState,
  NewPile,
  Note,
  ParaRoot,
  Pile,
  Question,
  Request,
  Rule,
  SearchHit,
  RunState,
  Suggestion,
  TreeNode,
  TypeRow,
  User,
} from './types';
import type { PlaceSource } from './session';

/**
 * The only doors from the screens to data. Phase 1 has one implementation
 * (the demo, in memory); phase 2 adds Drive and the Worker behind the same
 * doors. Every method may reject with a `BowerError`.
 */

export type Unsubscribe = () => void;

/** A change whose line Drive refused for good while nobody waited on it: what it was, and what is true now. */
export interface FailedChange {
  id: string;
  what: string;
  sentence: string;
  /** The screen already turned to it once (on any page load); it shows until put away, but is not turned to again. */
  seen?: true;
}

export interface Session {
  current(): Promise<User | null>;
  signIn(): Promise<User>;
  signOut(): Promise<void>;
  /** Bower forgets the person (the Worker keeps nothing of them); their folder stays in their Drive. */
  deleteAccount(): Promise<void>;
  folderState(): Promise<FolderState>;
  /** Makes the Bower folder; `onStep` hears each top folder as it appears. */
  /** Makes the Bower folder, or finds the one the person had (`found`: say welcome back). */
  createFolder(onStep: (root: ParaRoot) => void): Promise<{ found: boolean }>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface VaultSource {
  /** Pending files on this device, passed straight from the upload queue. */
  pendingUploadCount?(): number | Promise<number>;
  /** Whether this source represents an actual Google Drive folder. */
  readonly driveLinks: boolean;
  /** The selected folder or file in Drive; null if it is missing or simulated. */
  driveLink(path?: string): Promise<string | null>;
  tree(): Promise<TreeNode[]>;
  note(path: string): Promise<Note>;
  /** `undo` takes back the journal line of the move it reverses. */
  move(path: string, toFolder: string, opts?: { undo?: boolean }): Promise<string>;
  rename(path: string, name: string): Promise<string>;
  create(folder: string, type: 'note' | 'folder', name?: string): Promise<string>;
  trash(path: string): Promise<void>;
  restore(path: string): Promise<void>;
  markSeen(path: string): Promise<void>;
  piles(): Promise<Pile[]>;
  /** Known unanchored piles from the full read; incomplete zero means unknown. Sources without declarations omit it. */
  orphanSummary?(): Promise<{ count: number; complete: boolean }>;
  /** The piles as the folder listing alone shows them, read before `piles()` finishes reading each one; only a source with a slow `piles()` has it. */
  pilesListed?(): Promise<Pile[]>;
  addPile(pile: NewPile): Promise<Pile>;
  removePile(id: string): Promise<void>;
  /** Changes a pile's note before a tidy-up reads it. */
  /** `base`: the words the person's draft started from; a pile whose words are no longer those refuses the save. */
  updatePile(id: string, text: string, base?: string): Promise<Pile>;
  /** Sends again the things of a pile that did not arrive. */
  retryPile(id: string): Promise<void>;
  /**
   * Sends a declared thing whose bytes are not on this device (`chooseAgain`),
   * chosen again: only when its size and hash match what the pile declared.
   * Only a source with pile declarations has it.
   */
  chooseAgain?(pileId: string, itemId: string, chosen: ChosenAgain): Promise<void>;
  /**
   * One plain sentence about keeping uploads on this device, or null. Only a
   * source with an upload queue has it; behind the live door it answers as a promise.
   */
  uploadNotice?(): string | null | Promise<string | null>;
  /** For each file, where you already have it (its path), or null. */
  duplicates(files: Array<{ name: string; body?: Blob }>): Promise<Array<string | null>>;
  /** Stored declarations, through the same cached runner-file read as questions. */
  typeTable?(): Promise<TypeRow[]>;
  questions(): Promise<Question[]>;
  answer(id: string, yes: QuestionAnswer): Promise<void>;
  rules(): Promise<Rule[]>;
  /** The person's own text in the rules note, as the note page shows it, or ''. Only a source that reads a rules note file has it. */
  rulesProse?(): Promise<string>;
  requests(): Promise<Request[]>;
  /** `intent`: one per intended request (a press whose words are sent again after a wait); sent again, it is that request. */
  addRequest(text: string, intent?: string): Promise<Request>;
  /** The web address a saved link (a `.url` file) opens, or null. */
  linkAddress(path: string): Promise<string | null>;
  /** Names, summaries and note text. */
  search(query: string): Promise<SearchHit[]>;
  /** Refuses words that repeat a rule you have. */
  addRule(text: string): Promise<Rule>;
  /** Takes a rule out (a tidy-up removes its line); gives back its Undo. */
  removeRule(id: string): Promise<() => Promise<void>>;
  suggestions(): Promise<Suggestion[]>;
  /** Ticks or unticks the n-th task (`- [ ]`) of a note's body. */
  toggleTask(path: string, index: number): Promise<void>;
  /** Your changes since the last tidy-up (the change journal). */
  changes(): Promise<ChangeEntry[]>;
  /** Changes whose line Drive refused while nobody waited on it, shown once until put away; only a source with a journal in Drive has it. */
  failedChanges?(): Promise<FailedChange[]>;
  /** The person has seen that failed change. */
  putAwayFailed?(id: string): Promise<void>;
  /** The screen turned to this failed change once: it is not turned to again, on this or any later load. */
  markFailedSeen?(id: string): Promise<void>;
  /** Keeps a suggestion as a rule, or says no to it; gives back its Undo. */
  dismissSuggestion(id: string, keep: boolean): Promise<() => Promise<void>>;
  subscribe(cb: () => void): Unsubscribe;
}

/** How a tidy-up is asked for: a press of Tidy up, or an answer's run. */
export interface StartOptions {
  allowWeb?: boolean;
  /** The one thing or pile of the inbox the run takes (a Drive file id or a pile id); the whole inbox when absent. */
  subject?: string;
  /** The press's id, sent on every retry of it; a new one per call when absent (TL-P3-15). */
  requestId?: string;
  /**
   * An answer's run (TL-P4-13 addendum): while a run is going, the Worker keeps it and starts it when that run ends,
   * and the run it answers is the one going, with `waits`.
   */
  answer?: boolean;
}

/** What a press is answered with: the run, and for an answer, whether it waits for the end of the run going. */
export type StartedRun = RunState & { waits?: true };

export interface RunSource {
  /**
   * `allowWeb`: the person lets Bower look things up on the web in this tidy-up (Settings). An answer's run
   * (`answer-loop.ts`) also gives `subject`, the one thing or pile of the inbox it takes, and its own `requestId`.
   */
  start(scope: 'all' | 'instructions', opts?: StartOptions): Promise<StartedRun>;
  /**
   * The run going now, or the last one. `again`: the person asked (Try again),
   * so a remembered client error is asked once more instead of answered.
   */
  current(opts?: { again?: boolean }): Promise<RunState | null>;
  markSeen(id: string): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface Sources {
  session: Session;
  vault: VaultSource;
  runs: RunSource;
  /** Where Bower is active for this person (TL-P2-13); absent where nothing is fenced. */
  place?: PlaceSource;
}
