/**
 * The note-edit contract (TL-P2-20, B.2): `applyChanges` is the one pure author of an `edit-text`'s
 * after-text. Inert stub of the final API: every edit is refused and every check fails closed.
 */
import type { ChangeEntry } from '../types';
import type { OwnershipFailure } from '../vault/ownership-format';
import type { Change, EditEntry, EditText, Rename, RuleAdd, RuleRemove } from './run-manifest';

/** Files larger than 1 MiB are never edited (TL-P2-20 rule 6). */
export const EDIT_FILE_LIMIT = 1024 * 1024;

export type EditRefusal = OwnershipFailure | 'too-large' | 'not-bower' | 'unsupported' | 'field' | 'order' | 'invariant' | 'unchanged';
export type EditResult = { ok: true; text: string; bytes: Uint8Array } | { ok: false; reason: EditRefusal };
/** The low-level splice, replaceable only so a test can inject a faulty one (R4-3 m-g). */
export type Authors = { splice: (text: string, at: number, insert: string) => string };
export type ReadBack = 'applied' | 'possible-effect' | 'unresolved';
export type Observed = { fileId: string; name: string; parents: string[]; trashed: boolean; bytes: Uint8Array };

export function timelineDate(requestedAt: number): string | null { void requestedAt; return null; }
export function entryOk(entry: EditEntry): boolean { void entry; return false; }
export function renameOk(rename: Rename): boolean { void rename; return false; }
export function ruleAddOk(add: RuleAdd): boolean { void add; return false; }
export function ruleRemoveOk(remove: RuleRemove): boolean { void remove; return false; }
export function renamesFor(changes: readonly ChangeEntry[], taken: ReadonlySet<string> = new Set()): Rename[] { void changes; void taken; return []; }

export function applyChangesUsing(before: Uint8Array, changes: readonly Change[], authors: Authors): EditResult {
  void before; void changes; void authors;
  return { ok: false, reason: 'unsupported' };
}
export function applyChanges(before: Uint8Array, changes: readonly Change[]): EditResult {
  return applyChangesUsing(before, changes, { splice: (text, at, insert) => text.slice(0, at) + insert + text.slice(at) });
}
export async function recheckEdit(effect: EditText, bytes: Uint8Array): Promise<'ok' | 'conflict'> {
  void effect; void bytes;
  return Promise.resolve('conflict');
}
export async function readBackEdit(effect: EditText, observed: Observed): Promise<ReadBack> {
  void effect; void observed;
  return Promise.resolve('unresolved');
}
export async function savedLinkKey(fileId: string): Promise<string> {
  void fileId;
  return Promise.resolve('');
}
