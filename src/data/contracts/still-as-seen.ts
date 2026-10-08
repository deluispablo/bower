/**
 * "Still as seen": the one check, right before a write, that a file is as it was read (ARCHITECTURE mechanism map;
 * TL-P4-14 `c1-still-as-seen`). Every write path states what it read as one `SeenExpectation` and asks `notAsSeen`;
 * a refusal is a `BowerError` whose `cause` carries the reason (MDN, Error: cause), so code tells it by
 * `notAsSeenReason`, never by its words.
 *
 * - Parents are compared as a set: Drive v3's `parents` has no meaning in its order (and, since 2020, holds one
 *   folder at most: https://developers.google.com/workspace/drive/api/guides/ref-single-parent).
 * - modifiedTime and the content's SHA-256 are compared only when the expectation carries them: a content write
 *   carries what it read, while a move, a rename or a Bin checks only the name and place it read, since a text change
 *   elsewhere does not clash with it (AGENTS.md).
 * - `children`, when given, are the only live children it may have (a pile folder Binned with what it held).
 */
import { BowerError, type ErrorCode } from './types';

/** What a write read of the file it changes (or, for a create, of the folder it goes into). */
export interface SeenExpectation {
  id: string;
  name: string;
  parents: readonly string[];
  /** Compared only when given. */
  modifiedTime?: string;
  /** The stored content's SHA-256, hex; compared only when given. */
  sha256?: string;
  /** The live children it may have; compared only when given. */
  children?: readonly string[];
}

/** The file as stored at the moment of the check; null when Drive no longer has it. */
export interface StoredNow {
  id: string;
  name: string;
  parents: readonly string[];
  modifiedTime: string;
  trashed: boolean;
  /** The stored content's SHA-256, when the read gave it. */
  sha256?: string | null;
  /** Its live children's ids, when the read gave them. */
  children?: readonly string[];
}

/** Why a file is not as it was read, in the order they are checked. */
export type NotAsSeenReason = 'never-read' | 'gone' | 'id' | 'name' | 'parents' | 'modified' | 'content' | 'children';

/** The typed marker on a refusal's `cause`. */
export interface NotAsSeenCause {
  kind: 'not-as-seen';
  reason: NotAsSeenReason;
}

/** The same folders, in any order. */
export const sameParents = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((p) => b.includes(p));

/** Why the stored file is not as `seen` says, or null while it still is. */
export function notAsSeen(seen: SeenExpectation, now: StoredNow | null): NotAsSeenReason | null {
  if (!now || now.trashed) return 'gone';
  if (now.id !== seen.id) return 'id';
  if (now.name !== seen.name) return 'name';
  if (!sameParents(now.parents, seen.parents)) return 'parents';
  if (seen.modifiedTime !== undefined && now.modifiedTime !== seen.modifiedTime) return 'modified';
  if (seen.sha256 !== undefined && now.sha256 !== seen.sha256) return 'content';
  if (seen.children !== undefined && (now.children ?? []).some((c) => !seen.children?.includes(c))) return 'children';
  return null;
}

/** A refusal of a write: the caller's one sentence for the person, the reason on its `cause`. */
export function notAsSeenError(reason: NotAsSeenReason, message: string, code: ErrorCode = 'conflict'): BowerError {
  const cause: NotAsSeenCause = { kind: 'not-as-seen', reason };
  return new BowerError(code, message, undefined, { cause });
}

/** Throws the caller's refusal unless the stored file is still as `seen` says. */
export function expectStillAsSeen(seen: SeenExpectation, now: StoredNow | null, message: string): void {
  const reason = notAsSeen(seen, now);
  if (reason === null) return;
  console.error(`Refused a write to ${seen.id}: ${reason}`);
  throw notAsSeenError(reason, message);
}

/** Which refusal an error is, by its typed `cause`, or null when it is not a still-as-seen refusal. */
export function notAsSeenReason(e: unknown): NotAsSeenReason | null {
  if (!(e instanceof BowerError) || typeof e.cause !== 'object' || e.cause === null) return null;
  const cause = e.cause as Partial<NotAsSeenCause>;
  return cause.kind === 'not-as-seen' && typeof cause.reason === 'string' ? cause.reason : null;
}
