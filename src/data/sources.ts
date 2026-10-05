import type {
  ChangeEntry,
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
  User,
} from './types';

/**
 * The only doors from the screens to data. Phase 1 has one implementation
 * (the demo, in memory); phase 2 adds Drive and the Worker behind the same
 * doors. Every method may reject with a `BowerError`.
 */

export type Unsubscribe = () => void;

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
  addPile(pile: NewPile): Promise<Pile>;
  removePile(id: string): Promise<void>;
  /** Changes a pile's note before a tidy-up reads it. */
  updatePile(id: string, text: string): Promise<Pile>;
  /** Sends again the things of a pile that did not arrive. */
  retryPile(id: string): Promise<void>;
  /** For each file, where you already have it (its path), or null. */
  duplicates(files: Array<{ name: string; body?: Blob }>): Promise<Array<string | null>>;
  questions(): Promise<Question[]>;
  answer(id: string, yes: boolean): Promise<void>;
  rules(): Promise<Rule[]>;
  requests(): Promise<Request[]>;
  addRequest(text: string): Promise<Request>;
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
  /** Keeps a suggestion as a rule, or says no to it; gives back its Undo. */
  dismissSuggestion(id: string, keep: boolean): Promise<() => Promise<void>>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface RunSource {
  /** `allowWeb`: the person lets Bower look things up on the web in this tidy-up (Settings). */
  start(scope: 'all' | 'instructions', opts?: { allowWeb?: boolean }): Promise<RunState>;
  /** The run going now, or the last one. */
  current(): Promise<RunState | null>;
  markSeen(id: string): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface Sources {
  session: Session;
  vault: VaultSource;
  runs: RunSource;
}
