import type {
  ChangeEntry,
  FolderState,
  NewPile,
  Note,
  ParaRoot,
  Pile,
  Question,
  Rule,
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
  folderState(): Promise<FolderState>;
  /** Makes the Bower folder; `onStep` hears each top folder as it appears. */
  createFolder(onStep: (root: ParaRoot) => void): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface VaultSource {
  tree(): Promise<TreeNode[]>;
  note(path: string): Promise<Note>;
  move(path: string, toFolder: string): Promise<string>;
  rename(path: string, name: string): Promise<string>;
  create(folder: string, type: 'note' | 'folder', name?: string): Promise<string>;
  trash(path: string): Promise<void>;
  restore(path: string): Promise<void>;
  markSeen(path: string): Promise<void>;
  piles(): Promise<Pile[]>;
  addPile(pile: NewPile): Promise<Pile>;
  removePile(id: string): Promise<void>;
  questions(): Promise<Question[]>;
  answer(id: string, yes: boolean): Promise<void>;
  rules(): Promise<Rule[]>;
  addRule(text: string): Promise<Rule>;
  suggestions(): Promise<Suggestion[]>;
  /** Ticks or unticks the n-th task (`- [ ]`) of a note's body. */
  toggleTask(path: string, index: number): Promise<void>;
  /** Your changes since the last tidy-up (the change journal). */
  changes(): Promise<ChangeEntry[]>;
  dismissSuggestion(id: string, keep: boolean): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

export interface RunSource {
  start(scope: 'all' | 'instructions'): Promise<RunState>;
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
