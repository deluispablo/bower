/**
 * Write-once by the `bowerOp` stamp (ARCHITECTURE, mechanism map): every write Bower sends, the app's and a run's
 * alike, carries one `appProperties` key, `bowerOp`, set in the same request and overwritten by the next write
 * (https://developers.google.com/workspace/drive/api/guides/properties). The stamp names the write's intent, so it is an
 * idempotency key (as Stripe's: https://stripe.com/docs/api/idempotent_requests; RFC 9110 9.2.2 lets only idempotent
 * requests be repeated blindly):
 *
 * - the answer confirms the write: Drive gives the stored content's `md5Checksum` on the `files.create` or
 *   `files.update` answer when `fields` asks for it (https://developers.google.com/workspace/drive/api/reference/rest/v3/files),
 *   so no read follows a write to confirm it (`confirms`);
 * - a write with no answer, an unknown outcome (a 5xx) or a conflict is looked for by its stamp (`writeOnce`): found,
 *   it landed (the person's own write, never "changed somewhere else"); not found, the error stands. Never by a name,
 *   a substring or a text.
 */
import { BowerError } from '../types';
import { md5Hex, sha256Sync } from '../contracts/hashes';
import type { DriveFile, FencedDrive } from '../drive/drive-api';
import { isNoAnswer, isUnconfirmedWrite } from '../drive/transport';

export const STAMP = 'bowerOp';

/**
 * The stamp of one write: the first 32 hex characters of SHA-256(`<scope>:<intent>`), 128 bits (TL-P4-05 addendum 2).
 * Drive keeps at most 124 bytes for one property's key and value, so the intent is hashed, never written out.
 */
export const stampOf = (scope: string, intent: string): string => sha256Sync(`${scope}:${intent}`).slice(0, 32);

/** Whether the answer to a write says Drive stored exactly `bytes` (its `md5Checksum`, or its SHA-256 when it gives one). */
export function confirms(answer: DriveFile, bytes: Uint8Array): boolean {
  if (answer.md5Checksum !== undefined) return answer.md5Checksum === md5Hex(bytes);
  return answer.sha256 !== undefined && answer.sha256 === sha256Sync(bytes);
}

/** A write whose outcome is to be read back by its stamp: no answer, a 5xx, or a conflict its own landing may explain. */
const unsettled = (e: unknown): boolean => isNoAnswer(e) || isUnconfirmedWrite(e) || (e instanceof BowerError && e.code === 'conflict');

/**
 * Sends a write once with its stamp. With no answer, an unknown outcome or a conflict, it is looked for by that stamp
 * (`find`): what carries it is the write, landed; nothing, or a look that fails, leaves the error as it was.
 */
export async function writeOnce(stamp: string, send: (op: { [STAMP]: string }) => Promise<DriveFile>, find: (stamp: string) => Promise<DriveFile | null>): Promise<DriveFile> {
  try {
    return await send({ [STAMP]: stamp });
  } catch (e) {
    if (!unsettled(e)) throw e;
    let found: DriveFile | null;
    try {
      found = await find(stamp);
    } catch (again) {
      console.error(again);
      throw e;
    }
    if (!found) throw e;
    // It landed and only its answer was lost (or a retry met it): the same write, not a second one.
    console.error(e);
    return found;
  }
}

/** A stamp search: Drive's `appProperties has { key=... and value=... }`, in the Bin or not. */
export interface StampSearch {
  stamped(key: string, value: string): Promise<Array<{ file: DriveFile; trashed: boolean }>>;
}

/** The one file out of the Bin carrying `stamp`; null when none or more than one does. */
export async function byStamp(drive: StampSearch, stamp: string): Promise<DriveFile | null> {
  const found = (await drive.stamped(STAMP, stamp)).filter((f) => !f.trashed);
  return found.length === 1 ? (found[0]?.file ?? null) : null;
}

/** One of Bower's own folders, made once: stamped by its place and name, so a lost answer finds the folder that landed. */
export function makeFolder(w: FencedDrive, drive: StampSearch, parent: string, name: string): Promise<DriveFile> {
  return writeOnce(stampOf(parent, `folder:${name}`), (op) => w.createFolder(parent, name, op), (s) => byStamp(drive, s));
}

/** A text file made once: stamped by its place, name and bytes, and confirmed by its answer's checksum. */
export async function makeText(w: FencedDrive, drive: StampSearch, parent: string, name: string, text: string, props?: Record<string, string>): Promise<DriveFile> {
  return confirmed(await writeOnce(stampOf(parent, `${name}:${sha256Sync(text)}`), (op) => w.createText(parent, name, text, { ...props, ...op }), (s) => byStamp(drive, s)), text);
}

/** The file a write answered, when its checksum is that of `text`; otherwise the write is not confirmed. */
export function confirmed(file: DriveFile, text: string): DriveFile {
  if (confirms(file, new TextEncoder().encode(text))) return file;
  console.error(`Drive did not confirm the bytes of ${file.name} as sent`);
  throw new BowerError('unknown', 'Bower could not save what it did. Try again later.');
}
