/**
 * "Still as seen": the one check, right before a write, that a file is as it was read (ARCHITECTURE mechanism map;
 * TL-P4-14 `c1-still-as-seen`). Every write path states what it read as one `SeenExpectation` and asks `notAsSeen`;
 * a refusal is a `BowerError` whose `cause` carries the reason (MDN, Error: cause), so code tells it by
 * `notAsSeenReason`, never by its words.
 *
 * - Parents are compared as a set: Drive v3's `parents` has no meaning in its order (and, since 2020, holds one
 *   folder at most: https://developers.google.com/workspace/drive/api/guides/ref-single-parent).
 * - modifiedTime is compared only when the expectation carries it: a content write carries what it read, while a
 *   move, a rename or a Bin checks only the name and place it read, since a text change elsewhere does not clash with
 *   it (CLAUDE.md).
 */
import { BowerError, type ErrorCode } from './types';

/** What a write read of the file it changes (or, for a create, of the folder it goes into). */
export interface SeenExpectation {
  id: string;
  name: string;
  parents: readonly string[];
  /** Compared only when given. */
  modifiedTime?: string;
  /** Whether the write expects the file in the Bin (an unbin); false when left out. */
  trashed?: boolean;
}

/** The file as stored at the moment of the check; null when Drive no longer has it. */
export interface StoredNow {
  id: string;
  name: string;
  parents: readonly string[];
  modifiedTime: string;
  /** In the Bin; false when left out. */
  trashed?: boolean;
}

/** The app's one sentence for a write its fence refused (the app's `once`, the Journal's Undo). */
export const CHANGED_ELSEWHERE = 'This changed somewhere else. Look again and try once more.';

/** Why a file is not as it was read, in the order they are checked. */
export type NotAsSeenReason = 'never-read' | 'gone' | 'id' | 'name' | 'parents' | 'modified';

/** The typed marker on a refusal's `cause`. */
export interface NotAsSeenCause {
  kind: 'not-as-seen';
  reason: NotAsSeenReason;
}

/** The same folders, in any order. */
export const sameParents = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((p) => b.includes(p));

/** Why the stored file is not as `seen` says, or null while it still is. */
export function notAsSeen(seen: SeenExpectation, now: StoredNow | null): NotAsSeenReason | null {
  // Gone: Drive keeps no file, or it is in the Bin when the write expects it out (or out when it expects it in).
  if (!now || (now.trashed === true) !== (seen.trashed === true)) return 'gone';
  if (now.id !== seen.id) return 'id';
  if (now.name !== seen.name) return 'name';
  if (!sameParents(now.parents, seen.parents)) return 'parents';
  if (seen.modifiedTime !== undefined && now.modifiedTime !== seen.modifiedTime) return 'modified';
  return null;
}

/** A refusal of a write: the caller's one sentence for the person, the reason on its `cause`. */
export function notAsSeenError(reason: NotAsSeenReason, message: string, code: ErrorCode = 'conflict'): BowerError {
  const cause: NotAsSeenCause = { kind: 'not-as-seen', reason };
  return new BowerError(code, message, undefined, { cause });
}

/**
 * The typed marker of a check that could not read the file (the read got no answer): nothing was sent, and nothing
 * was refused, since nothing was found changed (TL-P4-14 addendum 8). The caller stops the attempt for recovery.
 */
export interface UnreadCause {
  kind: 'not-read';
  error: unknown;
}

/** A check that could not read, keeping the read's own error (and its sentence, when it is a `BowerError`). */
export function notReadError(error: unknown): BowerError {
  const cause: UnreadCause = { kind: 'not-read', error };
  return new BowerError('unknown', error instanceof BowerError ? error.message : "Bower couldn't read your Google Drive.", undefined, { cause });
}

/** A check that could not read (`notReadError`), told by its typed `cause`. */
export function notRead(e: unknown): boolean {
  return e instanceof BowerError && typeof e.cause === 'object' && e.cause !== null && (e.cause as Partial<UnreadCause>).kind === 'not-read';
}

/** Which refusal an error is, by its typed `cause`, or null when it is not a still-as-seen refusal. */
export function notAsSeenReason(e: unknown): NotAsSeenReason | null {
  if (!(e instanceof BowerError) || typeof e.cause !== 'object' || e.cause === null) return null;
  const cause = e.cause as Partial<NotAsSeenCause>;
  return cause.kind === 'not-as-seen' && typeof cause.reason === 'string' ? cause.reason : null;
}

/**
 * The fence's read: a read that got no answer (`unanswered`, the transport's own test) is no change found, so it is
 * thrown as not read (`notReadError`), never as a refusal; any other error is thrown as it is. `checkStillAsSeen` reads
 * through it, and so does `SeenFiles.read`, whose reads also include the attempt's own (no file to check).
 */
export async function readForFence<T>(reading: Promise<T>, unanswered: (e: unknown) => boolean): Promise<T> {
  try {
    return await reading;
  } catch (e) {
    throw unanswered(e) ? notReadError(e) : e;
  }
}

/**
 * A write that may already have landed: whether the stored file is now exactly what this very write makes it. Its one
 * definition is write-once's `landedAs` (`landing` there), never stated here or at a call site (TL-P4-24 addendum 8).
 */
export type Landing<T> = (now: T) => boolean;

/** What one fence accepts besides "still as seen", and how it says a refusal. */
export interface FenceOptions<T> {
  /** How to tell a read that got no answer (the transport's `isNoAnswer`). */
  unanswered: (e: unknown) => boolean;
  /** The refusal's code; `conflict` when left out. */
  code?: ErrorCode;
  /**
   * This very write, landed though its answer was lost (write-once's `landing`: its stamp, and the file exactly what the
   * write makes it). Then the fence resolves and nothing is sent again. Asked first, on the same fresh read.
   */
  landed?: Landing<T>;
}

/**
 * Still as seen, right before a write (AGENTS: every write passes what it read; a move, a rename or a Bin checks the
 * name and place it read). The one helper: the app's `once`, the pile edit's checks and the Journal's Undo call it.
 * `read` gives the file as stored now (by its id, the Bin included: a gone file is null), and the fence:
 * - resolves with it when it already holds this write (`landed`): the person's own write, landed though its answer was
 *   lost, and the file is now exactly what that write makes it; the caller sends nothing again;
 * - resolves null when it is still as `seen` says: the caller sends;
 * - throws `notAsSeenError(reason, message)` when it is neither, or `notReadError` when the read got no answer.
 * Pure but for the reader it is given, so it runs again, on a fresh read, before every resend: no state kept from an
 * earlier press decides that a step is done.
 */
export async function checkStillAsSeen<T extends StoredNow>(seen: SeenExpectation, read: () => Promise<T | null>, message: string, opts: FenceOptions<T>): Promise<T | null> {
  const now = await readForFence(read(), opts.unanswered);
  if (now && opts.landed?.(now)) return now;
  refuseNotAsSeen(seen, now, message, opts.code);
  return null;
}

/**
 * The fence's tail, on a file already read: returns while `now` is still as `seen` says, and otherwise logs the reason
 * and throws `notAsSeenError(reason, message, code)`. `checkStillAsSeen` ends with it, and so does the run's synchronous
 * check (`SeenFiles.assert`), so both refuse alike. `what` names the file in the log.
 */
export function refuseNotAsSeen(seen: SeenExpectation, now: StoredNow | null, message: string, code?: ErrorCode, what: string = seen.id): void {
  const reason = notAsSeen(seen, now);
  if (reason === null) return;
  console.error(`Refused a write to ${what}: ${reason}`);
  throw notAsSeenError(reason, message, code);
}
