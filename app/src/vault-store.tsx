/**
 * Vault state: the file index and note text, cached in IndexedDB and kept
 * fresh with stale-while-revalidate. On mount the cached index (if any)
 * renders immediately, then `listVault` runs in the background; the state
 * only changes if the fresh listing actually differs (`sameListing`), so an
 * unchanged vault never flashes.
 *
 * Plain Preact context + hook, same shape as `session.tsx`. `VaultProvider`
 * is mounted once in `app.tsx`, above the router, so every route — the
 * tree (`layout.tsx`), Home, the note view, and the `RunProvider` it wraps
 * (#37) — shares one instance and one cache.
 */

import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';

import { ApiError } from './api.js';
import {
  invalidateIndex as invalidateIndexCache,
  loadIndex,
  loadNote,
  saveIndex,
  saveNote,
} from './cache.js';
import {
  appendToFile,
  createFolder,
  createTextFile,
  deleteFile,
  DriveError,
  getText,
  listVault,
  modifiedTimeOf,
  readNoteForEdit,
  SaveError,
  saveNoteText,
  updateFileText,
} from './drive.js';
import type { DriveFile, SaveOptions } from './drive.js';
import { interviewToFiles } from './interview.js';
import type { InterviewAnswers } from './interview.js';
import {
  clearPinned,
  folderNoteName,
  pinnedOf,
  setPinned,
  sortPinned,
} from './pins.js';
import {
  applyDecision,
  dayOf,
  findProposals,
  parseProposals,
  ProposalError,
  rulesWithAccepted,
} from './proposals.js';
import type { ProposalDecision } from './proposals.js';
import {
  countRuleLines,
  migrationBlock,
  rulesVersionOf,
  rulesWithUserLines,
  splitLegacyRules,
} from './rulebook.js';
import { useSession } from './session.js';
import {
  buildVaultIndex,
  withPinnedAt,
  withRulesVersion,
} from './vault-index.js';
import type { VaultIndex } from './vault-index.js';

export type VaultStatus =
  'idle' | 'loading' | 'refreshing' | 'offline' | 'error';

export interface VaultState {
  index: VaultIndex | null;
  files: DriveFile[];
  /** ISO timestamp of the index currently shown, or `null` before the first load. */
  fetchedAt: string | null;
  status: VaultStatus;
  error?: string;
}

export interface Vault extends VaultState {
  refresh: () => Promise<void>;
  getNoteText: (id: string) => Promise<string>;
  /**
   * Appends `text` to a note in Drive as its own paragraph and updates the
   * cached note text and listing, resolving to the note's new full text.
   */
  appendToNote: (id: string, text: string) => Promise<string>;
  /**
   * A note's current text from Drive plus the `modifiedTime` an edit is
   * saved against. Offline it falls back to the text on this device with
   * `modifiedTime: null` (unknown), so a later save always asks the user.
   * Also used for "take theirs" after a conflict.
   */
  openNoteForEdit: (id: string) => Promise<EditableNote>;
  /**
   * Saves an edited note's whole text (`saveNoteText`, which throws
   * `SaveError('conflict')` when the note changed) and updates the cached
   * note text and listing, resolving to the saved text.
   */
  saveEditedNote: (
    id: string,
    text: string,
    options: SaveOptions,
  ) => Promise<EditableNote>;
  /** Pins a note: sets `pinned` in its frontmatter to now, conflict-checked
   * against the editor's own save, one retry. */
  pinNote: (id: string) => Promise<void>;
  /** Unpins a note: removes `pinned` from its frontmatter. */
  unpinNote: (id: string) => Promise<void>;
  /**
   * Pins a folder: sets `pinned` on its folder note (`_<Folder>.md`),
   * creating it with frontmatter only when the folder has none yet.
   */
  pinFolder: (path: string) => Promise<void>;
  /**
   * Unpins a folder: removes `pinned` from its folder note, deleting the
   * note only when nothing else is left in it.
   */
  unpinFolder: (path: string) => Promise<void>;
  /**
   * "Update Bower's rules" (Settings › Advanced, #197): appends the owner's
   * own additions to the old rulebook (`splitLegacyRules`) to `Rules.md`
   * (creating it from the template when missing), then replaces `CLAUDE.md`
   * with the template compiled into the app. Both writes are
   * conflict-checked; running it again after a failure never duplicates
   * lines.
   */
  updateRules: () => Promise<RulesUpdate>;
  /**
   * The first-run interview (#198): writes `answers` into `About-Me.md` and
   * `Rules.md` (each conflict-checked, only their own `## From the
   * interview` section touched, created when either file is missing) and
   * creates a `_<Area>.md` folder note under `2-Areas/` for every answered
   * area that does not already have a folder there. Safe to call again
   * (Settings › Advanced, replay): an existing area is left exactly as it
   * is, and the two sections are replaced, not duplicated.
   */
  submitInterview: (answers: InterviewAnswers) => Promise<InterviewOutcome>;
  /**
   * Accepts or dismisses one of Bower's proposals (#199,
   * `runProposalDecision`): Accept appends its rule to `Rules.md` first,
   * then both accept and dismiss mark the proposal, each write
   * conflict-checked.
   */
  decideProposal: (id: string, decision: ProposalDecision) => Promise<void>;
}

/** What `updateRules` did. */
export interface RulesUpdate {
  /** The vault's `bower_rules_version` before the update. */
  from: number;
  /** The version it has now: the template's, or `from` if it was not behind. */
  to: number;
  /** How many of the owner's lines moved to `Rules.md` (blank lines not counted). */
  moved: number;
}

/** What `submitInterview` did. */
export interface InterviewOutcome {
  /** Area names whose folder note was created. */
  areasCreated: readonly string[];
  /** Area names left alone because a folder of that name already existed
   * under `2-Areas/`. */
  areasSkipped: readonly string[];
}

export interface PinnedNote {
  kind: 'note';
  file: DriveFile;
  pinnedAt: string;
}

export interface PinnedFolder {
  kind: 'folder';
  path: string;
  file: DriveFile;
  pinnedAt: string;
}

export type PinnedItem = PinnedNote | PinnedFolder;

/**
 * Notes and folders with a `pinned` timestamp, newest first (spec §14).
 * Pure: reads only what `index`'s `notePinnedAt`/`folderPinnedAt` already
 * carry — filled in by `VaultProvider`'s load pipeline, not here.
 */
export function pinned(index: VaultIndex): PinnedItem[] {
  const items: PinnedItem[] = [];
  for (const [id, pinnedAt] of index.notePinnedAt) {
    const file = index.byId.get(id);
    if (file !== undefined) items.push({ kind: 'note', file, pinnedAt });
  }
  for (const [path, pinnedAt] of index.folderPinnedAt) {
    const file = index.folderNotes.get(path);
    if (file !== undefined) {
      items.push({ kind: 'folder', path, file, pinnedAt });
    }
  }
  return sortPinned(items);
}

export interface EditableNote {
  text: string;
  /** Baseline for the next save; `null` when unknown (opened offline). */
  modifiedTime: string | null;
}

/** A note that has never been fetched, offline, with nothing cached to show. */
export class OfflineError extends Error {
  constructor(
    message = 'This note has not been saved for offline reading yet.',
  ) {
    super(message);
    this.name = 'OfflineError';
  }
}

interface ListingEntry {
  id: string;
  modifiedTime?: string;
}

/**
 * Whether two listings are the same vault, file for file (id and
 * `modifiedTime`; both come pre-sorted by path from `listVault`, so an
 * unchanged vault always compares equal in order).
 */
export function sameListing(a: ListingEntry[], b: ListingEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (file, i) =>
      file.id === b[i]?.id && file.modifiedTime === b[i]?.modifiedTime,
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A short "Updated …" indicator. Anything past 24 h just says "yesterday":
 * the app expects a refresh long before that matters.
 */
export function formatAgo(fetchedAt: string, now: number | Date): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const diffMs = Math.max(0, nowMs - Date.parse(fetchedAt));
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} min ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)} h ago`;
  return 'yesterday';
}

/** A failed fetch whose only reasonable explanation is "no network". */
function isNetworkFailure(err: unknown): boolean {
  return (
    (err instanceof DriveError || err instanceof ApiError) && err.status === 0
  );
}

/** The listed file for note `id`; a note missing from the index is a bug. */
function noteFile(state: VaultState, id: string): DriveFile {
  const file = state.index?.byId.get(id);
  if (file === undefined) throw new Error('Note not in the index.');
  return file;
}

/** Lazy fetches per `hydratePinnedAt` call: a vault with many pins still
 * costs at most this many requests per load; the rest catch up on a later
 * load, or as soon as their note is opened normally. */
const PINNED_HYDRATION_FETCH_CAP = 12;

interface PinnedMaps {
  notePinnedAt: Map<string, string>;
  folderPinnedAt: Map<string, string>;
}

/**
 * `pinned` timestamps for every note and folder note in `index`: read from
 * the cached text when present (no network), otherwise fetched from Drive up
 * to `PINNED_HYDRATION_FETCH_CAP` times. `buildVaultIndex` is pure and never
 * reads frontmatter, so this is the one place that does.
 */
async function hydratePinnedAt(index: VaultIndex): Promise<PinnedMaps> {
  const notePinnedAt = new Map<string, string>();
  const folderPinnedAt = new Map<string, string>();
  let fetches = 0;

  const resolve = async (
    id: string,
    modifiedTime: string | undefined,
  ): Promise<string | null> => {
    const cached = await loadNote(id);
    if (cached !== undefined && cached.modifiedTime === (modifiedTime ?? '')) {
      return pinnedOf(cached.text);
    }
    if (fetches >= PINNED_HYDRATION_FETCH_CAP) {
      return cached !== undefined ? pinnedOf(cached.text) : null;
    }
    fetches++;
    try {
      const text = await getText(id);
      await saveNote(id, text, modifiedTime ?? '', new Date().toISOString());
      return pinnedOf(text);
    } catch (err) {
      console.error(err);
      return cached !== undefined ? pinnedOf(cached.text) : null;
    }
  };

  for (const note of index.notes) {
    const pinnedAt = await resolve(note.id, note.modifiedTime);
    if (pinnedAt !== null) notePinnedAt.set(note.id, pinnedAt);
  }
  for (const [path, file] of index.folderNotes) {
    const pinnedAt = await resolve(file.id, file.modifiedTime);
    if (pinnedAt !== null) folderPinnedAt.set(path, pinnedAt);
  }

  return { notePinnedAt, folderPinnedAt };
}

/** The rulebook's path, relative to the Bower folder. */
const RULEBOOK_PATH = 'CLAUDE.md';
/** The owner's rules, next to it. */
const RULES_PATH = 'Rules.md';
/** The owner's profile, also next to it. */
const ABOUT_ME_PATH = 'About-Me.md';
/** Where the interview's area folder notes go. */
const AREAS_PATH = '2-Areas';

/**
 * The vault's `bower_rules_version` (#197), from the cached `CLAUDE.md`
 * text when it is current, otherwise from one fetch (which is cached for
 * next time). `null` with no `CLAUDE.md`, or when neither is available.
 */
async function hydrateRulesVersion(index: VaultIndex): Promise<number | null> {
  const file = index.byPath.get(RULEBOOK_PATH);
  if (file === undefined) return null;
  const modifiedTime = file.modifiedTime ?? '';
  const cached = await loadNote(file.id);
  if (cached !== undefined && cached.modifiedTime === modifiedTime) {
    return rulesVersionOf(cached.text);
  }
  try {
    const text = await getText(file.id);
    await saveNote(file.id, text, modifiedTime, new Date().toISOString());
    return rulesVersionOf(text);
  } catch (err) {
    console.error(err);
    return cached !== undefined ? rulesVersionOf(cached.text) : null;
  }
}

/** `index` with everything `buildVaultIndex` leaves empty filled in: pins
 * and the rulebook's version. */
async function hydrate(index: VaultIndex): Promise<VaultIndex> {
  const { notePinnedAt, folderPinnedAt } = await hydratePinnedAt(index);
  const version = await hydrateRulesVersion(index);
  return withRulesVersion(
    withPinnedAt(index, notePinnedAt, folderPinnedAt),
    version,
  );
}

/** The template compiled into the app (`rulebook-template.ts`). */
export interface RulebookTemplate {
  /** `vault-template/CLAUDE.md`. */
  text: string;
  /** `vault-template/Rules.md`. */
  rules: string;
  /** Its `bower_rules_version`. */
  version: number;
  /** Lines only earlier versions of it had (`rulebook-retired.ts`). */
  retired: readonly string[];
}

export interface RulesUpdateInput {
  /** The Bower folder, where a missing `Rules.md` is created. */
  folderId: string;
  /** `CLAUDE.md` as listed. */
  rulebook: DriveFile;
  /** `Rules.md` as listed, when the folder has one. */
  rulesFile: DriveFile | undefined;
  template: RulebookTemplate;
}

/** What `runRulesUpdate` wrote, for the caller to patch its cache with. */
export interface RulesUpdateWrites {
  result: RulesUpdate;
  /** The rulebook as it is now: rewritten, or as read when not behind. */
  rulebook: { text: string; file: DriveFile };
  /** `Rules.md` after an append, or `null` when it was not rewritten. */
  rules: { text: string; file: DriveFile } | null;
  /** Whether `Rules.md` was created (it is not in any listing yet). */
  createdRules: boolean;
}

/**
 * The rulebook update (#197), through Drive: reads `CLAUDE.md` fresh; when
 * its `bower_rules_version` is behind the template's, appends the owner's
 * additions to it (`splitLegacyRules`, `migrationBlock`) to `Rules.md` (creating it from the
 * template when missing), then replaces `CLAUDE.md` with the template, the
 * one write the protected-note guard lets through (`forceProtected`). The
 * owner's lines go first, so should the rulebook write fail they are
 * already safe in `Rules.md`, and running it again adds nothing twice
 * (`rulesWithUserLines`). Both writes are checked against the
 * `modifiedTime` read just before them.
 */
export async function runRulesUpdate(
  input: RulesUpdateInput,
): Promise<RulesUpdateWrites> {
  const { folderId, rulebook, rulesFile, template } = input;
  const old = await readNoteForEdit(rulebook.id);
  const from = rulesVersionOf(old.text);
  if (from >= template.version) {
    return {
      result: { from, to: from, moved: 0 },
      rulebook: {
        text: old.text,
        file: { ...rulebook, modifiedTime: old.modifiedTime },
      },
      rules: null,
      createdRules: false,
    };
  }

  const legacy = splitLegacyRules(old.text, template.text, template.retired);
  const userRules = migrationBlock(legacy, from);
  let rules: RulesUpdateWrites['rules'] = null;
  let createdRules = false;
  if (rulesFile === undefined) {
    await createTextFile(
      folderId,
      RULES_PATH,
      rulesWithUserLines(template.rules, userRules),
    );
    createdRules = true;
  } else if (userRules.length > 0) {
    const current = await readNoteForEdit(rulesFile.id);
    const next = rulesWithUserLines(current.text, userRules);
    if (next !== current.text) {
      rules = await saveNoteText(rulesFile, next, {
        baseModifiedTime: current.modifiedTime,
      });
    }
  }

  const saved = await saveNoteText(rulebook, template.text, {
    baseModifiedTime: old.modifiedTime,
    forceProtected: true,
  });
  return {
    result: {
      from,
      to: template.version,
      moved: countRuleLines(legacy.userRules) + countRuleLines(legacy.migrated),
    },
    rulebook: saved,
    rules,
    createdRules,
  };
}

export interface InterviewInput {
  /** The Bower folder, where a missing `About-Me.md` or `Rules.md` is created. */
  folderId: string;
  /** `About-Me.md` as listed, when the folder has one. */
  aboutFile: DriveFile | undefined;
  /** `Rules.md` as listed, when the folder has one. */
  rulesFile: DriveFile | undefined;
  /** `2-Areas`'s own id, where an area's folder is created. */
  areasFolderId: string;
  /** Names of the folders `2-Areas` already has (case as Drive has them),
   * so an area the owner already started is left alone. */
  existingAreaNames: ReadonlySet<string>;
  answers: InterviewAnswers;
}

/** One area's folder note, once created. */
export interface CreatedArea {
  name: string;
  folder: DriveFile;
  note: DriveFile;
}

/** What `runInterview` wrote, for the caller to patch its cache with. */
export interface InterviewWrites {
  result: InterviewOutcome;
  /** `About-Me.md` after the write, or `null` when its text did not change. */
  aboutMe: { text: string; file: DriveFile } | null;
  /** Whether `About-Me.md` was created (it is not in any listing yet). */
  createdAbout: boolean;
  /** `Rules.md` after the write, or `null` when its text did not change. */
  rules: { text: string; file: DriveFile } | null;
  /** Whether `Rules.md` was created (it is not in any listing yet). */
  createdRules: boolean;
  createdAreas: CreatedArea[];
}

/**
 * The first-run interview (#198), through Drive: `interviewToFiles` computes
 * `About-Me.md`'s and `Rules.md`'s new text from the answers and what each
 * file already holds (creating either from an empty note when the folder
 * has none yet), and each write only goes out when its text actually
 * changed, conflict-checked against the `modifiedTime` read just before it.
 * Every area answered gets its own folder under `2-Areas/` and a
 * `_<name>.md` note inside it, except one whose folder is already there
 * (`existingAreaNames`) — running this again after a partial failure never
 * creates the same area twice, and an area the owner has since filled with
 * real notes is never touched.
 */
export async function runInterview(
  input: InterviewInput,
): Promise<InterviewWrites> {
  const {
    folderId,
    aboutFile,
    rulesFile,
    areasFolderId,
    existingAreaNames,
    answers,
  } = input;

  const aboutBefore =
    aboutFile !== undefined ? await readNoteForEdit(aboutFile.id) : null;
  const rulesBefore =
    rulesFile !== undefined ? await readNoteForEdit(rulesFile.id) : null;

  const files = interviewToFiles(answers, {
    aboutMe: aboutBefore?.text ?? '',
    rules: rulesBefore?.text ?? '',
  });

  let aboutMe: InterviewWrites['aboutMe'] = null;
  let createdAbout = false;
  if (files.aboutMe !== (aboutBefore?.text ?? '')) {
    if (aboutFile === undefined) {
      const created = await createTextFile(
        folderId,
        ABOUT_ME_PATH,
        files.aboutMe,
      );
      aboutMe = { text: files.aboutMe, file: created };
      createdAbout = true;
    } else if (aboutBefore !== null) {
      aboutMe = await saveNoteText(aboutFile, files.aboutMe, {
        baseModifiedTime: aboutBefore.modifiedTime,
      });
    }
  }

  let rules: InterviewWrites['rules'] = null;
  let createdRules = false;
  if (files.rules !== (rulesBefore?.text ?? '')) {
    if (rulesFile === undefined) {
      const created = await createTextFile(folderId, RULES_PATH, files.rules);
      rules = { text: files.rules, file: created };
      createdRules = true;
    } else if (rulesBefore !== null) {
      rules = await saveNoteText(rulesFile, files.rules, {
        baseModifiedTime: rulesBefore.modifiedTime,
      });
    }
  }

  const createdAreas: CreatedArea[] = [];
  const areasCreated: string[] = [];
  const areasSkipped: string[] = [];
  for (const area of files.areas) {
    if (existingAreaNames.has(area.name)) {
      areasSkipped.push(area.name);
      continue;
    }
    const folder = await createFolder(areasFolderId, area.name);
    const note = await createTextFile(folder.id, `_${area.name}.md`, area.note);
    createdAreas.push({ name: area.name, folder, note });
    areasCreated.push(area.name);
  }

  return {
    result: { areasCreated, areasSkipped },
    aboutMe,
    createdAbout,
    rules,
    createdRules,
    createdAreas,
  };
}

export interface ProposalDecisionInput {
  /** The Bower folder, where a missing `Rules.md` is created. */
  folderId: string;
  /** `Answers/Bower - Proposals.md` as listed. */
  proposalsFile: DriveFile;
  /** `Rules.md` as listed, when the folder has one. */
  rulesFile: DriveFile | undefined;
  id: string;
  decision: ProposalDecision;
  /** `YYYY-MM-DD` written as the decision's date. */
  on: string;
}

/** What `runProposalDecision` wrote, for the caller to patch its cache with. */
export interface ProposalDecisionWrites {
  /** The proposals file after the write, or `null` when it did not change. */
  proposals: { text: string; file: DriveFile } | null;
  /** `Rules.md` after the write, or `null` when its text did not change. */
  rules: { text: string; file: DriveFile } | null;
  /** Whether `Rules.md` was created (it is not in any listing yet). */
  createdRules: boolean;
}

/**
 * A proposal decided (#199), through Drive: reads the proposals file fresh
 * and finds the proposal (`ProposalError('missing')` when it is gone). On
 * Accept, the rule goes to `Rules.md` first (`rulesWithAccepted`, created
 * from an empty note when the folder has none), so should the second write
 * fail the rule is already safe and accepting again adds nothing twice;
 * then the proposal is marked (`applyDecision`). Each write only goes out
 * when its text changed, conflict-checked against the `modifiedTime` read
 * just before it.
 */
export async function runProposalDecision(
  input: ProposalDecisionInput,
): Promise<ProposalDecisionWrites> {
  const { folderId, proposalsFile, rulesFile, id, decision, on } = input;
  const before = await readNoteForEdit(proposalsFile.id);
  const proposal = parseProposals(before.text).find((p) => p.id === id);
  if (proposal === undefined) {
    throw new ProposalError('missing', 'That suggestion is no longer there.');
  }
  // Refuses a proposal already decided the other way before touching
  // `Rules.md`.
  const marked = applyDecision(before.text, id, decision, on);

  let rules: ProposalDecisionWrites['rules'] = null;
  let createdRules = false;
  if (decision === 'accepted') {
    const rulesBefore =
      rulesFile !== undefined ? await readNoteForEdit(rulesFile.id) : null;
    const text = rulesWithAccepted(rulesBefore?.text ?? '', proposal, on);
    if (text !== (rulesBefore?.text ?? '')) {
      if (rulesFile === undefined) {
        const created = await createTextFile(folderId, RULES_PATH, text);
        rules = { text, file: created };
        createdRules = true;
      } else if (rulesBefore !== null) {
        rules = await saveNoteText(rulesFile, text, {
          baseModifiedTime: rulesBefore.modifiedTime,
        });
      }
    }
  }

  const proposals =
    marked === before.text
      ? null
      : await saveNoteText(proposalsFile, marked, {
          baseModifiedTime: before.modifiedTime,
        });
  return { proposals, rules, createdRules };
}

/** Attempts per note or folder-note pin write: the first one plus one retry
 * after a conflict, same as `appendToFile`. */
const PIN_ATTEMPTS = 2;

const VaultContext = createContext<Vault | undefined>(undefined);

interface VaultProviderProps {
  children: ComponentChildren;
}

export function VaultProvider({ children }: VaultProviderProps) {
  const { me } = useSession();
  const folderId = me?.vault?.folderId ?? null;

  const [state, setState] = useState<VaultState>({
    index: null,
    files: [],
    fetchedAt: null,
    status: folderId === null ? 'idle' : 'loading',
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (folderId === null) return;
      const cachedFiles = stateRef.current.files;
      const hadIndex = stateRef.current.index !== null;
      if (mode === 'refresh') {
        setState((prev) => ({ ...prev, status: 'refreshing' }));
      }
      try {
        const fresh = await listVault(folderId);
        if (hadIndex && sameListing(cachedFiles, fresh)) {
          // Identical to what's already shown: leave the state alone (no flash).
          setState((prev) => ({ ...prev, status: 'idle', error: undefined }));
          return;
        }
        const fetchedAt = new Date().toISOString();
        await saveIndex(fresh, fetchedAt);
        const index = await hydrate(buildVaultIndex(fresh));
        setState({
          index,
          files: fresh,
          fetchedAt,
          status: 'idle',
        });
      } catch (err) {
        console.error(err);
        const offline =
          isNetworkFailure(err) && stateRef.current.index !== null;
        setState((prev) => ({
          ...prev,
          status: offline ? 'offline' : 'error',
          error: offline ? undefined : 'Could not load your notes.',
        }));
      }
    },
    [folderId],
  );

  useEffect(() => {
    if (folderId === null) {
      // Either not onboarded yet, or signed out: `me` (and so `folderId`)
      // goes back to `undefined`/`null` the moment `session.tsx` sets
      // `status: 'signed-out'`, on sign-out, delete-account and a 401 for
      // a session that was previously signed in. Reacting to that here —
      // rather than a separate explicit reset call — is the seam that
      // needs no wiring from `forget.ts` itself: the in-memory index and
      // note text are dropped as an ordinary consequence of `me` becoming
      // unavailable, the same way this effect already resets state for a
      // signed-in user with no vault yet.
      setState({ index: null, files: [], fetchedAt: null, status: 'idle' });
      return;
    }
    let cancelled = false;
    loadIndex()
      .then((cached) => {
        if (cancelled || cached === undefined) return;
        const builtIndex = buildVaultIndex(cached.files);
        setState({
          index: builtIndex,
          files: cached.files,
          fetchedAt: cached.fetchedAt,
          status: 'idle',
        });
        // Pinned state and the rulebook's version lag a beat behind the
        // instant cached paint above (this file's own opening comment):
        // fill them in as soon as they are ready, unless `load('initial')`
        // already replaced this index.
        void hydrate(builtIndex).then((index) => {
          if (cancelled) return;
          setState((prev) =>
            prev.index === builtIndex ? { ...prev, index } : prev,
          );
        });
      })
      .catch((err: unknown) => {
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) void load('initial');
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, load]);

  const refresh = useCallback((): Promise<void> => load('refresh'), [load]);

  const getNoteText = useCallback(async (id: string): Promise<string> => {
    const file = stateRef.current.index?.byId.get(id);
    const cached = await loadNote(id);
    if (
      cached !== undefined &&
      file?.modifiedTime !== undefined &&
      cached.modifiedTime === file.modifiedTime
    ) {
      return cached.text;
    }
    try {
      const text = await getText(id);
      await saveNote(
        id,
        text,
        file?.modifiedTime ?? '',
        new Date().toISOString(),
      );
      return text;
    } catch (err) {
      if (cached !== undefined) return cached.text;
      if (isNetworkFailure(err)) throw new OfflineError();
      throw err;
    }
  }, []);

  /**
   * Caches `text` as note `id` under its new `modifiedTime` and patches that
   * one file in the listing, so the note view shows it at once without
   * walking the whole Bower folder again. Cache failures are logged only.
   */
  const recordNote = useCallback(
    async (
      id: string,
      text: string,
      saved: { modifiedTime?: string; size?: number },
    ): Promise<void> => {
      const modifiedTime = saved.modifiedTime ?? '';
      const now = new Date().toISOString();
      try {
        await saveNote(id, text, modifiedTime, now);
      } catch (err) {
        console.error(err);
      }
      const files = stateRef.current.files.map((f) =>
        f.id === id
          ? {
              ...f,
              ...(modifiedTime !== '' ? { modifiedTime } : {}),
              ...(saved.size !== undefined ? { size: saved.size } : {}),
            }
          : f,
      );
      const fetchedAt = stateRef.current.fetchedAt ?? now;
      const builtIndex = buildVaultIndex(files);
      // `buildVaultIndex` starts `notePinnedAt` empty; carry the rest of it
      // over, refreshed for this one note from the text just saved (its
      // `pinned` may be new, changed or gone).
      const notePinnedAt = new Map(stateRef.current.index?.notePinnedAt ?? []);
      const iso = pinnedOf(text);
      if (iso === null) notePinnedAt.delete(id);
      else notePinnedAt.set(id, iso);
      // Same for the rulebook's version: carried over, or read from the
      // text just saved when this note is the rulebook.
      const bowerRulesVersion =
        files.find((f) => f.id === id)?.path === RULEBOOK_PATH
          ? rulesVersionOf(text)
          : (stateRef.current.index?.bowerRulesVersion ?? null);
      const index = withRulesVersion(
        withPinnedAt(
          builtIndex,
          notePinnedAt,
          stateRef.current.index?.folderPinnedAt ?? new Map<string, string>(),
        ),
        bowerRulesVersion,
      );
      setState((prev) => ({ ...prev, files, index }));
      try {
        await saveIndex(files, fetchedAt);
      } catch (err) {
        console.error(err);
      }
    },
    [],
  );

  const appendToNote = useCallback(
    async (id: string, text: string): Promise<string> => {
      const result = await appendToFile(noteFile(stateRef.current, id), text);
      await recordNote(id, result.text, result.file);
      return result.text;
    },
    [recordNote],
  );

  const openNoteForEdit = useCallback(
    async (id: string): Promise<EditableNote> => {
      try {
        const fresh = await readNoteForEdit(id);
        await recordNote(id, fresh.text, { modifiedTime: fresh.modifiedTime });
        return fresh;
      } catch (err) {
        if (!isNetworkFailure(err)) throw err;
        return { text: await getNoteText(id), modifiedTime: null };
      }
    },
    [recordNote, getNoteText],
  );

  const saveEditedNote = useCallback(
    async (
      id: string,
      text: string,
      options: SaveOptions,
    ): Promise<EditableNote> => {
      const result = await saveNoteText(
        noteFile(stateRef.current, id),
        text,
        options,
      );
      await recordNote(id, result.text, result.file);
      return {
        text: result.text,
        modifiedTime: result.file.modifiedTime ?? null,
      };
    },
    [recordNote],
  );

  const updateNotePin = useCallback(
    async (id: string, compute: (text: string) => string): Promise<void> => {
      const target = noteFile(stateRef.current, id);
      for (let attempt = 1; ; attempt++) {
        const fresh = await readNoteForEdit(id);
        try {
          const result = await saveNoteText(target, compute(fresh.text), {
            baseModifiedTime: fresh.modifiedTime,
          });
          await recordNote(id, result.text, result.file);
          return;
        } catch (err) {
          const retry =
            err instanceof SaveError &&
            err.code === 'conflict' &&
            attempt < PIN_ATTEMPTS;
          if (!retry) throw err;
        }
      }
    },
    [recordNote],
  );

  const pinNote = useCallback(
    (id: string): Promise<void> =>
      updateNotePin(id, (text) => setPinned(text, new Date().toISOString())),
    [updateNotePin],
  );

  const unpinNote = useCallback(
    (id: string): Promise<void> => updateNotePin(id, clearPinned),
    [updateNotePin],
  );

  /**
   * Patches one folder note into the cached listing and index after it was
   * created, rewritten or trashed (`file: null`), mirroring `recordNote` for
   * a file that `buildVaultIndex` keeps out of `files`/`byId` on purpose
   * (folder notes are hidden, `vault-index.ts`). `pinnedAt: null` clears the
   * folder's pin.
   */
  const recordFolderNote = useCallback(
    async (
      path: string,
      file: DriveFile | null,
      pinnedAt: string | null,
    ): Promise<void> => {
      const previous = stateRef.current.index?.folderNotes.get(path);
      const files = stateRef.current.files.filter((f) => f.id !== previous?.id);
      if (file !== null) files.push(file);
      const fetchedAt = stateRef.current.fetchedAt ?? new Date().toISOString();
      const builtIndex = buildVaultIndex(files);
      const folderPinnedAt = new Map(
        stateRef.current.index?.folderPinnedAt ?? [],
      );
      if (pinnedAt === null) folderPinnedAt.delete(path);
      else folderPinnedAt.set(path, pinnedAt);
      const index = withRulesVersion(
        withPinnedAt(
          builtIndex,
          stateRef.current.index?.notePinnedAt ?? new Map<string, string>(),
          folderPinnedAt,
        ),
        stateRef.current.index?.bowerRulesVersion ?? null,
      );
      setState((prev) => ({ ...prev, files, index }));
      try {
        await saveIndex(files, fetchedAt);
      } catch (err) {
        console.error(err);
      }
    },
    [],
  );

  const pinFolder = useCallback(
    async (path: string): Promise<void> => {
      const folder = stateRef.current.index?.byPath.get(path);
      if (folder === undefined) throw new Error('Folder not in the index.');
      const iso = new Date().toISOString();
      const existing = stateRef.current.index?.folderNotes.get(path);

      if (existing === undefined) {
        const created = await createTextFile(
          folder.id,
          folderNoteName(path),
          setPinned('', iso),
        );
        await recordFolderNote(path, created, iso);
        return;
      }

      for (let attempt = 1; ; attempt++) {
        const fresh = await readNoteForEdit(existing.id);
        if ((await modifiedTimeOf(existing.id)) !== fresh.modifiedTime) {
          if (attempt < PIN_ATTEMPTS) continue;
          throw new SaveError(
            'conflict',
            'The folder note changed while saving.',
          );
        }
        const updated = await updateFileText(
          existing.id,
          setPinned(fresh.text, iso),
        );
        await recordFolderNote(path, updated, iso);
        return;
      }
    },
    [recordFolderNote],
  );

  const unpinFolder = useCallback(
    async (path: string): Promise<void> => {
      const existing = stateRef.current.index?.folderNotes.get(path);
      if (existing === undefined) return; // Nothing pinned.

      for (let attempt = 1; ; attempt++) {
        const fresh = await readNoteForEdit(existing.id);
        if ((await modifiedTimeOf(existing.id)) !== fresh.modifiedTime) {
          if (attempt < PIN_ATTEMPTS) continue;
          throw new SaveError(
            'conflict',
            'The folder note changed while saving.',
          );
        }
        const next = clearPinned(fresh.text);
        if (next.trim() === '') {
          // Nothing else was in it: the folder note was pinning's own.
          await deleteFile(existing.id);
          await recordFolderNote(path, null, null);
        } else {
          const updated = await updateFileText(existing.id, next);
          await recordFolderNote(path, updated, null);
        }
        return;
      }
    },
    [recordFolderNote],
  );

  const updateRules = useCallback(async (): Promise<RulesUpdate> => {
    if (folderId === null) throw new Error('No Bower folder yet.');
    const rulebook = stateRef.current.index?.byPath.get(RULEBOOK_PATH);
    if (rulebook === undefined) throw new Error('No rulebook in the index.');
    const {
      TEMPLATE_RULEBOOK: text,
      TEMPLATE_RULES: rules,
      TEMPLATE_RULES_VERSION: version,
      TEMPLATE_RETIRED_LINES: retired,
    } = await import('./rulebook-template.js');

    const writes = await runRulesUpdate({
      folderId,
      rulebook,
      rulesFile: stateRef.current.index?.byPath.get(RULES_PATH),
      template: { text, rules, version, retired },
    });
    if (writes.rules !== null) {
      await recordNote(
        writes.rules.file.id,
        writes.rules.text,
        writes.rules.file,
      );
    }
    await recordNote(rulebook.id, writes.rulebook.text, writes.rulebook.file);
    // A new `Rules.md` is not in the listing yet: list the folder again.
    if (writes.createdRules) await load('refresh');
    return writes.result;
  }, [folderId, recordNote, load]);

  const submitInterview = useCallback(
    async (answers: InterviewAnswers): Promise<InterviewOutcome> => {
      if (folderId === null) throw new Error('No Bower folder yet.');
      // The interview runs right after the folder is created, before this
      // provider's own listing may have caught up: make sure it has.
      await refresh();
      const index = stateRef.current.index;
      if (index === null) throw new Error('Vault not loaded.');
      const areasFolder = index.byPath.get(AREAS_PATH);
      if (areasFolder === undefined) {
        throw new Error('No 2-Areas folder in the vault.');
      }

      const prefix = `${AREAS_PATH}/`;
      const existingAreaNames = new Set(
        index.folders
          .filter(
            (f) =>
              f.path.startsWith(prefix) &&
              !f.path.slice(prefix.length).includes('/'),
          )
          .map((f) => f.name),
      );

      const writes = await runInterview({
        folderId,
        aboutFile: index.byPath.get(ABOUT_ME_PATH),
        rulesFile: index.byPath.get(RULES_PATH),
        areasFolderId: areasFolder.id,
        existingAreaNames,
        answers,
      });

      if (
        writes.createdAbout ||
        writes.createdRules ||
        writes.createdAreas.length > 0
      ) {
        // A new file or folder is not in the listing yet: list it again.
        await load('refresh');
      } else {
        if (writes.aboutMe !== null) {
          await recordNote(
            writes.aboutMe.file.id,
            writes.aboutMe.text,
            writes.aboutMe.file,
          );
        }
        if (writes.rules !== null) {
          await recordNote(
            writes.rules.file.id,
            writes.rules.text,
            writes.rules.file,
          );
        }
      }
      return writes.result;
    },
    [folderId, refresh, recordNote, load],
  );

  const decideProposal = useCallback(
    async (id: string, decision: ProposalDecision): Promise<void> => {
      if (folderId === null) throw new Error('No Bower folder yet.');
      const index = stateRef.current.index;
      const proposalsFile = index === null ? undefined : findProposals(index);
      if (index === null || proposalsFile === undefined) {
        throw new ProposalError(
          'missing',
          'That suggestion is no longer there.',
        );
      }
      const writes = await runProposalDecision({
        folderId,
        proposalsFile,
        rulesFile: index.byPath.get(RULES_PATH),
        id,
        decision,
        on: dayOf(new Date()),
      });
      if (writes.rules !== null) {
        await recordNote(
          writes.rules.file.id,
          writes.rules.text,
          writes.rules.file,
        );
      }
      if (writes.proposals !== null) {
        await recordNote(
          writes.proposals.file.id,
          writes.proposals.text,
          writes.proposals.file,
        );
      }
      // A new `Rules.md` is not in the listing yet: list the folder again.
      if (writes.createdRules) await load('refresh');
    },
    [folderId, recordNote, load],
  );

  const value: Vault = {
    ...state,
    refresh,
    getNoteText,
    appendToNote,
    openNoteForEdit,
    saveEditedNote,
    pinNote,
    unpinNote,
    pinFolder,
    unpinFolder,
    updateRules,
    submitInterview,
    decideProposal,
  };

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault(): Vault {
  const ctx = useContext(VaultContext);
  if (ctx === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return ctx;
}

/**
 * Call once a run reports `done` (#37): the vault content may have changed
 * underneath, so drop the cached index. `run-store.tsx` calls this and then
 * `refresh()` from `useVault()` to update the mounted provider right away.
 */
export async function invalidateAfterRun(): Promise<void> {
  await invalidateIndexCache();
}
