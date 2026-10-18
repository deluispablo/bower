/**
 * Which operations of a batch may be in flight together (TL-P4-08 addendum 6, drive-calls-cut).
 *
 * An operation waits for what it depends on (`dependsOn`: a folder before what goes into it, a note before a line
 * that cites it) and for any earlier operation of the plan it shares a thing with: the same file, or the same folder
 * when one of them makes something there (so a name taken there is seen). Two moves into one folder share nothing.
 * An operation kind this file does not know claims everything, so it runs alone and in plan order.
 *
 * How many at once: `POOL`, shared with the runner adapter's write limiter. Each write has its own fence.
 * Drive edits cost 50 quota units; four concurrent writes are well inside the per-user quota, and the transport
 * retries 403/429 rate limits with backoff (https://developers.google.com/workspace/drive/api/guides/limits).
 */
import type { OperationV2 } from '../contracts/run-manifest';

export const POOL = 4;

export interface Claim {
  key: string;
  /** Two shared claims of one key do not wait on each other. */
  shared: boolean;
}

/** What going into a folder claims: the folder as a place (alone for a create, shared for a move) and the folder itself, shared. */
const intoClaims = (parent: { fileId: string } | { createdBy: string }, makes: boolean): Claim[] => {
  const id = 'fileId' in parent ? parent.fileId : parent.createdBy;
  return [
    { key: `dir:${id}`, shared: !makes },
    { key: `file:${id}`, shared: true },
  ];
};

const ALL: Claim[] = [{ key: '*', shared: false }];

/** What an operation touches, for ordering against the operations before it. */
export function claimsOf(op: OperationV2): Claim[] {
  const e = op.effect;
  switch (e.kind) {
    case 'create-folder':
    case 'create-text':
      return intoClaims(e.parent, true);
    case 'move':
      return [{ key: `file:${e.before.fileId}`, shared: false }, ...intoClaims(e.parent, false)];
    case 'bin':
    case 'edit-text':
      return [{ key: `file:${e.before.fileId}`, shared: false }];
    case 'write-runner-json':
      return e.before === null ? intoClaims(e.parent, true) : [{ key: `file:${e.before.fileId}`, shared: false }];
    default:
      return ALL;
  }
}

const clash = (a: Claim[], b: Claim[]): boolean => a.some((x) => b.some((y) => (x.key === y.key || x.key === '*' || y.key === '*') && !(x.shared && y.shared)));

/** Whether two operations cannot be in flight together. */
export const conflicts = (a: OperationV2, b: OperationV2): boolean => clash(claimsOf(a), claimsOf(b));

/** What an operation waits for: its `dependsOn`, and the operation that made the folder it goes into. */
export function needsOf(op: OperationV2): string[] {
  const e = op.effect;
  const made = 'parent' in e && 'createdBy' in e.parent ? [e.parent.createdBy] : [];
  return [...op.dependsOn, ...made.filter((id) => !op.dependsOn.includes(id))];
}
