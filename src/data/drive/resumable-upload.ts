/**
 * Sending one file with Drive's resumable protocol under a file id reserved
 * beforehand (TL-P2-05), so a file is never made twice:
 *
 * - With a saved session it first asks Drive how much arrived (after a
 *   reload) and sends the rest from there.
 * - An expired session restarts the file on a new session for the same
 *   reserved id, at most `MAX_RESTARTS` times per try.
 * - If Drive refuses the reserved id because a file already has it (the
 *   answer that made it was lost), the file is read back and checked instead.
 * - A file Drive answers with is accepted only with the same id, size and
 *   SHA-256 as the bytes that were meant, wherever it is now.
 *
 * Adapted from the original Bower app (github.com/deluispablo/bower,
 * app/src/upload-queue.ts, the protocol part; FSL-1.1-MIT, owner's copyright).
 */
import { BowerError } from '../types';
import { happened } from '../spine/write-once';
import { RESUMABLE_UNIT, type DriveFile, type ResumableDrive, type ResumableTarget, type SessionStatus } from './drive-api';

/** Drive wants chunks in multiples of 256 KiB; 8 MiB keeps requests few. */
export const RESUMABLE_CHUNK_BYTES = 32 * RESUMABLE_UNIT;

/** Drive kept dropping or refusing the upload's session. */
const KEPT_STOPPING_TEXT = 'Google Drive kept stopping this upload. Try again.';

/** Times one file may restart after its session expired, per try. */
export const MAX_RESTARTS = 2;

/** The Drive calls a resumable upload needs. */

/** A target whose content hash is known, so what Drive has can be checked. */
export type CheckedTarget = ResumableTarget & { sha256: string };

/** What the protocol reports while it sends one file. */
export interface UploadHooks {
  /** A session was opened (first time, or after one expired); keep it before sending. */
  onSession: (session: string) => Promise<void>;
  /** Drive holds this many bytes; keep it before sending more. */
  onConfirmed: (bytes: number) => Promise<void>;
  /** Bytes Drive holds so far, for the progress bar. */
  onProgress: (sent: number) => void;
  signal?: AbortSignal;
}

/** Bytes Drive holds, from a 308's `Range: bytes=0-N` (none: 0). */
export function confirmedFrom(range: string | null): number {
  const match = /bytes=0-(\d+)/.exec(range ?? '');
  return match?.[1] !== undefined ? Number(match[1]) + 1 : 0;
}

/** The `Content-Range` of a chunk from `start` to `end` (exclusive) of `size` bytes. */
export function chunkRange(start: number, end: number, size: number): string {
  return size === 0 || end <= start ? `bytes */${size}` : `bytes ${start}-${end - 1}/${size}`;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('The upload stopped.', 'AbortError');
}

/**
 * The file Drive made is the one this upload meant: same id, size and content.
 * Its place may have changed since: filed by a tidy-up or moved by the person,
 * it still arrived (write-once's `happened`, never `landed`: TL-P4-24 addendum 10).
 */
function check(target: Pick<CheckedTarget, 'id' | 'size' | 'sha256'>, file: DriveFile): DriveFile {
  if (happened({ id: target.id }, file) && (file.size === undefined || file.size === target.size) && file.sha256 === target.sha256) return file;
  console.error('A reserved upload id holds a different file', { want: { id: target.id, size: target.size }, got: { id: file.id, size: file.size, checked: file.sha256 !== undefined } });
  throw new BowerError('unknown', 'Google Drive has a different file where this one should go. Remove this one and add it again.');
}

/** Drive refused the reserved id: a file has it. Read it back instead of making another. */
async function readBack(drive: ResumableDrive, target: CheckedTarget, signal?: AbortSignal): Promise<DriveFile> {
  return check(target, await drive.getUploaded(target.id, signal));
}

/**
 * The file Drive already made under a reserved id, checked as `sendResumable`
 * checks it; `null` when Drive has none there (or only in the Bin). For an
 * upload whose bytes this device lost: one Drive made before its reply was
 * lost is sent, not one to choose again.
 */
export async function arrivedFile(drive: ResumableDrive, target: Pick<CheckedTarget, 'id' | 'size' | 'sha256'>, signal?: AbortSignal): Promise<DriveFile | null> {
  let file: DriveFile;
  try {
    file = await drive.getUploaded(target.id, signal);
  } catch (e) {
    if (e instanceof BowerError && e.code === 'not-found') return null;
    throw e;
  }
  return check(target, file);
}

const isConflict = (e: unknown): boolean => e instanceof BowerError && e.code === 'conflict';

/**
 * Sends `upload.body` and answers the file Drive made, under `upload.id`.
 * Rejects with a `BowerError`, or an `AbortError` when `hooks.signal` stops it.
 */
export async function sendResumable(
  drive: ResumableDrive,
  upload: CheckedTarget & { body: Blob; session: string | null },
  hooks: UploadHooks,
  chunkSize: number = RESUMABLE_CHUNK_BYTES,
): Promise<DriveFile> {
  const { body, session: saved, ...target } = upload;
  const { size } = target;
  let session = saved;
  let restarts = 0;
  let offset = 0;

  async function open(): Promise<string> {
    const opened = await drive.openResumable(target);
    await hooks.onSession(opened);
    await hooks.onConfirmed(0);
    return opened;
  }

  try {
    throwIfAborted(hooks.signal);
    let status: SessionStatus | null = session === null ? null : await drive.sessionStatus(session, size);
    let afterChunk = false;
    for (;;) {
      throwIfAborted(hooks.signal);
      if (status?.kind === 'done') {
        hooks.onProgress(size);
        // An answer without the content's checksum is checked by reading the file back.
        return status.file.sha256 === undefined ? await readBack(drive, target, hooks.signal) : check(target, status.file);
      }
      if (status === null || session === null || status.kind === 'expired') {
        if (status !== null) {
          if (restarts >= MAX_RESTARTS) {
            console.error(`A resumable upload expired ${restarts + 1} times`);
            throw new BowerError('unknown', KEPT_STOPPING_TEXT);
          }
          restarts += 1;
        }
        session = await open();
        offset = 0;
      } else {
        if (afterChunk && size > 0 && status.confirmed <= offset) {
          console.error(`A resumable upload made no progress at ${offset} of ${size}`);
          throw new BowerError('unknown', KEPT_STOPPING_TEXT);
        }
        offset = status.confirmed;
        await hooks.onConfirmed(offset);
      }
      hooks.onProgress(offset);
      throwIfAborted(hooks.signal);
      const end = Math.min(offset + chunkSize, size);
      status = await drive.putChunk(session, offset, body.slice(offset, end), size, hooks.signal);
      afterChunk = true;
    }
  } catch (e) {
    if (isConflict(e)) {
      const file = await readBack(drive, target, hooks.signal);
      hooks.onProgress(size);
      return file;
    }
    throw e;
  }
}
